import type { LearningStateRepository } from "../learning-state/repository";

export const LOCAL_USER_ID = "local-user";
export const LOCAL_SESSION_COOKIE = "agent-learning-local-session";
export const LOCAL_SESSION_VALUE = "local-mode";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function assertLocalAuthBinding(host: string | undefined): void {
  const binding = host?.trim().toLowerCase() || "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(binding)) {
    throw new Error(
      `Local no-login mode must bind to a loopback host; received ${binding}.`,
    );
  }
}

export function ensureLocalUser(repository: LearningStateRepository) {
  const existing = repository.getUser(LOCAL_USER_ID);
  if (existing) {
    if (existing.mode !== "local") {
      throw new Error("The fixed local identity is already owned by another mode.");
    }
    return existing;
  }

  return repository.createUser({
    id: LOCAL_USER_ID,
    mode: "local",
    displayName: "本地学习者",
  });
}
