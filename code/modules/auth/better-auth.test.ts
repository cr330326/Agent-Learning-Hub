import { describe, expect, it, vi } from "vitest";

import {
  buildBetterAuthOptions,
  createBetterAuthForDatabase,
} from "./better-auth";
import { openLearningDatabase } from "../learning-state/database";
import { hashSessionToken } from "./request-auth";

describe("Better Auth configuration", () => {
  it("uses the minimum GitHub scope and the shared secure session cookie", () => {
    const options = buildBetterAuthOptions({
      BETTER_AUTH_SECRET: "test-secret-that-is-long-enough",
      BETTER_AUTH_URL: "https://hub.example.test",
      GITHUB_CLIENT_ID: "client-id",
      GITHUB_CLIENT_SECRET: "client-secret",
      ADMIN_GITHUB_IDS: "42",
    });

    const github = options.socialProviders?.github;
    expect(github).toMatchObject({
      disableDefaultScope: true,
      scope: ["read:user"],
    });
    expect(options.account?.storeStateStrategy).toBe("cookie");
    expect(options.advanced?.cookies?.session_token?.name).toBe(
      "agent-learning-session",
    );
  });

  it("completes a mocked GitHub callback without persisting provider or session secrets", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const environment = {
      BETTER_AUTH_SECRET: "test-secret-that-is-long-enough",
      BETTER_AUTH_URL: "https://hub.example.test",
      GITHUB_CLIENT_ID: "client-id",
      GITHUB_CLIENT_SECRET: "client-secret",
    };
    const auth = createBetterAuthForDatabase(database.handle, environment);
    const start = await auth.api.signInSocial({
      body: {
        provider: "github",
        callbackURL: "https://hub.example.test/learning",
      },
      headers: new Headers({ origin: "https://hub.example.test" }),
      asResponse: true,
    });

    expect(start.status).toBe(200);
    const location = start.headers.get("location");
    expect(location).toContain("github.com/login/oauth/authorize");
    const state = new URL(location!).searchParams.get("state");
    const stateCookie = start.headers.get("set-cookie");
    expect(state).toBeTruthy();
    expect(stateCookie).toMatch(/(?:__Secure-)?better-auth\.oauth_state=/);

    const originalFetch = globalThis.fetch;
    let profileRequestCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("login/oauth/access_token")) {
          return Response.json({
            access_token: "provider-token-never-persisted",
            token_type: "bearer",
            scope: "read:user",
          });
        }
        profileRequestCount += 1;
        const githubId = profileRequestCount <= 2 ? 42 : 43;
        return Response.json({
          id: githubId,
          login: githubId === 42 ? "octocat" : "new-user",
          name: githubId === 42 ? "Octocat" : "New User",
          avatar_url: `https://avatars.example.test/${githubId}`,
        });
      }),
    );
    try {
      const callback = await auth.handler(
        new Request(
          `https://hub.example.test/api/auth/callback/github?code=one-time&state=${state}`,
          { headers: { cookie: stateCookie!.split(";")[0] } },
        ),
      );

      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe(
        "https://hub.example.test/learning",
      );
      const sessionCookie = callback.headers
        .get("set-cookie")
        ?.split(", ")
        .find((cookie) =>
          /^(?:__Secure-)?agent-learning-session=/.test(cookie),
        );
      const sessionToken = sessionCookie?.match(
        /^(?:__Secure-)?agent-learning-session=([^;]+)/,
      )?.[1];
      expect(sessionToken).toContain(".");
      const userRow = database.handle
        .prepare("SELECT * FROM users WHERE id = ?")
        .get("github-42") as Record<string, unknown>;
      const accountRow = database.handle
        .prepare("SELECT * FROM accounts WHERE provider_account_id = ?")
        .get("42") as Record<string, unknown>;
      const sessionRow = database.handle
        .prepare("SELECT * FROM sessions WHERE user_id = ?")
        .get("github-42") as Record<string, unknown>;
      expect(userRow.display_name).toBe("Octocat");
      expect(accountRow).not.toHaveProperty("access_token");
      expect(JSON.stringify(sessionRow)).not.toContain(
        "provider-token-never-persisted",
      );
      expect(sessionRow.token_hash).not.toContain(sessionToken!);
      expect(sessionRow.token_hash).toBe(
        hashSessionToken(sessionToken!.split(".")[0]),
      );

      const sessionHeaders = new Headers({
        cookie: sessionCookie!.split(";")[0],
      });
      const activeSession = await auth.api.getSession({
        headers: sessionHeaders,
      });
      expect(activeSession).toMatchObject({
        user: { id: "github-42", name: "Octocat" },
      });

      const reloginStart = await auth.api.signInSocial({
        body: {
          provider: "github",
          callbackURL: "https://hub.example.test/learning",
        },
        headers: new Headers({ origin: "https://hub.example.test" }),
        asResponse: true,
      });
      const reloginLocation = reloginStart.headers.get("location");
      const reloginState = new URL(reloginLocation!).searchParams.get("state");
      const reloginStateCookie = reloginStart.headers.get("set-cookie");
      const relogin = await auth.handler(
        new Request(
          `https://hub.example.test/api/auth/callback/github?code=relogin&state=${reloginState}`,
          { headers: { cookie: reloginStateCookie!.split(";")[0] } },
        ),
      );
      expect(relogin.status).toBe(302);
      expect(relogin.headers.get("location")).toBe(
        "https://hub.example.test/learning",
      );

      database.handle
        .prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
        .run("2000-01-01T00:00:00.000Z", "github-42");
      expect(await auth.api.getSession({ headers: sessionHeaders })).toBeNull();

      const secondStart = await auth.api.signInSocial({
        body: {
          provider: "github",
          callbackURL: "https://hub.example.test/learning",
        },
        headers: new Headers({ origin: "https://hub.example.test" }),
        asResponse: true,
      });
      const secondLocation = secondStart.headers.get("location");
      const secondState = new URL(secondLocation!).searchParams.get("state");
      const secondStateCookie = secondStart.headers.get("set-cookie");
      const secondCallback = await auth.handler(
        new Request(
          `https://hub.example.test/api/auth/callback/github?code=two-time&state=${secondState}`,
          { headers: { cookie: secondStateCookie!.split(";")[0] } },
        ),
      );
      const secondSessionCookie = secondCallback.headers
        .get("set-cookie")
        ?.split(", ")
        .find((cookie) =>
          /^(?:__Secure-)?agent-learning-session=/.test(cookie),
        );
      expect(secondSessionCookie).toBeTruthy();
      const logout = await auth.api.signOut({
        headers: new Headers({
          cookie: secondSessionCookie!.split(";")[0],
        }),
        asResponse: true,
      });
      expect(logout.status).toBe(200);
      expect(
        await auth.api.getSession({
          headers: new Headers({
            cookie: secondSessionCookie!.split(";")[0],
          }),
        }),
      ).toBeNull();
    } finally {
      vi.stubGlobal("fetch", originalFetch);
      database.close();
    }
  });
});
