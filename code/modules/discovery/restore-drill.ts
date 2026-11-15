import Database from "better-sqlite3";
import { hostname, tmpdir } from "node:os";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createDiscoveryBackup,
  restoreDiscoveryBackup,
  recordDiscoveryBackupVerification,
} from "./backup";

export async function runDiscoveryRestoreDrill(options: {
  stateFilename: string;
  discoveryFilename: string;
  outputDirectory: string;
  passphrase: string;
  appVersion: string;
  hostIdentity?: string;
  backupDirectory?: string;
}) {
  const started = Date.now();
  const root = await mkdtemp(join(tmpdir(), "alh-discovery-drill-"));
  const checks: { name: string; passed: boolean }[] = [];
  let batchId: string | null = null;
  let expectedCounts: unknown = null;
  let restoredCounts: unknown = null;
  function check(name: string, passed: boolean) {
    checks.push({ name, passed });
    if (!passed) throw new Error(name);
  }
  async function refuses(
    name: string,
    operation: () => Promise<unknown>,
    reason: RegExp,
  ) {
    let rejected = false;
    try {
      await operation();
    } catch (error) {
      rejected = error instanceof Error && reason.test(error.message);
    }
    check(name, rejected);
  }
  try {
    const backup = await createDiscoveryBackup({
      ...options,
      outputDirectory: options.backupDirectory ?? join(root, "backup"),
    });
    batchId = backup.batch.batchId;
    expectedCounts = {
      state: backup.batch.stateCounts,
      discovery: backup.batch.discoveryCounts,
    };
    const batchFilename = join(backup.directory, "batch.json");
    const restore = (target: string, passphrase = options.passphrase) =>
      restoreDiscoveryBackup({
        batchFilename,
        targetDirectory: join(root, target),
        passphrase,
        recordVerification: false,
      });
    check(
      "共同批次记录两个库的全部业务表行数",
      Boolean(backup.batch.stateCounts && backup.batch.discoveryCounts),
    );
    const restored = await restore("restored");
    const state = new Database(join(restored.target, "learning-state.sqlite"), {
      readonly: true,
    });
    const news = new Database(join(restored.target, "discovery.sqlite"), {
      readonly: true,
    });
    try {
      check(
        "两个恢复库均通过完整性检查",
        state.pragma("integrity_check", { simple: true }) === "ok" &&
          news.pragma("integrity_check", { simple: true }) === "ok",
      );
      const counts = (
        db: Database.Database,
        expected: Record<string, number>,
      ) =>
        Object.fromEntries(
          Object.keys(expected).map((name) => [
            name,
            (
              db
                .prepare(
                  `SELECT count(*) AS total FROM "${name.replaceAll('"', '""')}"`,
                )
                .get() as { total: number }
            ).total,
          ]),
        );
      const stateCounts = counts(state, backup.batch.stateCounts!);
      const discoveryCounts = counts(news, backup.batch.discoveryCounts!);
      restoredCounts = { state: stateCounts, discovery: discoveryCounts };
      check(
        "全部个人表与业务表按批次恢复，临时引用与心跳按恢复规则清空",
        JSON.stringify(stateCounts) ===
          JSON.stringify(backup.batch.stateCounts) &&
          Object.entries(discoveryCounts).every(
            ([name, total]) =>
              total ===
              (["worker_health", "temporary_content"].includes(name)
                ? 0
                : backup.batch.discoveryCounts![name]),
          ),
      );
      check(
        "运行中任务租约已复位",
        !news.prepare("SELECT 1 FROM jobs WHERE state='running'").get(),
      );
      check(
        "付费在途回执转为待核对",
        !news
          .prepare("SELECT 1 FROM model_receipts WHERE state='dispatched'")
          .get(),
      );
      check(
        "两库外键和个人资讯引用完整",
        !(state.pragma("foreign_key_check") as unknown[]).length &&
          !(news.pragma("foreign_key_check") as unknown[]).length &&
          (
            state.prepare("SELECT item_id FROM discovery_state").all() as {
              item_id: string;
            }[]
          ).every((row) =>
            Boolean(
              news.prepare("SELECT 1 FROM items WHERE id=?").get(row.item_id),
            ),
          ),
      );
    } finally {
      state.close();
      news.close();
    }
    await refuses(
      "错误口令必须拒绝",
      () => restore("wrong", "different-incorrect-passphrase"),
      /decrypt/,
    );
    const encryptedPath = join(backup.directory, backup.batch.discovery);
    const original = await readFile(encryptedPath);
    const corrupt = Buffer.from(original);
    corrupt[corrupt.length - 1] ^= 1;
    try {
      await writeFile(encryptedPath, corrupt);
      await refuses("篡改密文必须拒绝", () => restore("corrupt"), /decrypt/);
    } finally {
      await writeFile(encryptedPath, original);
    }
    await refuses("覆盖已有目标必须拒绝", () => restore("restored"), /已存在/);
    check(
      "完整恢复与反向对照通过后才记录共同批次验证时间",
      await recordDiscoveryBackupVerification(batchFilename),
    );
    return { passed: checks.length };
  } catch (error) {
    if (!checks.some((check) => !check.passed))
      checks.push({ name: "演练流程完成", passed: false });
    throw error;
  } finally {
    const report = {
      generatedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      environment: {
        hostIdentity: options.hostIdentity ?? hostname(),
        containerHostname: hostname(),
        platform: `${process.platform}/${process.arch}`,
        node: process.version,
        appVersion: options.appVersion,
      },
      batchId,
      expectedCounts,
      restoredCounts,
      checks,
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
    };
    try {
      await mkdir(options.outputDirectory, { recursive: true, mode: 0o700 });
      await writeFile(
        join(options.outputDirectory, "discovery-restore-drill.json"),
        JSON.stringify(report, null, 2) + "\n",
        { mode: 0o600 },
      );
      await writeFile(
        join(options.outputDirectory, "discovery-restore-drill.md"),
        [
          "# 两库恢复演练",
          "",
          `日期：${report.generatedAt}`,
          `耗时：${report.elapsedMs} ms`,
          `主机：${report.environment.hostIdentity}；维护容器：${report.environment.containerHostname}`,
          `平台：${report.environment.platform}；Node：${report.environment.node}；应用：${options.appVersion}`,
          "",
          "| 结果 | 检查 |",
          "| --- | --- |",
          ...checks.map(
            (check) => `| ${check.passed ? "PASS" : "FAIL"} | ${check.name} |`,
          ),
          "",
          "逐表行数保存在同名 JSON 中；临时原文引用和 worker 心跳恢复后为零。",
          "",
        ].join("\n"),
        { mode: 0o600 },
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}
