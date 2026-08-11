import { getLearningStateStore } from "../../../lib/learning-state";
import { recordOperationalMetric } from "../../../lib/observability";
import {
  type DeploymentMode,
  parseRuntimeConfig,
} from "../../../modules/runtime/runtime-config";
import {
  StateConflictError,
  StateValidationError,
  type LearningStateRepository,
} from "../../../modules/learning-state/repository";
import {
  CSRF_COOKIE,
  getRequestUserAsync,
  readCookie,
} from "../../../modules/auth/request-auth";
import { LOCAL_SESSION_VALUE } from "../../../modules/auth/local-auth";
import { stateWriteRateLimiter } from "../../../modules/auth/rate-limit";
import type { PrivacyFirstMonitor } from "../../../modules/observability/privacy-monitor";

export const dynamic = "force-dynamic";

function jsonError(error: unknown): Response {
  if (error instanceof StateValidationError) {
    return Response.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof StateConflictError) {
    return Response.json({ error: error.message }, { status: 409 });
  }
  return Response.json({ error: "学习状态暂时不可用。" }, { status: 500 });
}

function hasValidCsrfToken(request: Request, mode: DeploymentMode): boolean {
  const header = request.headers.get("x-csrf-token");
  const cookie = readCookie(request, CSRF_COOKIE);
  if (!header || !cookie || header !== cookie) return false;
  return mode !== "local" || header === LOCAL_SESSION_VALUE;
}

async function readPayload(request: Request): Promise<Record<string, unknown>> {
  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new StateValidationError("请求体必须是 JSON 对象。");
    }
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof StateValidationError) throw error;
    throw new StateValidationError("请求体不是有效 JSON。");
  }
}

function asString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new StateValidationError(`${key} 必须是字符串。`);
  }
  return value;
}

function asOptionalString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  return asString(payload, key);
}

function asOptionalInteger(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new StateValidationError(`${key} 必须是整数。`);
  }
  return value;
}

function asBoolean(payload: Record<string, unknown>, key: string): boolean {
  const value = payload[key];
  if (typeof value !== "boolean") {
    throw new StateValidationError(`${key} 必须是布尔值。`);
  }
  return value;
}

function stateResponse(repository: LearningStateRepository, userId: string) {
  const state = repository.getStateSnapshot(userId);
  if (!state) return Response.json({ error: "用户不存在。" }, { status: 401 });
  return Response.json({ user: state.user, state });
}

type RequestMonitor = Pick<PrivacyFirstMonitor, "record">;

async function executeStateRequest(
  request: Request,
  repository: LearningStateRepository,
  mode: DeploymentMode,
): Promise<Response> {
  try {
    const user = await getRequestUserAsync(request, repository, mode);
    if (!user) return Response.json({ error: "需要登录。" }, { status: 401 });

    if (request.method === "GET") {
      return stateResponse(repository, user.id);
    }

    const rateLimit = stateWriteRateLimiter.consume(`state:${user.id}`);
    if (!rateLimit.allowed) {
      return Response.json(
        { error: "请求过于频繁，请稍后再试。" },
        {
          status: 429,
          headers: { "retry-after": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    if (!hasValidCsrfToken(request, mode)) {
      return Response.json(
        { error: "缺少或无效的 CSRF token。" },
        { status: 403 },
      );
    }

    const payload = await readPayload(request);
    const action = asString(payload, "action");

    if (action === "item-progress") {
      const itemProgress = repository.saveItemProgress({
        userId: user.id,
        itemId: asString(payload, "itemId"),
        status: asString(payload, "status") as
          "not_started" | "in_progress" | "completed",
        position: asOptionalInteger(payload, "position"),
      });
      return Response.json({
        itemProgress,
        state: repository.getStateSnapshot(user.id),
      });
    }

    if (action === "task-progress") {
      const taskProgress = repository.saveStageTaskProgress({
        userId: user.id,
        taskId: asString(payload, "taskId"),
        completed: asBoolean(payload, "completed"),
      });
      return Response.json({
        taskProgress,
        state: repository.getStateSnapshot(user.id),
      });
    }

    if (action === "bookmark") {
      const itemId = asString(payload, "itemId");
      const bookmarked = asBoolean(payload, "bookmarked");
      const bookmark = bookmarked
        ? repository.setBookmark({ userId: user.id, itemId })
        : null;
      if (!bookmarked) repository.removeBookmark(user.id, itemId);
      return Response.json({
        bookmark,
        bookmarks: repository.listBookmarks(user.id),
      });
    }

    if (action === "note") {
      const note = repository.saveNote({
        id: asOptionalString(payload, "id"),
        userId: user.id,
        scopeType: asString(payload, "scopeType") as "item" | "stage",
        scopeId: asString(payload, "scopeId"),
        body: asString(payload, "body"),
      });
      return Response.json({ note });
    }

    if (action === "note-delete") {
      const deleted = repository.deleteNote(
        user.id,
        asString(payload, "noteId"),
      );
      return Response.json({ deleted });
    }

    if (action === "outcome") {
      const outcome = repository.createStageOutcome({
        id: asOptionalString(payload, "id"),
        userId: user.id,
        stageId: asString(payload, "stageId"),
        kind: asString(payload, "kind") as "repository" | "demo" | "reflection",
        url: asOptionalString(payload, "url"),
        summary: asOptionalString(payload, "summary"),
      });
      return Response.json({ outcome });
    }

    if (action === "outcome-delete") {
      const deleted = repository.deleteStageOutcome(
        user.id,
        asString(payload, "outcomeId"),
      );
      return Response.json({ deleted });
    }

    if (action === "confirm-stage") {
      return Response.json({
        stage: repository.confirmStageCompletion(
          user.id,
          asString(payload, "stageId"),
        ),
      });
    }

    throw new StateValidationError(`不支持的状态操作：${action}`);
  } catch (error) {
    return jsonError(error);
  }
}

export async function handleStateRequest(
  request: Request,
  repository: LearningStateRepository,
  mode: DeploymentMode,
  monitor?: RequestMonitor,
): Promise<Response> {
  const response = await executeStateRequest(request, repository, mode);
  if (response.status >= 400) {
    (monitor?.record ?? recordOperationalMetric)({
      event: "request_error",
      scope: "learning-state",
      outcome: response.status >= 500 ? "server-error" : "client-error",
    });
  }
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const store = getLearningStateStore();
  return handleStateRequest(
    request,
    store.repository,
    parseRuntimeConfig(process.env).mode,
    undefined,
  );
}

export async function POST(request: Request): Promise<Response> {
  const store = getLearningStateStore();
  return handleStateRequest(
    request,
    store.repository,
    parseRuntimeConfig(process.env).mode,
    undefined,
  );
}
