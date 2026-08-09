import { describe, expect, it } from "vitest";

import { getRequestRateLimitKey, InMemoryRateLimiter } from "./rate-limit";

describe("in-memory rate limiter", () => {
  it("allows the configured number of requests and reports retry timing", () => {
    let now = 1_000;
    const limiter = new InMemoryRateLimiter({
      limit: 2,
      windowMs: 10_000,
      now: () => now,
    });

    expect(limiter.consume("user-a")).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.consume("user-a")).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.consume("user-a")).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 10,
    });
    expect(limiter.consume("user-b").allowed).toBe(true);

    now += 10_000;
    expect(limiter.consume("user-a")).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });

  it("uses a forwarded client address without including cookies or secrets", () => {
    const request = new Request("https://hub.test/api/auth/github", {
      headers: {
        cookie: "agent-learning-session=secret",
        "x-forwarded-for": "203.0.113.4, 10.0.0.1",
      },
    });

    expect(getRequestRateLimitKey(request)).toBe("203.0.113.4");
    expect(
      getRequestRateLimitKey(
        new Request("https://hub.test/api/auth/github", {
          headers: { "x-real-ip": "198.51.100.7" },
        }),
      ),
    ).toBe("198.51.100.7");
  });
});
