import { describe, expect, it } from "vitest";

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
    );
    expect(denied.status).toBe(403);

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
});
