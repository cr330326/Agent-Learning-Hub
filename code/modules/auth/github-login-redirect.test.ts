import { afterEach, describe, expect, it, vi } from "vitest";

const { signInSocial } = vi.hoisted(() => ({
  signInSocial: vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://github.com/login/oauth/authorize" },
      }),
  ),
}));

vi.mock("./better-auth", () => ({
  getBetterAuth: () => ({ api: { signInSocial } }),
}));

import { GET } from "../../app/api/auth/github/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GitHub login return address behind a container", () => {
  it.each(["BETTER_AUTH_URL", "APP_URL"])(
    "uses %s instead of the internal listener or forwarded host",
    async (key) => {
      vi.stubEnv("DEPLOYMENT_MODE", "cloud");
      vi.stubEnv("BETTER_AUTH_URL", "");
      vi.stubEnv("APP_URL", "");
      vi.stubEnv(key, "http://127.0.0.1:3002");

      const response = await GET(
        new Request("http://0.0.0.0:3000/api/auth/github", {
          headers: { "x-forwarded-host": "untrusted.example" },
        }),
      );

      expect(response.status).toBe(302);
      expect(signInSocial).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            provider: "github",
            callbackURL: "http://127.0.0.1:3002/learning",
            errorCallbackURL: "http://127.0.0.1:3002/login",
          },
        }),
      );
    },
  );
});
