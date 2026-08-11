import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createEncryptedBackup } from "../learning-state/backup";
import { openLearningDatabase } from "../learning-state/database";
import { createPrivacyFirstMonitor } from "./privacy-monitor";

const applicationRoot = resolve(import.meta.dirname, "../..");
const tsxCli = resolve(applicationRoot, "node_modules/tsx/dist/cli.mjs");

describe("operator command integration", () => {
  it("records a successful encrypted backup through the database CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-command-"));
    const databaseFilename = join(root, "state.sqlite");
    const initialDatabase = openLearningDatabase({
      filename: databaseFilename,
      enableWal: false,
    });
    initialDatabase.close();

    try {
      const result = spawnSync(
        process.execPath,
        [
          tsxCli,
          "scripts/database.ts",
          "backup",
          "--source",
          databaseFilename,
          "--output-dir",
          join(root, "backups"),
        ],
        {
          cwd: applicationRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            BACKUP_PASSPHRASE: "correct horse battery staple",
            OPERATIONAL_METRICS_DATABASE_PATH: databaseFilename,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();

      const database = openLearningDatabase({
        filename: databaseFilename,
        enableWal: false,
      });
      const snapshot = createPrivacyFirstMonitor(database, {
        writeLog: () => undefined,
      }).snapshot();
      database.close();
      expect(snapshot.operations).toContainEqual({
        event: "backup",
        scope: "backup",
        outcome: "success",
        count: 1,
      });
      const metricLine = `${result.stdout}\n${result.stderr}`
        .split("\n")
        .find((line) => line.includes("operational-metric"));
      expect(metricLine).toContain('"event":"backup"');
      expect(metricLine).not.toContain(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records a failed backup so the public snapshot raises a critical alert", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-command-"));
    const databaseFilename = join(root, "state.sqlite");
    const blockedOutput = join(root, "blocked-output");
    const initialDatabase = openLearningDatabase({
      filename: databaseFilename,
      enableWal: false,
    });
    initialDatabase.close();
    await writeFile(blockedOutput, "not a directory");

    try {
      const result = spawnSync(
        process.execPath,
        [
          tsxCli,
          "scripts/database.ts",
          "backup",
          "--source",
          databaseFilename,
          "--output-dir",
          blockedOutput,
        ],
        {
          cwd: applicationRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            BACKUP_PASSPHRASE: "correct horse battery staple",
            OPERATIONAL_METRICS_DATABASE_PATH: databaseFilename,
          },
        },
      );
      expect(result.status).not.toBe(0);

      const database = openLearningDatabase({
        filename: databaseFilename,
        enableWal: false,
      });
      const snapshot = createPrivacyFirstMonitor(database, {
        writeLog: () => undefined,
      }).snapshot();
      database.close();
      expect(snapshot.alerts).toContainEqual({
        id: "backup-or-restore-failed",
        severity: "critical",
        count: 1,
      });
      const metricLine = `${result.stdout}\n${result.stderr}`
        .split("\n")
        .find((line) => line.includes("operational-metric"));
      expect(metricLine).toContain('"outcome":"failure"');
      expect(metricLine).not.toContain(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records a successful restore without writing monitoring data to the restored target", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-command-"));
    const databaseFilename = join(root, "state.sqlite");
    const restoredFilename = join(root, "restored.sqlite");
    const initialDatabase = openLearningDatabase({
      filename: databaseFilename,
      enableWal: false,
    });
    initialDatabase.close();

    try {
      const backup = await createEncryptedBackup({
        sourceFilename: databaseFilename,
        outputDirectory: join(root, "backups"),
        passphrase: "correct horse battery staple",
      });
      const result = spawnSync(
        process.execPath,
        [
          tsxCli,
          "scripts/database.ts",
          "restore",
          "--yes",
          "--input",
          backup.backupPath,
          "--target",
          restoredFilename,
        ],
        {
          cwd: applicationRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            BACKUP_PASSPHRASE: "correct horse battery staple",
            OPERATIONAL_METRICS_DATABASE_PATH: databaseFilename,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);

      const database = openLearningDatabase({
        filename: databaseFilename,
        enableWal: false,
      });
      const snapshot = createPrivacyFirstMonitor(database, {
        writeLog: () => undefined,
      }).snapshot();
      database.close();
      expect(snapshot.operations).toContainEqual({
        event: "restore",
        scope: "restore",
        outcome: "success",
        count: 1,
      });
      const metricLine = `${result.stdout}\n${result.stderr}`
        .split("\n")
        .find((line) => line.includes("operational-metric"));
      expect(metricLine).toContain('"event":"restore"');
      expect(metricLine).not.toContain(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records a failed restore without logging its passphrase", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-command-"));
    const databaseFilename = join(root, "state.sqlite");
    const initialDatabase = openLearningDatabase({
      filename: databaseFilename,
      enableWal: false,
    });
    initialDatabase.close();

    try {
      const backup = await createEncryptedBackup({
        sourceFilename: databaseFilename,
        outputDirectory: join(root, "backups"),
        passphrase: "correct horse battery staple",
      });
      const result = spawnSync(
        process.execPath,
        [
          tsxCli,
          "scripts/database.ts",
          "restore",
          "--yes",
          "--input",
          backup.backupPath,
          "--target",
          join(root, "restored.sqlite"),
        ],
        {
          cwd: applicationRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            BACKUP_PASSPHRASE: "intentionally wrong passphrase",
            OPERATIONAL_METRICS_DATABASE_PATH: databaseFilename,
          },
        },
      );
      expect(result.status).not.toBe(0);

      const database = openLearningDatabase({
        filename: databaseFilename,
        enableWal: false,
      });
      const snapshot = createPrivacyFirstMonitor(database, {
        writeLog: () => undefined,
      }).snapshot();
      database.close();
      expect(snapshot.alerts).toContainEqual({
        id: "backup-or-restore-failed",
        severity: "critical",
        count: 1,
      });
      const metricLine = `${result.stdout}\n${result.stderr}`
        .split("\n")
        .find((line) => line.includes("operational-metric"));
      expect(metricLine).toContain('"event":"restore"');
      expect(metricLine).not.toContain("intentionally wrong passphrase");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records a successful content audit through its public CLI", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-command-"));
    const databaseFilename = join(root, "state.sqlite");
    const initialDatabase = openLearningDatabase({
      filename: databaseFilename,
      enableWal: false,
    });
    initialDatabase.close();

    try {
      const result = spawnSync(
        process.execPath,
        [
          tsxCli,
          "scripts/audit-content.ts",
          "--root",
          applicationRoot,
          "--mode",
          "cloud",
          "--output-dir",
          join(root, "reports"),
        ],
        {
          cwd: applicationRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            OPERATIONAL_METRICS_DATABASE_PATH: databaseFilename,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);

      const database = openLearningDatabase({
        filename: databaseFilename,
        enableWal: false,
      });
      const snapshot = createPrivacyFirstMonitor(database, {
        writeLog: () => undefined,
      }).snapshot();
      database.close();
      expect(snapshot.operations).toContainEqual({
        event: "content_audit",
        scope: "content-audit",
        outcome: "success",
        count: 1,
      });
      const metricLine = `${result.stdout}\n${result.stderr}`
        .split("\n")
        .find((line) => line.includes("operational-metric"));
      expect(metricLine).not.toContain(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records a rejected material update as an anonymous warning", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-command-"));
    const databaseFilename = join(root, "state.sqlite");
    const initialDatabase = openLearningDatabase({
      filename: databaseFilename,
      enableWal: false,
    });
    initialDatabase.close();

    try {
      const result = spawnSync(
        process.execPath,
        [
          tsxCli,
          "scripts/materials.ts",
          "update",
          "missing-course-id",
          "--yes",
          "--root",
          applicationRoot,
          "--local-material-root",
          join(root, "materials"),
          "--output-dir",
          join(root, "reports"),
        ],
        {
          cwd: applicationRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            OPERATIONAL_METRICS_DATABASE_PATH: databaseFilename,
          },
        },
      );
      expect(result.status).not.toBe(0);

      const database = openLearningDatabase({
        filename: databaseFilename,
        enableWal: false,
      });
      const snapshot = createPrivacyFirstMonitor(database, {
        writeLog: () => undefined,
      }).snapshot();
      database.close();
      expect(snapshot.alerts).toContainEqual({
        id: "materials-update-failed",
        severity: "warning",
        count: 1,
      });
      const metricLine = `${result.stdout}\n${result.stderr}`
        .split("\n")
        .find((line) => line.includes("operational-metric"));
      expect(metricLine).toContain('"event":"materials_update"');
      expect(metricLine).not.toContain("missing-course-id");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
