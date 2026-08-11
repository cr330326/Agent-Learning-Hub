import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  openLearningDatabase,
  UnsupportedWalSQLiteVersionError,
} from "./database";

describe("learning-state database", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "agent-learning-state-db-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("applies migrations, enables foreign keys, and enables WAL on a safe SQLite build", () => {
    const database = openLearningDatabase({
      filename: join(directory, "state.db"),
      enableWal: true,
    });

    expect(database.sqliteVersion).toMatch(/^3\./);
    expect(database.schemaVersion).toBe(2);
    expect(database.foreignKeysEnabled).toBe(true);
    expect(database.journalMode).toBe("wal");
    expect(
      database.handle
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'operational_metrics'",
        )
        .get(),
    ).toBeTruthy();

    database.close();
  });

  it("rejects enabling WAL on a SQLite version before the verified fix", () => {
    expect(() =>
      openLearningDatabase({
        filename: ":memory:",
        enableWal: true,
        sqliteVersionProvider: () => "3.51.2",
      }),
    ).toThrow(UnsupportedWalSQLiteVersionError);
  });

  it("can open a database without WAL when the runtime is older", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
      sqliteVersionProvider: () => "3.40.0",
    });

    expect(database.schemaVersion).toBe(2);
    expect(database.journalMode).toBe("memory");
    database.close();
  });

  it("reopens an existing file without reapplying its migration", () => {
    const filename = join(directory, "state.db");
    const first = openLearningDatabase({ filename, enableWal: false });
    first.close();

    const second = openLearningDatabase({ filename, enableWal: false });
    expect(second.schemaVersion).toBe(2);
    second.close();
  });
});
