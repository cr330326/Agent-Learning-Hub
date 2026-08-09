import { describe, expect, it } from "vitest";

import {
  handleGitHubCallbackRequest,
  handleGitHubLoginRequest,
  handleLogoutRequest,
} from "../../app/api/auth/github/route";
import { getRequestUser } from "./request-auth";
import { openLearningDatabase } from "../learning-state/database";
import { createLearningStateRepository } from "../learning-state/repository";
import { getGitHubOAuthConfig } from "./github-oauth";

describe("GitHub OAuth routes", () => {
  const config = getGitHubOAuthConfig({
    GITHUB_CLIENT_ID: "client-id",
    GITHUB_CLIENT_SECRET: "secret",
    GITHUB_REDIRECT_URI: "https://hub.example.test/api/auth/github/callback",
  });

  it("redirects to GitHub and stores a short-lived OAuth state cookie", async () => {
    const response = await handleGitHubLoginRequest(config);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain(
      "github.com/login/oauth/authorize",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "agent-learning-oauth-state=",
    );
  });

  it("creates a cloud user and session after a valid callback", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const response = await handleGitHubCallbackRequest(
      new Request(
        "https://hub.example.test/api/auth/github/callback?code=code-1&state=state-1",
        { headers: { cookie: "agent-learning-oauth-state=state-1" } },
      ),
      repository,
      config,
      async (input, init) => {
        const request = new Request(input, init);
        if (request.url.includes("access_token")) {
          return Response.json({ access_token: "one-time" });
        }
        return Response.json({ id: 42, login: "octocat", name: "Octocat" });
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://hub.example.test/learning",
    );
    const cookies = response.headers.get("set-cookie") ?? "";
    const sessionToken = cookies.match(/agent-learning-session=([^;,]+)/)?.[1];
    const csrfToken = cookies.match(/agent-learning-csrf=([^;,]+)/)?.[1];
    expect(sessionToken).toBeTruthy();
    expect(csrfToken).toBeTruthy();
    expect(
      getRequestUser(
        new Request("https://hub.example.test/learning", {
          headers: { cookie: `agent-learning-session=${sessionToken}` },
        }),
        repository,
        "cloud",
      ),
    ).toMatchObject({ id: "github-42", githubId: "42" });

    const logout = await handleLogoutRequest(
      new Request("https://hub.example.test/api/auth/logout", {
        method: "POST",
        headers: {
          cookie: `agent-learning-session=${sessionToken}; agent-learning-csrf=${csrfToken}`,
          "x-csrf-token": csrfToken!,
        },
      }),
      repository,
      "cloud",
    );
    expect(logout.status).toBe(200);
    expect(
      getRequestUser(
        new Request("https://hub.example.test/learning", {
          headers: { cookie: `agent-learning-session=${sessionToken}` },
        }),
        repository,
        "cloud",
      ),
    ).toBeNull();
    database.close();
  });
});
