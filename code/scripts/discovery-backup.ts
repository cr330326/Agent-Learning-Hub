import { resolve } from "node:path";
import {
  createDiscoveryBackup,
  restoreDiscoveryBackup,
  pruneDiscoveryBackups,
} from "../modules/discovery/backup";
import { runDiscoveryRestoreDrill } from "../modules/discovery/restore-drill";
function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function required(name: string) {
  const value = option(name);
  if (!value) throw new Error(`缺少 ${name}`);
  return value;
}
const passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase) throw new Error("需要配置 BACKUP_PASSPHRASE。");
if (process.argv[2] === "backup") {
  const result = await createDiscoveryBackup({
    stateFilename: resolve(
      process.env.STATE_DATABASE_PATH ?? required("--state"),
    ),
    discoveryFilename: resolve(
      process.env.DISCOVERY_DATABASE_PATH ?? required("--discovery"),
    ),
    outputDirectory: resolve(required("--output-dir")),
    passphrase,
    appVersion: process.env.APP_VERSION ?? "development",
  });
  const retention = await pruneDiscoveryBackups(
    resolve(required("--output-dir")),
  );
  console.log(JSON.stringify({ ...result, retention }, null, 2));
} else if (process.argv[2] === "restore") {
  if (!process.argv.includes("--yes")) throw new Error("恢复需要 --yes。");
  console.log(
    JSON.stringify(
      await restoreDiscoveryBackup({
        batchFilename: resolve(required("--batch")),
        targetDirectory: resolve(required("--target-dir")),
        passphrase,
      }),
      null,
      2,
    ),
  );
} else if (process.argv[2] === "drill") {
  const result = await runDiscoveryRestoreDrill({
    stateFilename: resolve(
      process.env.STATE_DATABASE_PATH ?? required("--state"),
    ),
    discoveryFilename: resolve(
      process.env.DISCOVERY_DATABASE_PATH ?? required("--discovery"),
    ),
    outputDirectory: resolve(required("--output-dir")),
    passphrase,
    appVersion: process.env.APP_VERSION ?? "development",
    hostIdentity: process.env.RESTORE_DRILL_HOST,
    backupDirectory: option("--backup-dir")
      ? resolve(option("--backup-dir")!)
      : undefined,
  });
  const retention = option("--backup-dir")
    ? await pruneDiscoveryBackups(resolve(option("--backup-dir")!))
    : undefined;
  console.log(JSON.stringify({ ...result, retention }));
} else throw new Error("用法 discovery-backup.ts backup|restore|drill");
