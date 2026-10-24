import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openLearningDatabase } from "./database";
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
  it("creates the state directory and database with owner-only permissions", () => {
    if (process.platform === "win32") return;

    // R09 regression: even with the most permissive umask the private state
    // unit must not become world-readable on a shared host.
    const previousUmask = process.umask(0);
    const filename = join(directory, "nested", "data", "learning-state.sqlite");
    try {
      const store = createPersistentLearningStateStore({ filename });
      store.repository.createUser({
        id: "permission-probe",
        mode: "local",
        displayName: "Permission probe",
      });
      store.close();

      expect(statSync(dirname(filename)).mode & 0o777).toBe(0o700);
      expect(statSync(filename).mode & 0o777).toBe(0o600);
      for (const suffix of ["-wal", "-shm"]) {
        const sidecar = `${filename}${suffix}`;
        if (existsSync(sidecar)) {
          expect(statSync(sidecar).mode & 0o777).toBe(0o600);
        }
      }

      // Pre-existing databases are left to the operator: the service must not
      // silently reshape permissions of a volume shared with maintenance.
      const shared = join(directory, "shared.sqlite");
      mkdirSync(dirname(shared), { recursive: true });
      const seeded = openLearningDatabase({
        filename: shared,
        enableWal: false,
      });
      seeded.close();
      chmodSync(shared, 0o640);
      const reopened = createPersistentLearningStateStore({ filename: shared });
      reopened.close();
      expect(statSync(shared).mode & 0o777).toBe(0o640);
    } finally {
      process.umask(previousUmask);
    }
  });
});
