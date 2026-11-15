import Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  lstat,
  readdir,
} from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { z } from "zod";
import {
  createEncryptedBackup,
  restoreEncryptedBackup,
} from "../learning-state/backup";

export const batchSchema = z.object({
  formatVersion: z.literal(1),
  batchId: z.string().uuid(),
  createdAt: z.iso.datetime(),
  appVersion: z.string(),
  state: z.string().regex(/^[\w.-]+\.sqlite\.enc$/),
  discovery: z.string().regex(/^[\w.-]+\.sqlite\.enc$/),
  stateSchema: z.number().int(),
  discoverySchema: z.number().int(),
  stateCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
  discoveryCounts: z
    .record(z.string(), z.number().int().nonnegative())
    .optional(),
  restoreVerifiedAt: z.iso.datetime().nullable().default(null),
});
export type DiscoveryBackupBatch = z.infer<typeof batchSchema>;

export async function createDiscoveryBackup(options: {
  stateFilename: string;
  discoveryFilename: string;
  outputDirectory: string;
  passphrase: string;
  appVersion: string;
}) {
  if (resolve(options.stateFilename) === resolve(options.discoveryFilename))
    throw new Error("两个数据库需要独立路径。");
  const lock = new Database(options.stateFilename, { fileMustExist: true });
  lock.pragma("busy_timeout=5000");
  lock
    .prepare("ATTACH DATABASE ? AS discovery")
    .run(resolve(options.discoveryFilename));
  let locked = false;
  const batchId = randomUUID();
  const directory = join(options.outputDirectory, batchId);
  try {
    // Reserving both writer locks before either online snapshot establishes one
    // cross-database boundary while read-only backup connections remain usable.
    lock.exec("BEGIN IMMEDIATE");
    locked = true;
    const stateSchema = (
      lock
        .prepare("SELECT MAX(version) AS version FROM main.schema_migrations")
        .get() as { version: number }
    ).version;
    const discoverySchema = (
      lock
        .prepare(
          "SELECT MAX(version) AS version FROM discovery.discovery_migrations",
        )
        .get() as { version: number }
    ).version;
    const state = await createEncryptedBackup({
      sourceFilename: options.stateFilename,
      outputDirectory: directory,
      passphrase: options.passphrase,
    });
    const discovery = await createEncryptedBackup({
      sourceFilename: options.discoveryFilename,
      outputDirectory: directory,
      passphrase: options.passphrase,
    });
    const batch: DiscoveryBackupBatch = {
      formatVersion: 1,
      batchId,
      createdAt: new Date().toISOString(),
      appVersion: options.appVersion,
      state: state.manifest.filename,
      discovery: discovery.manifest.filename,
      stateSchema,
      discoverySchema,
      stateCounts: tableCounts(lock, "main"),
      discoveryCounts: tableCounts(lock, "discovery"),
      restoreVerifiedAt: null,
    };
    await writeFile(
      join(directory, "batch.json"),
      JSON.stringify(batch, null, 2) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    return { directory, batch };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    if (locked) lock.exec("ROLLBACK");
    lock.close();
  }
}

export async function restoreDiscoveryBackup(options: {
  batchFilename: string;
  targetDirectory: string;
  passphrase: string;
  recordVerification?: boolean;
}) {
  const batch = batchSchema.parse(
    JSON.parse(await readFile(options.batchFilename, "utf8")),
  );
  const target = resolve(options.targetDirectory);
  try {
    await lstat(target);
    throw new Error("恢复目标已存在。");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  // A complete pair is installed in one directory rename. The reservation
  // directory prevents concurrent restores from replacing the same target.
  const reservation = `${target}.restore-lock`;
  await mkdir(reservation, { mode: 0o700 });
  const staging = join(reservation, "pair");
  let createdTarget = false;
  try {
    await mkdir(staging, { mode: 0o700 });
    await restoreEncryptedBackup({
      backupFilename: join(dirname(options.batchFilename), batch.state),
      targetFilename: join(staging, "learning-state.sqlite"),
      passphrase: options.passphrase,
    });
    await restoreEncryptedBackup({
      backupFilename: join(dirname(options.batchFilename), batch.discovery),
      targetFilename: join(staging, "discovery.sqlite"),
      passphrase: options.passphrase,
    });
    const state = new Database(join(staging, "learning-state.sqlite"));
    const news = new Database(join(staging, "discovery.sqlite"));
    try {
      const stateVersion = (
        state
          .prepare("SELECT MAX(version) AS version FROM schema_migrations")
          .get() as { version: number }
      ).version;
      const newsVersion = (
        news
          .prepare("SELECT MAX(version) AS version FROM discovery_migrations")
          .get() as { version: number }
      ).version;
      if (
        stateVersion !== batch.stateSchema ||
        newsVersion !== batch.discoverySchema
      )
        throw new Error("备份批次版本不一致。");
      if (
        (state.pragma("foreign_key_check") as unknown[]).length ||
        (news.pragma("foreign_key_check") as unknown[]).length
      )
        throw new Error("恢复引用检查失败。");
      const ids = state
        .prepare("SELECT DISTINCT item_id FROM discovery_state")
        .all() as { item_id: string }[];
      const hasItem = news.prepare("SELECT id FROM items WHERE id=?");
      if (ids.some((row) => !hasItem.get(row.item_id)))
        throw new Error("个人资讯引用缺少目标。");
      for (const [handle, expected] of [
        [state, batch.stateCounts],
        [news, batch.discoveryCounts],
      ] as const) {
        if (
          expected &&
          JSON.stringify(tableCounts(handle)) !== JSON.stringify(expected)
        )
          throw new Error("恢复表行数与共同备份批次不一致。");
      }
      // In-flight paid calls remain reserved and require reconciliation.
      news
        .prepare(
          "UPDATE model_receipts SET state='unknown' WHERE state='dispatched'",
        )
        .run();
      news
        .prepare(
          "UPDATE jobs SET state='queued',lease_token=NULL,lease_until=NULL,available_at=? WHERE state='running'",
        )
        .run(Date.now());
      news.prepare("DELETE FROM worker_health").run();
      news.prepare("DELETE FROM temporary_content").run();
    } finally {
      state.close();
      news.close();
    }
    batch.restoreVerifiedAt = new Date().toISOString();
    await writeFile(
      join(staging, "restored-batch.json"),
      JSON.stringify(batch, null, 2),
      { mode: 0o600 },
    );
    // Recheck after the potentially slow decryption phase, inside reservation.
    try {
      await lstat(target);
      throw new Error("恢复目标已存在。");
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    await mkdir(target, { mode: 0o700 });
    createdTarget = true;
    const installed = join(target, "data");
    await rename(staging, installed);
    // Drill controls defer annotation until every negative control has passed.
    if (options.recordVerification !== false)
      await recordDiscoveryBackupVerification(options.batchFilename);
    return { target: installed, batch };
  } catch (error) {
    if (createdTarget) await rm(target, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(reservation, { recursive: true, force: true });
  }
}

function tableCounts(
  handle: Database.Database,
  schema: "main" | "discovery" = "main",
) {
  const tables = handle
    .prepare(
      `SELECT name FROM ${schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => {
      const quoted = name.replaceAll('"', '""');
      const row = handle
        .prepare(`SELECT COUNT(*) AS total FROM ${schema}."${quoted}"`)
        .get() as { total: number };
      return [name, row.total];
    }),
  );
}

export async function inspectDiscoveryBackupBatches(outputDirectory: string) {
  const entries = await readdir(outputDirectory, { withFileTypes: true });
  const result: {
    directory: string;
    batch: DiscoveryBackupBatch | null;
    valid: boolean;
    byteSize: number;
  }[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !z.uuid().safeParse(entry.name).success)
      continue;
    const directory = join(outputDirectory, entry.name);
    let batch: DiscoveryBackupBatch | null = null;
    let valid = true;
    let byteSize = 0;
    try {
      batch = batchSchema.parse(
        JSON.parse(await readFile(join(directory, "batch.json"), "utf8")),
      );
      if (batch.batchId !== entry.name || batch.state === batch.discovery)
        throw new Error("批次身份不一致");
      for (const filename of [batch.state, batch.discovery]) {
        const manifest = JSON.parse(
          await readFile(join(directory, filename + ".manifest.json"), "utf8"),
        );
        const encrypted = await readFile(join(directory, filename));
        if (
          manifest.filename !== filename ||
          manifest.formatVersion !== 1 ||
          manifest.byteSize !== encrypted.byteLength ||
          manifest.sha256 !==
            createHash("sha256").update(encrypted).digest("hex")
        )
          valid = false;
        byteSize += encrypted.byteLength;
      }
    } catch {
      valid = false;
    }
    result.push({ directory, batch, valid, byteSize });
  }
  return result;
}

/** Keep complete pairs together: newest backup on each of seven days and three weeks. */
export async function pruneDiscoveryBackups(outputDirectory: string) {
  const inspected = await inspectDiscoveryBackupBatches(outputDirectory);
  const candidates = inspected
    .filter((entry) => entry.valid && entry.batch)
    .sort((a, b) => b.batch!.createdAt.localeCompare(a.batch!.createdAt));
  const retained = new Set<string>();
  const days = new Set<string>();
  const weeks = new Set<string>();
  for (const entry of candidates) {
    const day = entry.batch!.createdAt.slice(0, 10);
    const date = new Date(entry.batch!.createdAt);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() || 7) + 1);
    const week = date.toISOString().slice(0, 10);
    if (
      (days.size < 7 && !days.has(day)) ||
      (weeks.size < 3 && !weeks.has(week))
    )
      retained.add(entry.directory);
    if (days.size < 7) days.add(day);
    if (weeks.size < 3) weeks.add(week);
  }
  // Keep the most recent proven pair even when a newer unverified backup from
  // the same day replaces it in the ordinary retention windows.
  const latestVerified = candidates
    .filter((entry) => entry.batch!.restoreVerifiedAt)
    .sort((a, b) =>
      b.batch!.restoreVerifiedAt!.localeCompare(a.batch!.restoreVerifiedAt!),
    )[0];
  if (latestVerified) retained.add(latestVerified.directory);
  let removed = 0;
  for (const entry of candidates) {
    if (retained.has(entry.directory)) continue;
    const batch = entry.batch!;
    const allowed = new Set([
      "batch.json",
      batch.state,
      batch.state + ".manifest.json",
      batch.discovery,
      batch.discovery + ".manifest.json",
    ]);
    const children = await readdir(entry.directory, { withFileTypes: true });
    if (children.some((child) => !child.isFile() || !allowed.has(child.name)))
      continue;
    await rm(entry.directory, { recursive: true });
    removed++;
  }
  return { removed, retained: inspected.length - removed };
}

export async function recordDiscoveryBackupVerification(
  batchFilename: string,
): Promise<boolean> {
  const annotation = `${batchFilename}.${randomUUID()}.tmp`;
  try {
    const batch = batchSchema.parse(
      JSON.parse(await readFile(batchFilename, "utf8")),
    );
    batch.restoreVerifiedAt = new Date().toISOString();
    await writeFile(annotation, JSON.stringify(batch, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await rename(annotation, batchFilename);
    return true;
  } catch {
    return false;
  } finally {
    await rm(annotation, { force: true });
  }
}
