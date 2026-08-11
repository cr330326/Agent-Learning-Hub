import { describe, expect, it, vi } from "vitest";

import { handlePageViewRequest } from "../../app/api/telemetry/page-view/route";

describe("page-view telemetry route", () => {
  it("normalizes an allowed pathname before recording an anonymous page view", async () => {
    const monitor = { record: vi.fn() };
    const response = await handlePageViewRequest(
      new Request("https://hub.example.test/api/telemetry/page-view", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://hub.example.test",
        },
        body: JSON.stringify({ path: "/courses/legacy-course-001" }),
      }),
      monitor,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(monitor.record).toHaveBeenCalledWith({
      event: "page_view",
      scope: "course-detail",
      outcome: "observed",
    });
  });

  it("accepts a same-origin page view when a proxy canonicalizes the request URL", async () => {
    const monitor = { record: vi.fn() };
    const response = await handlePageViewRequest(
      new Request("http://localhost:3410/api/telemetry/page-view", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3410",
          origin: "http://127.0.0.1:3410",
        },
        body: JSON.stringify({ path: "/learning" }),
      }),
      monitor,
    );

    expect(response.status).toBe(204);
    expect(monitor.record).toHaveBeenCalledWith({
      event: "page_view",
      scope: "learning",
      outcome: "observed",
    });
  });

  it("rejects cross-origin and unrecognized paths without recording them", async () => {
    const monitor = { record: vi.fn() };
    const crossOrigin = await handlePageViewRequest(
      new Request("https://hub.example.test/api/telemetry/page-view", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://other.example.test",
        },
        body: JSON.stringify({ path: "/learning" }),
      }),
      monitor,
    );
    const unrecognized = await handlePageViewRequest(
      new Request("https://hub.example.test/api/telemetry/page-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "/private/github-42?note=secret" }),
      }),
      monitor,
    );

    expect(crossOrigin.status).toBe(403);
    expect(unrecognized.status).toBe(400);
    expect(monitor.record).not.toHaveBeenCalled();
  });
});
