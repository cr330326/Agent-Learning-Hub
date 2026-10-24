import { describe, expect, it } from "vitest";

import { isTrustedLocalHost } from "./request-host";

describe("trusted local host boundary", () => {
  it("accepts loopback hosts with or without a port", () => {
    expect(isTrustedLocalHost("127.0.0.1")).toBe(true);
    expect(isTrustedLocalHost("127.0.0.1:3419")).toBe(true);
    expect(isTrustedLocalHost("localhost")).toBe(true);
    expect(isTrustedLocalHost("localhost:3001")).toBe(true);
    expect(isTrustedLocalHost("::1")).toBe(true);
    expect(isTrustedLocalHost("[::1]")).toBe(true);
    expect(isTrustedLocalHost("[::1]:3001")).toBe(true);
    expect(isTrustedLocalHost(" 127.0.0.1:3001 ")).toBe(true);
  });

  it("rejects non-local and attacker-shaped hosts", () => {
    // The R01 probe: a made-up Host that still reaches the server.
    expect(isTrustedLocalHost("review.invalid:3419")).toBe(false);
    expect(isTrustedLocalHost("example.com")).toBe(false);
    expect(isTrustedLocalHost("example.com:80")).toBe(false);
    expect(isTrustedLocalHost("127.0.0.1.evil.example")).toBe(false);
    expect(isTrustedLocalHost("[::2]:3001")).toBe(false);
    expect(isTrustedLocalHost("192.168.1.10:3001")).toBe(false);
    expect(isTrustedLocalHost("")).toBe(false);
    expect(isTrustedLocalHost(null)).toBe(false);
    expect(isTrustedLocalHost(undefined)).toBe(false);
  });
});
