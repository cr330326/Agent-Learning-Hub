import { it, expect, vi } from "vitest";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  cp,
  mkdir,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openLearningDatabase } from "../learning-state/database";
import { createLearningStateRepository } from "../learning-state/repository";
import { saveDiscoveryState } from "../learning-state/discovery-state";
import { buildRuntimeAdminHealthSnapshot } from "../admin/admin-health";
import { createEncryptedBackup } from "../learning-state/backup";
import { openDiscoveryDatabase } from "./database";
import { DiscoveryRepository } from "./repository";
import { DiscoveryBudget } from "./budget";
import {
  createDiscoveryBackup,
  restoreDiscoveryBackup,
  pruneDiscoveryBackups,
} from "./backup";
import * as backupModule from "./backup";
import { runDiscoveryRestoreDrill } from "./restore-drill";
const passphrase = "operations-fixture-passphrase";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "alh-operations-"));
  const stateFilename = join(root, "state.sqlite"),
    discoveryFilename = join(root, "discovery.sqlite");
  const state = openLearningDatabase({ filename: stateFilename });
  const news = openDiscoveryDatabase(discoveryFilename);
  const repo = new DiscoveryRepository(news);
  const user = createLearningStateRepository(state).createUser({
    mode: "cloud",
    githubId: "fixture",
    displayName: "测试",
  });
  const source = repo.saveSource(
    {
      id: "source",
      name: "来源",
      kind: "json",
      url: "https://example.com/feed",
      topics: ["Harness Engineering"],
    },
    "admin",
  );
  repo.ingestPage(
    source,
    [{ recordId: "one", title: "工程实践", url: "https://example.com/one" }],
    "run",
  );
  const item = news.handle.prepare("SELECT id FROM items").get() as {
    id: string;
  };
  saveDiscoveryState(state, user.id, { itemId: item.id, note: "恢复演练用例" });
  return {
    root,
    stateFilename,
    discoveryFilename,
    state,
    news,
    repo,
    close: async () => {
      state.close();
      news.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
it("runs the complete two-database drill including live leases, paid calls and all negative controls", async () => {
  const f = await fixture();
  try {
    f.repo.jobs.claim();
    f.repo.jobs.workerHeartbeat("worker", "job");
    const budget = new DiscoveryBudget(f.news);
    budget.reserve({
      key: "paid",
      maximumMicros: 100,
      priceVersion: "fixture",
      currency: "CNY",
      exchangeRate: 1,
    });
    budget.dispatch("paid");
    const result = await runDiscoveryRestoreDrill({
      ...f,
      outputDirectory: join(f.root, "report"),
      passphrase,
      appVersion: "fixture-v1",
      hostIdentity: "test-host",
    });
    expect(result.passed).toBe(10);
    const report = JSON.parse(
      await readFile(
        join(f.root, "report/discovery-restore-drill.json"),
        "utf8",
      ),
    );
    expect(report.failed).toBe(0);
    expect(report.environment).toMatchObject({
      hostIdentity: "test-host",
      appVersion: "fixture-v1",
    });
    expect(report.expectedCounts.state.discovery_state).toBe(1);
    expect(report.restoredCounts.discovery.worker_health).toBe(0);
    expect(
      f.news.handle.prepare("SELECT state FROM model_receipts").get(),
    ).toEqual({ state: "dispatched" });
    expect(f.news.handle.prepare("SELECT state FROM jobs").get()).toEqual({
      state: "running",
    });
  } finally {
    await f.close();
  }
});
it("requires a complete paired backup for discovery health and rejects a corrupt member", async () => {
  const f = await fixture();
  try {
    const outputDirectory = join(f.root, "backup");
    await createEncryptedBackup({
      sourceFilename: f.stateFilename,
      outputDirectory,
      passphrase,
    });
    const snapshot = () =>
      buildRuntimeAdminHealthSnapshot({
        mode: "cloud",
        database: f.state,
        environment: {
          BACKUP_OUTPUT_DIR: outputDirectory,
          DISCOVERY_DATABASE_PATH: f.discoveryFilename,
        },
      });
    expect((await snapshot()).backup).toMatchObject({
      status: "degraded",
      reasons: ["no-valid-backup"],
    });
    const pair = await createDiscoveryBackup({
      ...f,
      outputDirectory,
      passphrase,
      appVersion: "test",
    });
    const batchFilename = join(pair.directory, "batch.json");
    expect((await snapshot()).backup).toMatchObject({
      status: "degraded",
      retainedBackups: 1,
      reasons: ["restore-unverified"],
    });
    await restoreDiscoveryBackup({
      batchFilename,
      targetDirectory: join(f.root, "restore"),
      passphrase,
    });
    expect((await snapshot()).backup).toMatchObject({
      status: "ok",
      retainedBackups: 1,
    });
    await createDiscoveryBackup({
      ...f,
      outputDirectory,
      passphrase,
      appVersion: "test",
    });
    const healthy = (await snapshot()).backup;
    expect(healthy).toMatchObject({ status: "ok", retainedBackups: 2 });
    if (healthy.status !== "not-configured")
      expect(healthy.latestRestoreVerifiedAt).toBeTruthy();
    const filename = join(pair.directory, pair.batch.discovery);
    const data = await readFile(filename);
    data[data.length - 1] ^= 1;
    await writeFile(filename, data);
    expect((await snapshot()).backup).toMatchObject({
      status: "degraded",
      reasons: ["integrity-mismatch"],
    });
  } finally {
    await f.close();
  }
});
it("retains whole daily/weekly batches and preserves unknown files or invalid directories", async () => {
  const f = await fixture();
  try {
    const outputDirectory = join(f.root, "backup");
    const pair = await createDiscoveryBackup({
      ...f,
      outputDirectory,
      passphrase,
      appVersion: "test",
    });
    const directories: string[] = [];
    for (let index = 0; index < 21; index++) {
      const id = randomUUID();
      const dir = join(outputDirectory, id);
      await cp(pair.directory, dir, { recursive: true });
      await writeFile(
        join(dir, "batch.json"),
        JSON.stringify({
          ...pair.batch,
          batchId: id,
          createdAt: new Date(Date.UTC(2026, 10, 15 - index)).toISOString(),
        }),
      );
      directories.push(dir);
    }
    await writeFile(
      join(directories.at(-1)!, "operator-note.txt"),
      "keep this note",
    );
    const verifiedDirectory = directories.at(-2)!;
    const verifiedBatch = JSON.parse(
      await readFile(join(verifiedDirectory, "batch.json"), "utf8"),
    );
    await writeFile(
      join(verifiedDirectory, "batch.json"),
      JSON.stringify({
        ...verifiedBatch,
        restoreVerifiedAt: new Date().toISOString(),
      }),
    );
    const invalid = join(outputDirectory, randomUUID());
    await mkdir(invalid);
    await writeFile(join(invalid, "batch.json"), "invalid");
    const result = await pruneDiscoveryBackups(outputDirectory);
    expect(result.removed).toBeGreaterThan(10);
    await expect(
      access(join(directories.at(-1)!, "operator-note.txt")),
    ).resolves.toBeUndefined();
    await expect(access(join(invalid, "batch.json"))).resolves.toBeUndefined();
    await expect(
      access(join(verifiedDirectory, "batch.json")),
    ).resolves.toBeUndefined();
    await expect(
      access(join(pair.directory, "batch.json")),
    ).resolves.toBeUndefined();
  } finally {
    await f.close();
  }
});

it("does not mark a persistent batch verified when a negative control unexpectedly succeeds", async () => {
  const f = await fixture();
  const original = backupModule.restoreDiscoveryBackup;
  const spy = vi
    .spyOn(backupModule, "restoreDiscoveryBackup")
    .mockImplementation((options) =>
      original({
        ...options,
        passphrase: options.targetDirectory.endsWith("/wrong")
          ? passphrase
          : options.passphrase,
      }),
    );
  try {
    const backupDirectory = join(f.root, "persistent-backups");
    await expect(
      runDiscoveryRestoreDrill({
        ...f,
        backupDirectory,
        outputDirectory: join(f.root, "report"),
        passphrase,
        appVersion: "test",
      }),
    ).rejects.toThrow("错误口令必须拒绝");
    const entries =
      await backupModule.inspectDiscoveryBackupBatches(backupDirectory);
    expect(entries).toHaveLength(1);
    expect(entries[0].batch?.restoreVerifiedAt).toBeNull();
    const report = JSON.parse(
      await readFile(
        join(f.root, "report/discovery-restore-drill.json"),
        "utf8",
      ),
    );
    expect(report.failed).toBe(1);
    expect(JSON.stringify(report)).not.toContain("恢复演练用例");
  } finally {
    spy.mockRestore();
    await f.close();
  }
});
