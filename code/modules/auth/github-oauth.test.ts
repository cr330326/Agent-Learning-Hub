import { describe, expect, it } from "vitest";

import {
  buildGitHubAuthorizeUrl,
  createOAuthState,
  fetchGitHubIdentity,
  getGitHubOAuthConfig,
  isAdminGithubId,
} from "./github-oauth";

describe("GitHub OAuth boundary", () => {
  it("requests only identity scope and identifies admins by stable ID", () => {
    const config = getGitHubOAuthConfig({
      GITHUB_CLIENT_ID: "client-id",
      GITHUB_CLIENT_SECRET: "secret",
      GITHUB_REDIRECT_URI: "https://hub.example.test/api/auth/github/callback",
      ADMIN_GITHUB_IDS: "42, 99",
    });
    const state = createOAuthState();
    const url = buildGitHubAuthorizeUrl(config, state);

    expect(new URL(url).searchParams.get("scope")).toBe("read:user");
    expect(new URL(url).searchParams.get("state")).toBe(state);
    expect(isAdminGithubId("42", config)).toBe(true);
    expect(isAdminGithubId("420", config)).toBe(false);
  });

  it("exchanges a code and returns minimum identity fields without returning the token", async () => {
    const config = getGitHubOAuthConfig({
      GITHUB_CLIENT_ID: "client-id",
      GITHUB_CLIENT_SECRET: "secret",
      GITHUB_REDIRECT_URI: "https://hub.example.test/api/auth/github/callback",
    });
    const calls: Request[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      calls.push(request);
      if (request.url.includes("login/oauth/access_token")) {
        return Response.json({ access_token: "do-not-persist" });
      }
      return Response.json({ id: 42, login: "octocat", name: "The Octocat" });
    };

    const identity = await fetchGitHubIdentity(
      "one-time-code",
      config,
      fetcher,
    );
    expect(identity).toEqual({ githubId: "42", displayName: "The Octocat" });
    expect(JSON.stringify(identity)).not.toContain("do-not-persist");
    expect(calls).toHaveLength(2);
    expect(calls[1].headers.get("authorization")).toBe("Bearer do-not-persist");
  });
});
