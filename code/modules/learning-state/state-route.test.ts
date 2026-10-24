import { describe, expect, it, vi } from "vitest";

import { handleStateRequest } from "../../app/api/state/route";
import { openLearningDatabase } from "./database";
import { createLearningStateRepository } from "./repository";

describe("state route", () => {
  it("requires a CSRF token for writes and saves item progress for the current user", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const monitor = { record: vi.fn() };

    const denied = await handleStateRequest(
      new Request("http://127.0.0.1/api/state", {
        method: "POST",
        body: JSON.stringify({
          action: "item-progress",
          itemId: "agent-loop-guide",
          status: "in_progress",
          position: 128,
        }),
        headers: { "content-type": "application/json" },
      }),
      repository,
      "local",
      monitor,
    );
    expect(denied.status).toBe(403);
    expect(monitor.record).toHaveBeenCalledWith({
      event: "request_error",
      scope: "learning-state",
      outcome: "client-error",
    });

    const saved = await handleStateRequest(
      new Request("http://127.0.0.1/api/state", {
        method: "POST",
        body: JSON.stringify({
          action: "item-progress",
          itemId: "agent-loop-guide",
          status: "in_progress",
          position: 128,
        }),
        headers: {
          "content-type": "application/json",
          cookie: "agent-learning-csrf=local-mode",
          "x-csrf-token": "local-mode",
        },
      }),
      repository,
      "local",
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      itemProgress: { itemId: "agent-loop-guide", position: 128 },
    });

    const state = await handleStateRequest(
      new Request("http://127.0.0.1/api/state"),
      repository,
      "local",
    );
    expect(state.status).toBe(200);
    expect(await state.json()).toMatchObject({
      user: { id: "local-user" },
      state: {
        itemProgress: [
          { itemId: "agent-loop-guide", status: "in_progress", position: 128 },
        ],
      },
    });
    database.close();
  });

  it("does not expose a cloud user's state without a session", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const response = await handleStateRequest(
      new Request("https://example.test/api/state"),
      repository,
      "cloud",
    );
    expect(response.status).toBe(401);
    database.close();
  });

  it("rejects fabricated directory IDs when the catalog gate is armed", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    // R06 regression: the production POST handler always arms this gate; a
    // fake keeps the test independent of the on-disk catalog.
    const catalogGate = {
      hasItem: (itemId: string) => itemId === "agent-loop-maintainer-guide",
      hasStage: (stageId: string) => stageId === "stage-0",
      hasStageTask: (taskId: string) => taskId === "stage-0-task-1",
    };

    const fabricated = await handleStateRequest(
      new Request("http://127.0.0.1/api/state", {
        method: "POST",
        body: JSON.stringify({
          action: "note",
          scopeType: "item",
          scopeId: "synthetic-item-that-never-existed",
          body: "20k characters of private state",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "agent-learning-csrf=local-mode",
          "x-csrf-token": "local-mode",
        },
      }),
      repository,
      "local",
      undefined,
      catalogGate,
    );
    expect(fabricated.status).toBe(400);
    expect(await fabricated.json()).toMatchObject({
      error: expect.stringContaining("目录中不存在"),
    });
    expect(repository.listNotes("local-user")).toHaveLength(0);

    const knownItem = await handleStateRequest(
      new Request("http://127.0.0.1/api/state", {
        method: "POST",
        body: JSON.stringify({
          action: "bookmark",
          itemId: "agent-loop-maintainer-guide",
          bookmarked: true,
        }),
        headers: {
          "content-type": "application/json",
          cookie: "agent-learning-csrf=local-mode",
          "x-csrf-token": "local-mode",
        },
      }),
      repository,
      "local",
      undefined,
      catalogGate,
    );
    expect(knownItem.status).toBe(200);
    database.close();
  });

  it("refuses request bodies above the hard size cap before persisting", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);

    const oversized = await handleStateRequest(
      new Request("http://127.0.0.1/api/state", {
        method: "POST",
        body: JSON.stringify({
          action: "note",
          scopeType: "item",
          scopeId: "agent-loop-maintainer-guide",
          body: "x".repeat(300_000),
        }),
        headers: {
          "content-type": "application/json",
          cookie: "agent-learning-csrf=local-mode",
          "x-csrf-token": "local-mode",
        },
      }),
      repository,
      "local",
    );
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toMatchObject({
      error: expect.stringContaining("大小限制"),
    });
    expect(repository.listNotes("local-user")).toHaveLength(0);
    database.close();
  });
});
