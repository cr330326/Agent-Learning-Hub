import { describe, expect, it, vi } from "vitest";

import { handleHealthRequest } from "../app/api/health/route";

describe("health route", () => {
  it("reports an available runtime when catalog and database checks pass", async () => {
    const monitor = { record: vi.fn() };
    const response = await handleHealthRequest({
      mode: "local",
      checkCatalog: async () => {},
      checkDatabase: () => {},
      monitor,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      mode: "local",
      checks: { catalog: "ok", database: "ok" },
    });
    expect(monitor.record).toHaveBeenCalledWith({
      event: "health_check",
      scope: "readiness",
      outcome: "success",
    });
  });

  it("does not expose internal check errors when readiness fails", async () => {
    const monitor = { record: vi.fn() };
    const response = await handleHealthRequest({
      mode: "cloud",
      checkCatalog: async () => {
        throw new Error("absolute path and secret");
      },
      checkDatabase: () => {},
      monitor,
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "unavailable",
      mode: "cloud",
    });
    expect(monitor.record).toHaveBeenCalledWith({
      event: "health_check",
      scope: "readiness",
      outcome: "failure",
    });
  });
});
