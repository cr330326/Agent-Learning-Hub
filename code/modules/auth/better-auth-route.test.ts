import { describe, expect, it } from "vitest";

import { GET as legacyGithubCallback } from "../../app/api/auth/github/callback/route";

describe("Better Auth callback boundary", () => {
  it("does not keep the legacy custom callback as a second production flow", async () => {
    const response = await legacyGithubCallback();

    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      error: "该 GitHub 回调地址已停用，请使用 Better Auth 回调。",
    });
  });
});
