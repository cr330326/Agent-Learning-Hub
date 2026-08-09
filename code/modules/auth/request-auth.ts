import { createHash, randomBytes } from "node:crypto";

import type { DeploymentMode } from "../runtime/runtime-config";
import type {
  LearningStateRepository,
  UserRecord,
} from "../learning-state/repository";
import { getBetterAuth } from "./better-auth";
import { ensureLocalUser, LOCAL_SESSION_COOKIE } from "./local-auth";
import { CLOUD_SESSION_COOKIE } from "./auth-constants";

export { CLOUD_SESSION_COOKIE, CSRF_COOKIE } from "./auth-constants";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function readCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const key = entry.slice(0, separator).trim();
    if (key !== name) continue;
    return decodeURIComponent(entry.slice(separator + 1).trim());
  }
  return null;
}

export function getRequestUser(
  request: Request,
  repository: LearningStateRepository,
  mode: DeploymentMode,
): UserRecord | null {
  if (mode === "local") {
    return ensureLocalUser(repository);
  }

  const token = readCookie(request, CLOUD_SESSION_COOKIE);
  if (!token) return null;
  const session = repository.getSessionByTokenHash(hashSessionToken(token));
  if (!session) return null;
  if (Date.parse(session.expiresAt) <= Date.now()) {
    repository.deleteSession(session.userId, session.id);
    return null;
  }
  return repository.getUser(session.userId);
}

export async function getRequestUserAsync(
  request: Request,
  repository: LearningStateRepository,
  mode: DeploymentMode,
): Promise<UserRecord | null> {
  if (mode === "local") {
    return ensureLocalUser(repository);
  }

  try {
    const session = await getBetterAuth().api.getSession({
      headers: request.headers,
    });
    if (!session) return null;
    return repository.getUser(session.user.id);
  } catch {
    // Auth configuration and cookie verification failures fail closed.
    return null;
  }
}

export function localSessionCookieName(): string {
  return LOCAL_SESSION_COOKIE;
}
