import { saveDiscoveryState, listDiscoveryState } from "./discovery-state";
import { describe, expect, it } from "vitest";

import { openLearningDatabase } from "./database";
import { createLearningStateRepository } from "./repository";
import { exportLearningState, renderNotesMarkdown } from "./data-export";

describe("learning state export", () => {
  it("exports only the current user's learning data and renders notes as Markdown", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const first = repository.createUser({
      id: "user-a",
      mode: "local",
      displayName: "A learner",
    });
    const second = repository.createUser({
      id: "user-b",
      mode: "local",
      displayName: "B learner",
    });
    repository.saveItemProgress({
      userId: first.id,
      itemId: "agent-loop-guide",
      status: "completed",
      position: 4,
    });
    repository.saveNote({
      userId: first.id,
      scopeType: "item",
      scopeId: "agent-loop-guide",
      body: "private note",
    });
    repository.saveItemProgress({
      userId: second.id,
      itemId: "other-item",
      status: "completed",
    });
    repository.createSession({
      userId: first.id,
      tokenHash: "secret-token-hash",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });

    saveDiscoveryState(database, first.id, {
      itemId: "news-a",
      status: "completed",
      bookmarked: true,
      note: "资讯私人笔记",
    });
    saveDiscoveryState(database, second.id, {
      itemId: "news-b",
      note: "other-private-news",
    });
    const snapshot = repository.getStateSnapshot(first.id)!;
    const exported = exportLearningState(snapshot, "2030-01-01T00:00:00.000Z");
    expect(exported.user.id).toBe(first.id);
    expect(exported.itemProgress).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain("secret-token-hash");
    expect(JSON.stringify(exported)).not.toContain("other-item");
    expect(renderNotesMarkdown(snapshot)).toContain("private note");
    expect(renderNotesMarkdown(snapshot)).not.toContain("secret-token-hash");
    expect(exported.schemaVersion).toBe(2);
    expect(exported.discoveryState).toHaveLength(1);
    expect(exported.discoveryState[0]).toMatchObject({
      targetType: "news",
      itemId: "news-a",
      note: "资讯私人笔记",
    });
    expect(JSON.stringify(exported)).not.toContain("other-private-news");
    expect(renderNotesMarkdown(snapshot)).toContain("资讯私人笔记");
    repository.deleteUser(first.id);
    expect(listDiscoveryState(database, first.id)).toEqual([]);
    expect(listDiscoveryState(database, second.id)).toHaveLength(1);
    database.close();
  });
});
