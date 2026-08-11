import { describe, expect, it, vi } from "vitest";

import { handleDataRequest } from "../../app/api/data/route";
import { openLearningDatabase } from "./database";
import { createLearningStateRepository } from "./repository";

describe("data export and account deletion route", () => {
  it("exports JSON without session secrets and requires explicit deletion confirmation", async () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const monitor = { record: vi.fn() };
    const user = repository.createUser({
      id: "local-user",
      mode: "local",
      displayName: "Local learner",
    });
    repository.saveNote({
      userId: user.id,
      scopeType: "item",
      scopeId: "agent-loop-guide",
      body: "private export",
    });
    repository.createSession({
      userId: user.id,
      tokenHash: "never-export-this",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    const exported = await handleDataRequest(
      new Request("http://127.0.0.1/api/data"),
      repository,
      "local",
    );
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-disposition")).toContain("attachment");
    const exportedText = await exported.text();
    expect(exportedText).toContain("private export");
    expect(exportedText).not.toContain("never-export-this");

    const denied = await handleDataRequest(
      new Request("http://127.0.0.1/api/data", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie: "agent-learning-csrf=local-mode",
          "x-csrf-token": "local-mode",
        },
        body: JSON.stringify({ confirmation: "wrong" }),
      }),
      repository,
      "local",
      monitor,
    );
    expect(denied.status).toBe(400);
    expect(monitor.record).toHaveBeenCalledWith({
      event: "request_error",
      scope: "data-export",
      outcome: "client-error",
    });
    expect(repository.getUser(user.id)).not.toBeNull();

    const deleted = await handleDataRequest(
      new Request("http://127.0.0.1/api/data", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie: "agent-learning-csrf=local-mode",
          "x-csrf-token": "local-mode",
        },
        body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
      }),
      repository,
      "local",
    );
    expect(deleted.status).toBe(200);
    expect(deleted.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(repository.getUser(user.id)).toBeNull();
    expect(repository.getSessionByTokenHash("never-export-this")).toBeNull();
    database.close();
  });
});
