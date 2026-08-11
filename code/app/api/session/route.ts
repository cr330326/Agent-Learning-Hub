import { getLearningStateStore } from "../../../lib/learning-state";
import {
  parseRuntimeConfig,
  type DeploymentMode,
} from "../../../modules/runtime/runtime-config";
import {
  CSRF_COOKIE,
  createSessionToken,
  getRequestUserAsync,
  readCookie,
} from "../../../modules/auth/request-auth";
import {
  LOCAL_SESSION_COOKIE,
  LOCAL_SESSION_VALUE,
} from "../../../modules/auth/local-auth";
import type { LearningStateRepository } from "../../../modules/learning-state/repository";

export const dynamic = "force-dynamic";

function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly?: boolean; secure?: boolean } = {},
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    options.httpOnly ? "HttpOnly" : "",
    options.secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function requestUsesHttps(request: Request): boolean {
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  return (
    forwardedProtocol === "https" || new URL(request.url).protocol === "https:"
  );
}

export async function handleSessionRequest(
  request: Request,
  repository: LearningStateRepository,
  mode: DeploymentMode,
): Promise<Response> {
  const user = await getRequestUserAsync(request, repository, mode);
  const existingCsrfToken = readCookie(request, CSRF_COOKIE);
  const csrfToken =
    mode === "local"
      ? LOCAL_SESSION_VALUE
      : user
        ? (existingCsrfToken ?? createSessionToken())
        : null;
  const response = Response.json({
    authenticated: user !== null,
    mode,
    user,
    csrfToken,
  });

  if (mode === "local") {
    // Local mode is deliberately loopback-only and is commonly served over
    // plain HTTP. A Secure cookie would be silently dropped by browsers there,
    // which prevents the CSRF-protected learning-state writes from working.
    const secure = requestUsesHttps(request);
    response.headers.append(
      "set-cookie",
      serializeCookie(LOCAL_SESSION_COOKIE, LOCAL_SESSION_VALUE, {
        httpOnly: true,
        secure,
      }),
    );
    response.headers.append(
      "set-cookie",
      serializeCookie(CSRF_COOKIE, LOCAL_SESSION_VALUE, { secure }),
    );
  } else if (csrfToken && !existingCsrfToken) {
    response.headers.append(
      "set-cookie",
      serializeCookie(CSRF_COOKIE, csrfToken, {
        secure:
          process.env.NODE_ENV === "production" ||
          process.env.BETTER_AUTH_URL?.startsWith("https://") === true,
      }),
    );
  }

  return response;
}

export async function GET(request: Request): Promise<Response> {
  const store = getLearningStateStore();
  return handleSessionRequest(
    request,
    store.repository,
    parseRuntimeConfig(process.env).mode,
  );
}
