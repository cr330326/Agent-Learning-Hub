import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPersistentLearningStateStore } from "./state-store";

describe("persistent learning state store", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "agent-learning-state-store-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("reuses the same SQLite file across store instances", () => {
    const filename = join(directory, "data", "learning-state.sqlite");
    const first = createPersistentLearningStateStore({ filename });
    const firstUser = first.repository.createUser({
      id: "persistent-user",
      mode: "local",
      displayName: "Persistent learner",
    });
    first.repository.saveItemProgress({
      userId: firstUser.id,
      itemId: "agent-loop-guide",
      status: "in_progress",
      position: 88,
    });
    first.close();

    const second = createPersistentLearningStateStore({ filename });
    expect(
      second.repository.getItemProgress(firstUser.id, "agent-loop-guide"),
    ).toMatchObject({ position: 88 });
    second.close();
  });
});
