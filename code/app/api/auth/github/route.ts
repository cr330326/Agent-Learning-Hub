import { getBetterAuth } from "../../../../modules/auth/better-auth";
import { recordOperationalMetric } from "../../../../lib/observability";
import { LOCAL_SESSION_COOKIE } from "../../../../modules/auth/local-auth";
import {
  CLOUD_SESSION_COOKIE,
  CSRF_COOKIE,
  createSessionToken,
  getRequestUser,
  hashSessionToken,
  readCookie,
} from "../../../../modules/auth/request-auth";
import {
  buildGitHubAuthorizeUrl,
  createOAuthState,
  fetchGitHubIdentity,
  GitHubOAuthError,
  type Fetcher,
  type GitHubOAuthConfig,
} from "../../../../modules/auth/github-oauth";
import {
  StateConflictError,
  type LearningStateRepository,
} from "../../../../modules/learning-state/repository";
import {
  getRequestRateLimitKey,
  githubLoginRateLimiter,
} from "../../../../modules/auth/rate-limit";
import { parseRuntimeConfig } from "../../../../modules/runtime/runtime-config";

export const dynamic = "force-dynamic";

const OAUTH_STATE_COOKIE = "agent-learning-oauth-state";

function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly?: boolean; maxAge?: number } = {},
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    options.httpOnly ? "HttpOnly" : "",
    options.maxAge === undefined ? "" : `Max-Age=${options.maxAge}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function redirectResponse(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function appendCloudCookies(
  response: Response,
  sessionToken: string,
  csrfToken: string,
) {
  response.headers.append(
    "set-cookie",
    serializeCookie(CLOUD_SESSION_COOKIE, sessionToken, { httpOnly: true }),
  );
  response.headers.append(
    "set-cookie",
    serializeCookie(CSRF_COOKIE, csrfToken),
  );
  response.headers.append(
    "set-cookie",
    serializeCookie(OAUTH_STATE_COOKIE, "", { maxAge: 0 }),
  );
}

export async function handleGitHubLoginRequest(
  config: GitHubOAuthConfig,
): Promise<Response> {
  const state = createOAuthState();
  const response = redirectResponse(buildGitHubAuthorizeUrl(config, state));
  response.headers.append(
    "set-cookie",
    serializeCookie(OAUTH_STATE_COOKIE, state, { httpOnly: true }),
  );
  return response;
}

export async function handleGitHubCallbackRequest(
  request: Request,
  repository: LearningStateRepository,
  config: GitHubOAuthConfig,
  fetcher?: Fetcher,
): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return redirectResponse(`/login?error=${encodeURIComponent(error)}`);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = readCookie(request, OAUTH_STATE_COOKIE);
  if (!code || !state || !storedState || state !== storedState) {
    return Response.json({ error: "OAuth state 校验失败。" }, { status: 400 });
  }

  try {
    const identity = await fetchGitHubIdentity(code, config, fetcher);
    let user = repository.getUserByGithubId(identity.githubId);
    if (user) {
      user = repository.updateUserProfile(user.id, {
        displayName: identity.displayName,
      });
    } else {
      user = repository.createUser({
        id: `github-${identity.githubId}`,
        mode: "cloud",
        githubId: identity.githubId,
        displayName: identity.displayName,
      });
    }
    try {
      repository.createAccount({
        userId: user.id,
        provider: "github",
        providerAccountId: identity.githubId,
      });
    } catch (accountError) {
      if (!(accountError instanceof StateConflictError)) throw accountError;
    }

    const sessionToken = createSessionToken();
    repository.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    const csrfToken = createSessionToken();
    const response = redirectResponse(
      new URL("/learning", request.url).toString(),
    );
    appendCloudCookies(response, sessionToken, csrfToken);
    return response;
  } catch (caught) {
    const message =
      caught instanceof GitHubOAuthError ? "github-oauth" : "login-failed";
    return redirectResponse(`/login?error=${message}`);
  }
}

export async function handleLogoutRequest(
  request: Request,
  repository: LearningStateRepository,
  mode: "cloud" | "local",
): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "退出登录需要 POST。" }, { status: 405 });
  }
  const csrf = request.headers.get("x-csrf-token");
  const csrfCookie = readCookie(request, CSRF_COOKIE);
  if (!csrf || !csrfCookie || csrf !== csrfCookie) {
    return Response.json(
      { error: "缺少或无效的 CSRF token。" },
      { status: 403 },
    );
  }
  const user = getRequestUser(request, repository, mode);
  if (user) {
    const token = readCookie(request, CLOUD_SESSION_COOKIE);
    if (token) {
      const session = repository.getSessionByTokenHash(hashSessionToken(token));
      if (session) repository.deleteSession(user.id, session.id);
    }
  }
  const response = Response.json({ loggedOut: true });
  for (const cookieName of [
    CLOUD_SESSION_COOKIE,
    LOCAL_SESSION_COOKIE,
    CSRF_COOKIE,
  ]) {
    response.headers.append(
      "set-cookie",
      serializeCookie(cookieName, "", { maxAge: 0 }),
    );
  }
  return response;
}

export async function GET(request: Request): Promise<Response> {
  if (parseRuntimeConfig(process.env).mode !== "cloud") {
    return Response.json(
      { error: "GitHub 登录仅在云端模式可用。" },
      { status: 404 },
    );
  }
  const decision = githubLoginRateLimiter.consume(
    getRequestRateLimitKey(request),
  );
  if (!decision.allowed) {
    recordOperationalMetric({
      event: "login_failure",
      scope: "github-login",
      outcome: "client-error",
    });
    return Response.json(
      { error: "登录请求过于频繁，请稍后再试。" },
      {
        status: 429,
        headers: { "retry-after": String(decision.retryAfterSeconds) },
      },
    );
  }
  try {
    const response = await getBetterAuth().api.signInSocial({
      body: {
        provider: "github",
        callbackURL: new URL("/learning", request.url).toString(),
        errorCallbackURL: new URL("/login", request.url).toString(),
      },
      headers: request.headers,
      asResponse: true,
    });
    const location = response.headers.get("location");
    if (!location) return response;
    const redirect = new Response(null, {
      status: 302,
      headers: { location },
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) redirect.headers.set("set-cookie", setCookie);
    return redirect;
  } catch {
    recordOperationalMetric({
      event: "login_failure",
      scope: "github-login",
      outcome: "failure",
    });
    return Response.json({ error: "GitHub 登录暂时不可用。" }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  if (parseRuntimeConfig(process.env).mode !== "cloud") {
    return Response.json(
      { error: "云端身份接口仅在 cloud 模式可用。" },
      { status: 404 },
    );
  }
  try {
    return await getBetterAuth().api.signOut({
      headers: request.headers,
      asResponse: true,
    });
  } catch {
    recordOperationalMetric({
      event: "request_error",
      scope: "github-login",
      outcome: "server-error",
    });
    return Response.json({ error: "退出登录失败。" }, { status: 503 });
  }
}
