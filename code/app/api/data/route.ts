import { getLearningStateStore } from "../../../lib/learning-state";
import { recordOperationalMetric } from "../../../lib/observability";
import {
  exportLearningState,
  renderNotesMarkdown,
} from "../../../modules/learning-state/data-export";
import {
  StateValidationError,
  type LearningStateRepository,
} from "../../../modules/learning-state/repository";
import {
  parseRuntimeConfig,
  type DeploymentMode,
} from "../../../modules/runtime/runtime-config";
import {
  CLOUD_SESSION_COOKIE,
  CSRF_COOKIE,
  getRequestUserAsync,
  readCookie,
} from "../../../modules/auth/request-auth";
import {
  LOCAL_SESSION_COOKIE,
  LOCAL_SESSION_VALUE,
} from "../../../modules/auth/local-auth";
import { stateWriteRateLimiter } from "../../../modules/auth/rate-limit";
import type { PrivacyFirstMonitor } from "../../../modules/observability/privacy-monitor";

export const dynamic = "force-dynamic";

function csrfIsValid(request: Request, mode: DeploymentMode): boolean {
  const header = request.headers.get("x-csrf-token");
  const cookie = readCookie(request, CSRF_COOKIE);
  return Boolean(
    header &&
    cookie &&
    header === cookie &&
    (mode !== "local" || header === LOCAL_SESSION_VALUE),
  );
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

async function readConfirmation(request: Request): Promise<string> {
  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error();
    }
    const confirmation = (payload as { confirmation?: unknown }).confirmation;
    if (typeof confirmation !== "string") throw new Error();
    return confirmation;
  } catch {
    throw new StateValidationError("删除账户需要明确的确认文本。");
  }
}

type RequestMonitor = Pick<PrivacyFirstMonitor, "record">;

async function executeDataRequest(
  request: Request,
  repository: LearningStateRepository,
  mode: DeploymentMode,
): Promise<Response> {
  const user = await getRequestUserAsync(request, repository, mode);
  if (!user) return Response.json({ error: "需要登录。" }, { status: 401 });

  if (request.method === "GET") {
    const snapshot = repository.getStateSnapshot(user.id);
    if (!snapshot)
      return Response.json({ error: "用户不存在。" }, { status: 401 });
    const format = new URL(request.url).searchParams.get("format");
    if (format === "notes") {
      return new Response(renderNotesMarkdown(snapshot), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition":
            'attachment; filename="agent-learning-notes.md"',
        },
      });
    }
    return new Response(JSON.stringify(exportLearningState(snapshot)), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition":
          'attachment; filename="agent-learning-state.json"',
      },
    });
  }

  if (request.method !== "DELETE") {
    return Response.json({ error: "不支持的请求方法。" }, { status: 405 });
  }
  const rateLimit = stateWriteRateLimiter.consume(`account-delete:${user.id}`);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "请求过于频繁，请稍后再试。" },
      {
        status: 429,
        headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  if (!csrfIsValid(request, mode)) {
    return Response.json(
      { error: "缺少或无效的 CSRF token。" },
      { status: 403 },
    );
  }

  try {
    const confirmation = await readConfirmation(request);
    if (confirmation !== "DELETE MY ACCOUNT") {
      throw new StateValidationError(
        '删除账户必须输入 "DELETE MY ACCOUNT" 以确认。',
      );
    }
    const deleted = repository.deleteUser(user.id);
    if (!deleted)
      return Response.json({ error: "用户不存在。" }, { status: 404 });
    const response = Response.json({ deleted: true });
    response.headers.append("set-cookie", clearCookie(CLOUD_SESSION_COOKIE));
    response.headers.append("set-cookie", clearCookie(LOCAL_SESSION_COOKIE));
    response.headers.append("set-cookie", clearCookie(CSRF_COOKIE));
    return response;
  } catch (error) {
    if (error instanceof StateValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ error: "删除账户失败。" }, { status: 500 });
  }
}

export async function handleDataRequest(
  request: Request,
  repository: LearningStateRepository,
  mode: DeploymentMode,
  monitor?: RequestMonitor,
): Promise<Response> {
  const response = await executeDataRequest(request, repository, mode);
  if (response.status >= 400) {
    (monitor?.record ?? recordOperationalMetric)({
      event: "request_error",
      scope: "data-export",
      outcome: response.status >= 500 ? "server-error" : "client-error",
    });
  }
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const store = getLearningStateStore();
  return handleDataRequest(
    request,
    store.repository,
    parseRuntimeConfig(process.env).mode,
    undefined,
  );
}

export async function DELETE(request: Request): Promise<Response> {
  const store = getLearningStateStore();
  return handleDataRequest(
    request,
    store.repository,
    parseRuntimeConfig(process.env).mode,
    undefined,
  );
}
