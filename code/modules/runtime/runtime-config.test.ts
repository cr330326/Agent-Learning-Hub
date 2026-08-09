import { describe, expect, it } from "vitest";

import { parseRuntimeConfig } from "./runtime-config";

describe("runtime mode configuration", () => {
  it("uses Cloud Mode when DEPLOYMENT_MODE is not set", () => {
    expect(parseRuntimeConfig({})).toEqual({ mode: "cloud" });
  });

  it("uses Local Mode only when DEPLOYMENT_MODE explicitly requests it", () => {
    expect(parseRuntimeConfig({ DEPLOYMENT_MODE: "local" })).toEqual({
      mode: "local",
    });
  });

  it("rejects an unknown deployment mode before the application starts", () => {
    expect(() => parseRuntimeConfig({ DEPLOYMENT_MODE: "preview" })).toThrow(
      'DEPLOYMENT_MODE must be either "cloud" or "local".',
    );
  });
});
