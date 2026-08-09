import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openLearningDatabase } from "./database";
import { createLearningStateRepository } from "./repository";
import {
  createEncryptedBackup,
  pruneEncryptedBackups,
  restoreEncryptedBackup,
} from "./backup";

describe("encrypted SQLite backups", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "agent-learning-backup-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("creates an encrypted consistent backup and restores personal state", async () => {
    const sourceFilename = join(root, "source.sqlite");
    const database = openLearningDatabase({
      filename: sourceFilename,
      enableWal: false,
    });
    const repository = createLearningStateRepository(database);
    const user = repository.createUser({
      id: "user-a",
      mode: "local",
      displayName: "Local learner",
    });
    repository.saveNote({
      userId: user.id,
      scopeType: "item",
      scopeId: "item-a",
      body: "private backup note",
    });
    database.close();

    const backup = await createEncryptedBackup({
      sourceFilename,
      outputDirectory: join(root, "backups"),
      passphrase: "correct horse battery staple",
      now: () => new Date("2026-08-09T01:02:03.000Z"),
    });
    const encrypted = await readFile(backup.backupPath);
    expect(encrypted.toString("utf8")).not.toContain("private backup note");
    expect(backup.manifest.byteSize).toBe(encrypted.byteLength);
    expect(backup.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);

    const restoredFilename = join(root, "restored.sqlite");
    await expect(
      restoreEncryptedBackup({
        backupFilename: backup.backupPath,
        targetFilename: restoredFilename,
        passphrase: "correct horse battery staple",
        now: () => new Date("2026-08-09T02:03:04.000Z"),
      }),
    ).resolves.toMatchObject({ verified: true });
    expect(
      JSON.parse(await readFile(backup.manifestPath, "utf8")),
    ).toMatchObject({ restoreVerifiedAt: "2026-08-09T02:03:04.000Z" });

    const restoredDatabase = openLearningDatabase({
      filename: restoredFilename,
      enableWal: false,
    });
    expect(
      createLearningStateRepository(restoredDatabase).getNote(
        user.id,
        "item",
        "item-a",
      ),
    ).toMatchObject({ body: "private backup note" });
    restoredDatabase.close();
  });

  it("rejects a wrong passphrase and refuses accidental overwrite", async () => {
    const sourceFilename = join(root, "source.sqlite");
    const database = openLearningDatabase({
      filename: sourceFilename,
      enableWal: false,
    });
    database.close();
    const backup = await createEncryptedBackup({
      sourceFilename,
      outputDirectory: join(root, "backups"),
      passphrase: "correct horse battery staple",
    });
    const targetFilename = join(root, "restored.sqlite");

    await expect(
      restoreEncryptedBackup({
        backupFilename: backup.backupPath,
        targetFilename,
        passphrase: "wrong passphrase",
      }),
    ).rejects.toThrow("Unable to decrypt");

    await restoreEncryptedBackup({
      backupFilename: backup.backupPath,
      targetFilename,
      passphrase: "correct horse battery staple",
    });
    await expect(
      restoreEncryptedBackup({
        backupFilename: backup.backupPath,
        targetFilename,
        passphrase: "correct horse battery staple",
      }),
    ).rejects.toThrow("already exists");
  });

  it("keeps seven daily slots plus three weekly slots", async () => {
    const outputDirectory = join(root, "backups");
    const sourceFilename = join(root, "source.sqlite");
    const sourceDatabase = openLearningDatabase({
      filename: sourceFilename,
      enableWal: false,
    });
    sourceDatabase.close();
    const dates = [
      "2026-08-09",
      "2026-08-08",
      "2026-08-07",
      "2026-08-06",
      "2026-08-05",
      "2026-08-04",
      "2026-08-03",
      "2026-08-02",
      "2026-07-27",
      "2026-07-20",
      "2026-07-13",
    ];
    for (const date of dates) {
      await createEncryptedBackup({
        sourceFilename,
        outputDirectory,
        passphrase: "correct horse battery staple",
        now: () => new Date(`${date}T01:02:03.000Z`),
      }).catch(() => undefined);
    }

    const result = await pruneEncryptedBackups({
      outputDirectory,
      now: new Date("2026-08-09T12:00:00.000Z"),
    });
    const remaining = await readdir(outputDirectory);
    expect(result.removed).toBeGreaterThan(0);
    expect(
      remaining.filter((name) => name.endsWith(".manifest.json")).length,
    ).toBeLessThanOrEqual(10);
  });
});
