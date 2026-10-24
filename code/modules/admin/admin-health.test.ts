import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createEncryptedBackup,
  restoreEncryptedBackup,
} from "../learning-state/backup";
import { openLearningDatabase } from "../learning-state/database";
import type { UserRecord } from "../learning-state/repository";
import {
  buildRuntimeAdminHealthSnapshot,
  handleAdminHealthRequest,
  isAdminUser,
  type AdminHealthSnapshot,
} from "./admin-health";

const admin: UserRecord = {
  id: "github-42",
  mode: "cloud",
  githubId: "42",
  displayName: "Admin",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const learner: UserRecord = { ...admin, id: "github-99", githubId: "99" };

const snapshot: AdminHealthSnapshot = {
  generatedAt: "2026-08-09T00:00:00.000Z",
  mode: "cloud",
  catalog: { status: "ok", errorCount: 0, warningCount: 2 },
  materials: {
    status: "not-mounted",
    repositoriesChecked: 0,
    nonGitReferencesSkipped: 0,
    counts: {
      latest: 0,
      behind: 0,
      ahead: 0,
      diverged: 0,
      dirty: 0,
      "check-failed": 0,
    },
  },
  database: {
    status: "ok",
    schemaVersion: 2,
    sqliteVersion: "3.51.3",
    journalMode: "wal",
  },
  backup: { status: "not-configured" },
  observability: {
    generatedAt: "2026-08-09T00:00:00.000Z",
    windowStartedAt: "2026-08-08T00:00:00.000Z",
    totalPageViews: 7,
    pageViews: [{ scope: "home", count: 7 }],
    operations: [],
    failures: [],
    alerts: [],
  },
  deployment: { version: "test", nodeMajor: 24 },
};

describe("admin health boundary", () => {
  it("uses the stable GitHub ID and never grants local users admin access", () => {
    expect(isAdminUser(admin, { ADMIN_GITHUB_IDS: "42, 100" })).toBe(true);
    expect(isAdminUser(learner, { ADMIN_GITHUB_IDS: "42, 100" })).toBe(false);
    expect(
      isAdminUser(
        { ...admin, mode: "local", githubId: null },
        {
          ADMIN_GITHUB_IDS: "42",
        },
      ),
    ).toBe(false);
  });

  it("rejects anonymous and ordinary users before building a snapshot", async () => {
    let buildCount = 0;
    const buildSnapshot = async () => {
      buildCount += 1;
      return snapshot;
    };

    await expect(
      handleAdminHealthRequest(
        new Request("https://hub.test/api/admin/health"),
        {
          user: null,
          environment: { ADMIN_GITHUB_IDS: "42" },
          buildSnapshot,
        },
      ),
    ).resolves.toMatchObject({ status: 401 });

    await expect(
      handleAdminHealthRequest(
        new Request("https://hub.test/api/admin/health"),
        {
          user: learner,
          environment: { ADMIN_GITHUB_IDS: "42" },
          buildSnapshot,
        },
      ),
    ).resolves.toMatchObject({ status: 403 });

    expect(buildCount).toBe(0);
  });

  it("returns only health summaries to an administrator", async () => {
    const response = await handleAdminHealthRequest(
      new Request("https://hub.test/api/admin/health"),
      {
        user: admin,
        environment: { ADMIN_GITHUB_IDS: "42" },
        buildSnapshot: async () => snapshot,
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(snapshot);
    expect(JSON.stringify(body)).not.toContain("/Users/");
    expect(JSON.stringify(body)).not.toContain("private note");
    expect(JSON.stringify(body)).not.toContain("token");
  });

  it("does not accept health mutations", async () => {
    const response = await handleAdminHealthRequest(
      new Request("https://hub.test/api/admin/health", { method: "POST" }),
      {
        user: admin,
        environment: { ADMIN_GITHUB_IDS: "42" },
        buildSnapshot: async () => snapshot,
      },
    );

    expect(response.status).toBe(405);
  });

  it("reports configured backup health without exposing paths or filenames", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-admin-backup-"));
    const sourceFilename = join(root, "state.sqlite");
    const backupDirectory = join(root, "backups");
    const database = openLearningDatabase({
      filename: sourceFilename,
      enableWal: false,
    });

    try {
      const backup = await createEncryptedBackup({
        sourceFilename,
        outputDirectory: backupDirectory,
        passphrase: "correct horse battery staple",
        now: () => new Date("2026-08-11T01:02:03.000Z"),
      });
      await restoreEncryptedBackup({
        backupFilename: backup.backupPath,
        targetFilename: join(root, "restored.sqlite"),
        passphrase: "correct horse battery staple",
        now: () => new Date("2026-08-11T02:03:04.000Z"),
      });

      const result = await buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database,
        environment: {
          APP_VERSION: "test",
          BACKUP_OUTPUT_DIR: backupDirectory,
        },
        contentRoot: resolve(import.meta.dirname, "../../content"),
        now: () => new Date("2026-08-11T03:00:00.000Z"),
      });

      expect(result.backup).toMatchObject({
        status: "ok",
        retainedBackups: 1,
        latestCreatedAt: "2026-08-11T01:02:03.000Z",
        latestRestoreVerifiedAt: "2026-08-11T02:03:04.000Z",
        latestByteSize: backup.manifest.byteSize,
        reasons: [],
      });
      expect(result.backup).not.toMatchObject({ status: "not-configured" });
      if (result.backup.status !== "not-configured") {
        expect(result.backup.latestAgeHours).toBeCloseTo(1.97, 1);
      }
      expect(JSON.stringify(result.backup)).not.toContain(root);
      expect(JSON.stringify(result.backup)).not.toContain(
        backup.manifest.filename,
      );
    } finally {
      database.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("degrades backup health when the newest backup exceeds the age threshold", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-admin-backup-"));
    const sourceFilename = join(root, "state.sqlite");
    const backupDirectory = join(root, "backups");
    const database = openLearningDatabase({
      filename: sourceFilename,
      enableWal: false,
    });

    try {
      // R07 regression: a valid backup dated years ago must not read as ok.
      await createEncryptedBackup({
        sourceFilename,
        outputDirectory: backupDirectory,
        passphrase: "correct horse battery staple",
        now: () => new Date("2020-01-01T00:00:00.000Z"),
      });

      const stale = await buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database,
        environment: { BACKUP_OUTPUT_DIR: backupDirectory },
        contentRoot: resolve(import.meta.dirname, "../../content"),
        now: () => new Date("2026-08-11T03:00:00.000Z"),
      });
      expect(stale.backup).toMatchObject({
        status: "degraded",
        reasons: expect.arrayContaining(["backup-stale", "restore-unverified"]),
      });

      // The future guard catches tampered or clock-skewed manifests.
      await rm(backupDirectory, { recursive: true, force: true });
      await createEncryptedBackup({
        sourceFilename,
        outputDirectory: backupDirectory,
        passphrase: "correct horse battery staple",
        now: () => new Date("2099-01-01T00:00:00.000Z"),
      });
      const future = await buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database,
        environment: { BACKUP_OUTPUT_DIR: backupDirectory },
        contentRoot: resolve(import.meta.dirname, "../../content"),
        now: () => new Date("2026-08-11T03:00:00.000Z"),
      });
      expect(future.backup).toMatchObject({
        status: "degraded",
        reasons: expect.arrayContaining(["backup-future"]),
      });

      // Deployments can align the thresholds with their own RPO.
      await rm(backupDirectory, { recursive: true, force: true });
      await createEncryptedBackup({
        sourceFilename,
        outputDirectory: backupDirectory,
        passphrase: "correct horse battery staple",
        now: () => new Date("2020-01-01T00:00:00.000Z"),
      });
      const relaxed = await buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database,
        environment: {
          BACKUP_OUTPUT_DIR: backupDirectory,
          BACKUP_MAX_AGE_HOURS: "999999",
          BACKUP_MAX_RESTORE_VERIFICATION_AGE_DAYS: "999999",
        },
        contentRoot: resolve(import.meta.dirname, "../../content"),
        now: () => new Date("2026-08-11T03:00:00.000Z"),
      });
      expect(relaxed.backup).toMatchObject({
        status: "degraded",
        reasons: expect.arrayContaining(["restore-unverified"]),
      });
    } finally {
      database.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("degrades backup health when no backup exists or restore verification went stale", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-admin-backup-"));
    const sourceFilename = join(root, "state.sqlite");
    const backupDirectory = join(root, "backups");
    const database = openLearningDatabase({
      filename: sourceFilename,
      enableWal: false,
    });

    try {
      const empty = await buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database,
        environment: { BACKUP_OUTPUT_DIR: backupDirectory },
        contentRoot: resolve(import.meta.dirname, "../../content"),
        now: () => new Date("2026-08-11T03:00:00.000Z"),
      });
      expect(empty.backup).toMatchObject({
        status: "degraded",
        reasons: ["no-valid-backup"],
      });

      await createEncryptedBackup({
        sourceFilename,
        outputDirectory: backupDirectory,
        passphrase: "correct horse battery staple",
        now: () => new Date("2026-08-10T00:00:00.000Z"),
      });
      // A restore verified shortly after the backup keeps the summary healthy.
      const backups = await readdir(backupDirectory);
      const encryptedBackup = backups.find((name) =>
        name.endsWith(".sqlite.enc"),
      );
      expect(encryptedBackup).toBeDefined();
      await restoreEncryptedBackup({
        backupFilename: join(backupDirectory, encryptedBackup!),
        targetFilename: join(root, "restored.sqlite"),
        passphrase: "correct horse battery staple",
        now: () => new Date("2026-08-10T06:00:00.000Z"),
      });

      const fresh = await buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database,
        environment: {
          BACKUP_OUTPUT_DIR: backupDirectory,
          BACKUP_MAX_AGE_HOURS: "72",
        },
        contentRoot: resolve(import.meta.dirname, "../../content"),
        now: () => new Date("2026-08-11T03:00:00.000Z"),
      });
      expect(fresh.backup).toMatchObject({ status: "ok", reasons: [] });

      // The same verification read beyond the configured window degrades.
      const staleVerification = await buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database,
        environment: {
          BACKUP_OUTPUT_DIR: backupDirectory,
          BACKUP_MAX_AGE_HOURS: "72",
          BACKUP_MAX_RESTORE_VERIFICATION_AGE_DAYS: "1",
        },
        contentRoot: resolve(import.meta.dirname, "../../content"),
        now: () => new Date("2026-08-12T07:00:00.000Z"),
      });
      expect(staleVerification.backup).toMatchObject({
        status: "degraded",
        reasons: expect.arrayContaining(["restore-stale"]),
      });
    } finally {
      database.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("degrades backup health when encrypted content no longer matches its manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-admin-backup-"));
    const sourceFilename = join(root, "state.sqlite");
    const backupDirectory = join(root, "backups");
    const database = openLearningDatabase({
      filename: sourceFilename,
      enableWal: false,
    });

    try {
      const backup = await createEncryptedBackup({
        sourceFilename,
        outputDirectory: backupDirectory,
        passphrase: "correct horse battery staple",
        now: () => new Date("2026-08-11T01:02:03.000Z"),
      });
      await writeFile(backup.backupPath, "corrupted backup content");

      const result = await buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database,
        environment: { BACKUP_OUTPUT_DIR: backupDirectory },
        contentRoot: resolve(import.meta.dirname, "../../content"),
      });

      expect(result.backup).toMatchObject({
        status: "degraded",
        retainedBackups: 1,
      });
    } finally {
      database.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
