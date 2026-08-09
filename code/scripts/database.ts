import { resolve } from "node:path";

import {
  createEncryptedBackup,
  pruneEncryptedBackups,
  restoreEncryptedBackup,
} from "../modules/learning-state/backup";
import { getDefaultStateDatabaseFilename } from "../modules/learning-state/state-store";

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredOption(name: string): string {
  const value = optionValue(name)?.trim();
  if (!value) throw new Error(`Missing required option ${name}.`);
  return value;
}

function passphrase(): string {
  const value =
    optionValue("--passphrase") ?? process.env.BACKUP_PASSPHRASE ?? "";
  if (!value.trim()) {
    throw new Error(
      "Set BACKUP_PASSPHRASE or pass --passphrase through a protected operator channel.",
    );
  }
  return value;
}

async function runBackup() {
  const sourceFilename = resolve(
    optionValue("--source") ?? getDefaultStateDatabaseFilename(),
  );
  const outputDirectory = resolve(
    optionValue("--output-dir") ??
      process.env.BACKUP_OUTPUT_DIR ??
      resolve(process.cwd(), "..", "backups"),
  );
  const result = await createEncryptedBackup({
    sourceFilename,
    outputDirectory,
    passphrase: passphrase(),
  });
  const retention = await pruneEncryptedBackups({ outputDirectory });
  console.log(
    JSON.stringify(
      {
        operation: "backup",
        manifest: result.manifest,
        retention,
        outputDirectory,
      },
      null,
      2,
    ),
  );
}

async function runRestore() {
  if (!process.argv.includes("--yes")) {
    throw new Error("Restoring requires --yes as an explicit confirmation.");
  }
  const result = await restoreEncryptedBackup({
    backupFilename: resolve(requiredOption("--input")),
    targetFilename: resolve(requiredOption("--target")),
    passphrase: passphrase(),
  });
  console.log(JSON.stringify({ operation: "restore", ...result }, null, 2));
}

const command = process.argv[2];
if (command === "backup") {
  await runBackup();
} else if (command === "restore") {
  await runRestore();
} else {
  throw new Error("Usage: database.ts <backup|restore> [options].");
}
