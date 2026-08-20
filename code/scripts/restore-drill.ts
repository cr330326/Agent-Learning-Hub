// GATE-07: prove an encrypted SQLite backup restores into a clean environment.
//
// A backup that has never been restored is a hypothesis, not a backup. This
// drill exercises the real `db:backup` / `db:restore` commands rather than
// calling the backup module directly, so a regression in the CLI surface fails
// here too.
//
// "Clean environment" is the point: the restore target is a fresh directory
// that has never held a database, WAL, or shared-memory file. Restoring on top
// of a live database would prove far less — SQLite would happily keep serving
// the old pages from the WAL.
//
// Runs on a developer machine and on the production host alike. `--source`
// snapshots a live database through SQLite's online backup API and never writes
// to the original, so the drill is safe to point at the production volume.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import Database from "better-sqlite3";

import { openLearningDatabase } from "../modules/learning-state/database";
import { createLearningStateRepository } from "../modules/learning-state/repository";

const PRIVATE_TABLES = [
  "users",
  "accounts",
  "sessions",
  "item_progress",
  "stage_task_progress",
  "notes",
  "bookmarks",
  "stage_outcomes",
] as const;

type Step = {
  name: string;
  outcome: "pass" | "fail";
  detail: string;
};

const steps: Step[] = [];
const startedAt = Date.now();
let failed = false;

function gitRevision(): string | null {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: resolve(import.meta.dirname, ".."),
    encoding: "utf8",
  });
  return result.status === 0 ? (result.stdout ?? "").trim() || null : null;
}

function record(name: string, outcome: "pass" | "fail", detail = ""): void {
  steps.push({ name, outcome, detail });
  if (outcome === "fail") failed = true;
  const marker = outcome === "pass" ? "PASS" : "FAIL";
  console.log(`${marker}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function expect(name: string, condition: boolean, detail = ""): void {
  record(name, condition ? "pass" : "fail", detail);
}

function usage(): void {
  process.stdout.write(`Usage: tsx scripts/restore-drill.ts [options]

  --source <db>       Live database to drill. It is snapshotted read-only
                      through SQLite's online backup API and never written to.
                      Default: a synthetic seeded fixture.
  --output-dir <dir>  Evidence directory (default: reports/restore-drill).
  --keep              Keep the temporary drill directory for inspection.
  --help              Show this message.

Requires BACKUP_PASSPHRASE (at least 12 characters), the same secret the
production backups were created with when drilling a real backup.
`);
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function countRows(filename: string): Record<string, number> {
  const handle = new Database(filename, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const counts: Record<string, number> = {};
    for (const table of PRIVATE_TABLES) {
      const row = handle
        .prepare(`SELECT COUNT(*) AS total FROM ${table}`)
        .get() as {
        total: number;
      };
      counts[table] = row.total;
    }
    return counts;
  } finally {
    handle.close();
  }
}

function tableNames(filename: string): string[] {
  const handle = new Database(filename, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return (
      handle
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all() as { name: string }[]
    ).map((row) => row.name);
  } finally {
    handle.close();
  }
}

function runNpm(
  args: string[],
  environment: Record<string, string>,
): { status: number; output: string } {
  const result = spawnSync("npm", args, {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, ...environment },
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

// ---- Fixture ---------------------------------------------------------------

// A synthetic source covers every private table, so a restore that silently
// drops one is caught by the row-count comparison rather than passing because
// the fixture happened not to use that table.
function seedSyntheticDatabase(filename: string): void {
  const database = openLearningDatabase({ filename, enableWal: true });
  try {
    const repository = createLearningStateRepository(database);
    const user = repository.createUser({
      mode: "cloud",
      githubId: "restore-drill",
      displayName: "Restore Drill",
    });
    repository.createAccount({
      userId: user.id,
      provider: "github",
      providerAccountId: "restore-drill",
    });
    repository.createSession({
      userId: user.id,
      tokenHash: "a".repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    repository.saveItemProgress({
      userId: user.id,
      itemId: "agent-loop-maintainer-guide",
      status: "in_progress",
      position: 512,
    });
    repository.saveStageTaskProgress({
      userId: user.id,
      taskId: "stage-0-task-0",
      completed: true,
    });
    repository.saveNote({
      userId: user.id,
      scopeType: "item",
      scopeId: "agent-loop-maintainer-guide",
      body: "restore drill canary",
    });
    repository.setBookmark({
      userId: user.id,
      itemId: "agent-loop-maintainer-guide",
    });
    repository.createStageOutcome({
      userId: user.id,
      stageId: "stage-0",
      kind: "repository",
      url: "https://github.com/example/restore-drill",
    });
    repository.confirmStageCompletion(user.id, "stage-0");
  } finally {
    database.close();
  }
}

// ---- Drill -----------------------------------------------------------------

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
    return;
  }

  const passphrase = process.env.BACKUP_PASSPHRASE?.trim() ?? "";
  if (passphrase.length < 12) {
    throw new Error(
      "Set BACKUP_PASSPHRASE (at least 12 characters) before running the drill.",
    );
  }

  const applicationRoot = resolve(import.meta.dirname, "..");
  const outputDirectory = resolve(
    applicationRoot,
    optionValue("--output-dir") ?? "reports/restore-drill",
  );
  const drillRoot = mkdtempSync(
    join(tmpdir(), "agent-learning-restore-drill-"),
  );
  const sourceOption = optionValue("--source");

  try {
    // 1. Source database. A real one is snapshotted; the snapshot is drilled.
    const sourceFilename = join(drillRoot, "source", "learning-state.sqlite");
    mkdirSync(dirname(sourceFilename), { recursive: true, mode: 0o700 });
    if (sourceOption) {
      const original = resolve(sourceOption);
      if (!existsSync(original)) {
        throw new Error(`Source database does not exist: ${original}`);
      }
      // The SQLite online backup API, not a file copy: a live database keeps
      // committed pages in the -wal file, so copying only the .sqlite can
      // snapshot a torn or stale state. This opens read-only and never writes
      // to the original, so it is safe against the production volume.
      const live = new Database(original, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        await live.backup(sourceFilename);
      } finally {
        live.close();
      }
      record("live source snapshotted read-only", "pass", basename(original));
    } else {
      seedSyntheticDatabase(sourceFilename);
      record("synthetic source database seeded", "pass", "every private table");
    }

    const sourceCounts = countRows(sourceFilename);
    const sourceTables = tableNames(sourceFilename);
    expect(
      "source database carries rows to lose",
      Object.values(sourceCounts).some((total) => total > 0),
      JSON.stringify(sourceCounts),
    );

    // 2. Back up through the real CLI.
    const backupDirectory = join(drillRoot, "backups");
    mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    const backup = runNpm(
      [
        "run",
        "db:backup",
        "--",
        "--source",
        sourceFilename,
        "--output-dir",
        backupDirectory,
      ],
      { BACKUP_PASSPHRASE: passphrase },
    );
    expect(
      "db:backup produces an encrypted backup",
      backup.status === 0,
      backup.status === 0 ? "" : backup.output.slice(-400),
    );
    if (backup.status !== 0) return;

    const manifestMatch = backup.output.match(/"filename":\s*"([^"]+)"/);
    if (!manifestMatch) throw new Error("db:backup did not report a filename.");
    const backupFilename = join(backupDirectory, manifestMatch[1]);
    const manifestFilename = `${backupFilename}.manifest.json`;
    const manifest = JSON.parse(readFileSync(manifestFilename, "utf8")) as {
      sha256: string;
      restoreVerifiedAt: string | null;
      byteSize: number;
    };
    expect(
      "backup is encrypted, not a readable SQLite file",
      !readFileSync(backupFilename)
        .subarray(0, 16)
        .toString("utf8")
        .startsWith("SQLite format"),
    );
    expect(
      "backup has not yet been proven restorable",
      manifest.restoreVerifiedAt === null,
      String(manifest.restoreVerifiedAt),
    );

    // 3. Clean environment: a directory that has never held a database.
    const cleanRoot = join(drillRoot, "clean-environment");
    mkdirSync(cleanRoot, { recursive: true, mode: 0o700 });
    const restoredFilename = join(cleanRoot, "learning-state.sqlite");
    expect(
      "restore target environment is clean",
      !existsSync(restoredFilename) &&
        !existsSync(`${restoredFilename}-wal`) &&
        !existsSync(`${restoredFilename}-shm`),
    );

    const restore = runNpm(
      [
        "run",
        "db:restore",
        "--",
        "--input",
        backupFilename,
        "--target",
        restoredFilename,
        "--yes",
      ],
      { BACKUP_PASSPHRASE: passphrase },
    );
    expect(
      "db:restore rebuilds the database in the clean environment",
      restore.status === 0,
      restore.status === 0 ? "" : restore.output.slice(-400),
    );
    if (restore.status !== 0) return;

    // 4. The restored database must be byte-for-byte usable, not merely present.
    const integrity = (() => {
      const handle = new Database(restoredFilename, { readonly: true });
      try {
        return String(handle.pragma("integrity_check", { simple: true }));
      } finally {
        handle.close();
      }
    })();
    expect(
      "restored database passes integrity_check",
      integrity === "ok",
      integrity,
    );

    const restoredTables = tableNames(restoredFilename);
    expect(
      "restored schema matches the source",
      JSON.stringify(restoredTables) === JSON.stringify(sourceTables),
      `${restoredTables.length} tables`,
    );

    const restoredCounts = countRows(restoredFilename);
    expect(
      "every private table restores with the same row count",
      JSON.stringify(restoredCounts) === JSON.stringify(sourceCounts),
      JSON.stringify(restoredCounts),
    );

    // The application's own opener runs migrations and WAL setup. If the
    // restored file were subtly wrong, this is where it would surface.
    const reopened = openLearningDatabase({ filename: restoredFilename });
    try {
      const repository = createLearningStateRepository(reopened);
      const users = reopened.handle.prepare("SELECT id FROM users").all() as {
        id: string;
      }[];
      const snapshots = users.map((user) =>
        repository.getStateSnapshot(user.id),
      );
      expect(
        "the application reopens the restored database and reads every user",
        snapshots.every((snapshot) => snapshot !== null),
        `${users.length} users`,
      );
    } finally {
      reopened.close();
    }

    const updatedManifest = JSON.parse(
      readFileSync(manifestFilename, "utf8"),
    ) as {
      restoreVerifiedAt: string | null;
    };
    expect(
      "the manifest records when the backup was proven restorable",
      typeof updatedManifest.restoreVerifiedAt === "string",
      String(updatedManifest.restoreVerifiedAt),
    );

    // 5. Negative controls. A restore path that cannot fail is not a control.
    const wrongPassphrase = runNpm(
      [
        "run",
        "db:restore",
        "--",
        "--input",
        backupFilename,
        "--target",
        join(cleanRoot, "wrong-passphrase.sqlite"),
        "--yes",
      ],
      { BACKUP_PASSPHRASE: "definitely-not-the-passphrase" },
    );
    expect(
      "a wrong passphrase cannot restore the backup",
      wrongPassphrase.status !== 0,
      `exit ${wrongPassphrase.status}`,
    );

    const tamperedFilename = join(drillRoot, "tampered.sqlite.enc");
    const ciphertext = readFileSync(backupFilename);
    // Flip a byte well past the header so the failure is the GCM tag, not a
    // format check — that is the property worth proving.
    ciphertext[ciphertext.length - 32] ^= 0xff;
    writeFileSync(tamperedFilename, ciphertext);
    const tampered = runNpm(
      [
        "run",
        "db:restore",
        "--",
        "--input",
        tamperedFilename,
        "--target",
        join(cleanRoot, "tampered.sqlite"),
        "--yes",
      ],
      { BACKUP_PASSPHRASE: passphrase },
    );
    expect(
      "a tampered backup is rejected by authenticated decryption",
      tampered.status !== 0,
      `exit ${tampered.status}`,
    );

    const overwrite = runNpm(
      [
        "run",
        "db:restore",
        "--",
        "--input",
        backupFilename,
        "--target",
        restoredFilename,
        "--yes",
      ],
      { BACKUP_PASSPHRASE: passphrase },
    );
    expect(
      "restoring over an existing database is refused",
      overwrite.status !== 0,
      `exit ${overwrite.status}`,
    );

    const unconfirmed = runNpm(
      [
        "run",
        "db:restore",
        "--",
        "--input",
        backupFilename,
        "--target",
        join(cleanRoot, "unconfirmed.sqlite"),
      ],
      { BACKUP_PASSPHRASE: passphrase },
    );
    expect(
      "restoring without --yes is refused",
      unconfirmed.status !== 0,
      `exit ${unconfirmed.status}`,
    );

    // 6. Evidence.
    mkdirSync(outputDirectory, { recursive: true });
    const generatedAt = new Date().toISOString();
    // OPS-006 asks a drill record to say *where*, *which version* and *how
    // long*, not just pass/fail: a drill is only evidence if a later reader can
    // tell which host and build it actually exercised.
    const report = {
      generatedAt,
      elapsedMs: Date.now() - startedAt,
      environment: {
        hostname: hostname(),
        platform: `${process.platform}/${process.arch}`,
        node: process.version,
        appVersion: process.env.APP_VERSION?.trim() || "development",
        gitRevision: gitRevision(),
      },
      source: sourceOption ? resolve(sourceOption) : "synthetic fixture",
      backupByteSize: manifest.byteSize,
      sourceCounts,
      restoredCounts,
      steps,
      passed: steps.filter((step) => step.outcome === "pass").length,
      failed: steps.filter((step) => step.outcome === "fail").length,
    };
    writeFileSync(
      join(outputDirectory, "restore-drill.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    writeFileSync(
      join(outputDirectory, "restore-drill.md"),
      [
        "# SQLite restore drill",
        "",
        `- Generated: ${generatedAt}`,
        `- Elapsed: ${(report.elapsedMs / 1000).toFixed(1)}s`,
        `- Host: ${report.environment.hostname} (${report.environment.platform}, node ${report.environment.node})`,
        `- Version: ${report.environment.appVersion}${report.environment.gitRevision ? ` @ ${report.environment.gitRevision}` : ""}`,
        `- Source: ${report.source}`,
        `- Steps: ${steps.length}, failed: ${report.failed}`,
        "",
        "| Result | Step | Detail |",
        "| --- | --- | --- |",
        ...steps.map(
          (step) =>
            `| ${step.outcome === "pass" ? "PASS" : "FAIL"} | ${step.name} | ${step.detail} |`,
        ),
        "",
        "## Row counts",
        "",
        "| Table | Source | Restored |",
        "| --- | --- | --- |",
        ...PRIVATE_TABLES.map(
          (table) =>
            `| ${table} | ${sourceCounts[table]} | ${restoredCounts[table]} |`,
        ),
        "",
      ].join("\n"),
    );
    console.log(
      `\n${report.passed}/${steps.length} drill steps passed -> ${outputDirectory}`,
    );
  } finally {
    if (process.argv.includes("--keep")) {
      console.log(`Drill directory kept: ${drillRoot}`);
    } else {
      rmSync(drillRoot, { recursive: true, force: true });
    }
  }
}

await main();
if (failed) process.exitCode = 1;
