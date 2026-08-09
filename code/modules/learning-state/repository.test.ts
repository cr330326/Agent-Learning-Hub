import { describe, expect, it } from "vitest";

import { openLearningDatabase } from "./database";
import { createLearningStateRepository } from "./repository";

describe("learning-state repository", () => {
  it("keeps item progress isolated by user", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const firstUser = repository.createUser({
      id: "user-a",
      mode: "local",
      displayName: "Local learner",
    });
    const secondUser = repository.createUser({
      id: "user-b",
      mode: "local",
      displayName: "Another learner",
    });

    repository.saveItemProgress({
      userId: firstUser.id,
      itemId: "agent-loop-maintainer-guide",
      status: "in_progress",
      position: 240,
    });

    expect(
      repository.getItemProgress(
        firstUser.id,
        "agent-loop-maintainer-guide",
      ),
    ).toMatchObject({
      userId: firstUser.id,
      itemId: "agent-loop-maintainer-guide",
      status: "in_progress",
      position: 240,
    });
    expect(
      repository.getItemProgress(
        secondUser.id,
        "agent-loop-maintainer-guide",
      ),
    ).toBeNull();

    database.close();
  });

  it("stores stage task progress and bookmarks per user", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const user = repository.createUser({
      id: "user-a",
      mode: "local",
      displayName: "Local learner",
    });

    expect(
      repository.saveStageTaskProgress({
        userId: user.id,
        taskId: "build-agent-loop",
        completed: true,
      }),
    ).toMatchObject({
      userId: user.id,
      taskId: "build-agent-loop",
      completed: true,
    });
    expect(repository.listStageTaskProgress(user.id)).toHaveLength(1);
    expect(repository.listStageTaskProgress("other-user")).toEqual([]);

    expect(
      repository.setBookmark({ userId: user.id, itemId: "agent-loop-guide" }),
    ).toMatchObject({ userId: user.id, itemId: "agent-loop-guide" });
    expect(repository.listBookmarks(user.id)).toHaveLength(1);
    expect(repository.removeBookmark(user.id, "agent-loop-guide")).toBe(true);
    expect(repository.listBookmarks(user.id)).toEqual([]);
    expect(repository.removeBookmark(user.id, "agent-loop-guide")).toBe(false);

    database.close();
  });

  it("creates, edits, and deletes one private note per scope", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const user = repository.createUser({
      id: "user-a",
      mode: "local",
      displayName: "Local learner",
    });

    const created = repository.saveNote({
      userId: user.id,
      scopeType: "item",
      scopeId: "agent-loop-guide",
      body: "先画出状态转移图。",
    });
    expect(created).toMatchObject({
      userId: user.id,
      scopeType: "item",
      scopeId: "agent-loop-guide",
      body: "先画出状态转移图。",
    });
    expect(
      repository.saveNote({
        userId: user.id,
        scopeType: "item",
        scopeId: "agent-loop-guide",
        body: "再补一条失败路径。",
      }),
    ).toMatchObject({ id: created.id, body: "再补一条失败路径。" });
    expect(
      repository.getNote(user.id, "item", "agent-loop-guide"),
    ).toMatchObject({ body: "再补一条失败路径。" });
    expect(repository.listNotes(user.id)).toHaveLength(1);
    expect(repository.deleteNote(user.id, created.id)).toBe(true);
    expect(repository.getNote(user.id, "item", "agent-loop-guide")).toBeNull();

    database.close();
  });

  it("requires an outcome before confirming a stage and supports three evidence types", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const user = repository.createUser({
      id: "user-a",
      mode: "local",
      displayName: "Local learner",
    });

    expect(() =>
      repository.confirmStageCompletion(user.id, "stage-01"),
    ).toThrow(/outcome/i);

    const outcome = repository.createStageOutcome({
      userId: user.id,
      stageId: "stage-01",
      kind: "repository",
      url: "https://github.com/example/agent-loop",
    });
    expect(outcome).toMatchObject({ kind: "repository", confirmedAt: null });
    expect(
      repository.confirmStageCompletion(user.id, "stage-01"),
    ).toMatchObject({ stageId: "stage-01", completed: true });
    expect(repository.getStageStatus(user.id, "stage-01")).toMatchObject({
      completed: true,
      outcomeCount: 1,
    });
    expect(repository.deleteStageOutcome(user.id, outcome.id)).toBe(true);
    expect(repository.getStageStatus(user.id, "stage-01")).toMatchObject({
      completed: false,
      outcomeCount: 0,
    });

    database.close();
  });

  it("cascades sessions and learning state when deleting a user", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const user = repository.createUser({
      id: "user-a",
      mode: "local",
      displayName: "Local learner",
    });
    repository.createSession({
      userId: user.id,
      tokenHash: "hash-a",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    repository.saveItemProgress({
      userId: user.id,
      itemId: "agent-loop-guide",
      status: "completed",
    });
    repository.setBookmark({ userId: user.id, itemId: "agent-loop-guide" });
    repository.saveNote({
      userId: user.id,
      scopeType: "stage",
      scopeId: "stage-01",
      body: "done",
    });

    expect(repository.deleteUser(user.id)).toBe(true);
    expect(repository.getUser(user.id)).toBeNull();
    expect(repository.getItemProgress(user.id, "agent-loop-guide")).toBeNull();
    expect(repository.listBookmarks(user.id)).toEqual([]);
    expect(repository.listNotes(user.id)).toEqual([]);
    expect(repository.getSessionByTokenHash("hash-a")).toBeNull();

    database.close();
  });
});
