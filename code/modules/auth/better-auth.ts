import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import type { OAuth2Tokens } from "better-auth";
import type Database from "better-sqlite3";

import { getLearningStateStore } from "../../lib/learning-state";
import { CLOUD_SESSION_COOKIE } from "./auth-constants";
import {
  createLearningStateBetterAuthAdapter,
  stableGithubUserIdFromEmail,
} from "./better-auth-adapter";

export class BetterAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetterAuthConfigurationError";
  }
}

function requiredEnvironmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): string {
  const value = environment[key]?.trim();
  if (!value) {
    throw new BetterAuthConfigurationError(
      `${key} is required for cloud auth.`,
    );
  }
  return value;
}

function getBaseUrl(
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const value =
    environment.BETTER_AUTH_URL?.trim() || environment.APP_URL?.trim();
  return value ? value.replace(/\/$/, "") : undefined;
}

async function getMinimumGithubUserInfo(token: OAuth2Tokens) {
  if (!token.accessToken) return null;
  const response = await fetch("https://api.github.com/user", {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token.accessToken}`,
      "user-agent": "agent-learning-hub",
    },
  });
  if (!response.ok) return null;
  const profile: unknown = await response.json();
  if (!profile || typeof profile !== "object") return null;
  const value = profile as {
    id?: unknown;
    login?: unknown;
    name?: unknown;
    avatar_url?: unknown;
  };
  if (
    (typeof value.id !== "number" && typeof value.id !== "string") ||
    typeof value.login !== "string"
  ) {
    return null;
  }
  const githubId = String(value.id);
  const displayName =
    typeof value.name === "string" && value.name.trim()
      ? value.name.trim()
      : value.login;
  return {
    user: {
      id: githubId,
      name: displayName.slice(0, 160),
      // The application deliberately does not request or persist GitHub email.
      email: `${githubId}@github.invalid`,
      emailVerified: false,
      ...(typeof value.avatar_url === "string"
        ? { image: value.avatar_url }
        : {}),
    },
    data: { id: githubId, login: value.login },
  };
}

export function buildBetterAuthOptions(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): BetterAuthOptions {
  const baseURL = getBaseUrl(environment);
  const secret = requiredEnvironmentValue(environment, "BETTER_AUTH_SECRET");
  const githubClientId = requiredEnvironmentValue(
    environment,
    "GITHUB_CLIENT_ID",
  );
  const githubClientSecret = requiredEnvironmentValue(
    environment,
    "GITHUB_CLIENT_SECRET",
  );
  const secureCookies = baseURL?.startsWith("https://") ?? false;

  return {
    secret,
    ...(baseURL ? { baseURL, trustedOrigins: [baseURL] } : {}),
    account: {
      // OAuth state is signed and kept in a short-lived cookie. No verification
      // table is needed for this single-provider flow.
      storeStateStrategy: "cookie",
      accountLinking: {
        enabled: false,
      },
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    advanced: {
      useSecureCookies: secureCookies,
      cookies: {
        session_token: {
          name: CLOUD_SESSION_COOKIE,
          attributes: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
          },
        },
      },
      database: {
        generateId: "uuid",
      },
    },
    socialProviders: {
      github: {
        clientId: githubClientId,
        clientSecret: githubClientSecret,
        disableDefaultScope: true,
        scope: ["read:user"],
        getUserInfo: getMinimumGithubUserInfo,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const stableId =
              typeof user.email === "string"
                ? stableGithubUserIdFromEmail(user.email)
                : null;
            return stableId ? { data: { id: stableId } } : { data: user };
          },
        },
      },
    },
  };
}

export function createBetterAuthForDatabase(
  handle: Database.Database,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const options = buildBetterAuthOptions(environment);
  return betterAuth({
    ...options,
    database: () => createLearningStateBetterAuthAdapter(handle),
  });
}

let cachedAuth:
  | {
      handle: Database.Database;
      secret: string;
      auth: ReturnType<typeof createBetterAuthForDatabase>;
    }
  | undefined;

export function getBetterAuth() {
  const store = getLearningStateStore();
  const secret = requiredEnvironmentValue(process.env, "BETTER_AUTH_SECRET");
  if (
    cachedAuth?.handle === store.database.handle &&
    cachedAuth.secret === secret
  ) {
    return cachedAuth.auth;
  }
  const auth = createBetterAuthForDatabase(store.database.handle, process.env);
  cachedAuth = { handle: store.database.handle, secret, auth };
  return auth;
}

export function resetBetterAuthForTests(): void {
  cachedAuth = undefined;
}
