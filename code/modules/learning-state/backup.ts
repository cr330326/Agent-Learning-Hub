import Database from "better-sqlite3";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

const BACKUP_MAGIC = Buffer.from("AGENT-LEARNING-HUB SQLITE BACKUP\n", "utf8");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const MIN_PASSPHRASE_LENGTH = 12;

export type BackupManifest = {
  formatVersion: 1;
  createdAt: string;
  filename: string;
  byteSize: number;
  sha256: string;
  restoreVerifiedAt: string | null;
};

export type EncryptedBackupResult = {
  backupPath: string;
  manifestPath: string;
  manifest: BackupManifest;
};

function assertPassphrase(passphrase: string) {
  if (passphrase.trim().length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(
      `Backup passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`,
    );
  }
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  assertPassphrase(passphrase);
  return scryptSync(passphrase, salt, KEY_BYTES);
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function timestampForFilename(value: Date): string {
  return value.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

function encrypt(plaintext: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, salt, iv, tag, ciphertext]);
}

function decrypt(envelope: Buffer, passphrase: string): Buffer {
  const headerEnd = BACKUP_MAGIC.length;
  if (
    envelope.length < headerEnd + SALT_BYTES + IV_BYTES + TAG_BYTES ||
    !envelope.subarray(0, headerEnd).equals(BACKUP_MAGIC)
  ) {
    throw new Error("Invalid encrypted SQLite backup format.");
  }

  const saltStart = headerEnd;
  const ivStart = saltStart + SALT_BYTES;
  const tagStart = ivStart + IV_BYTES;
  const ciphertextStart = tagStart + TAG_BYTES;
  const salt = envelope.subarray(saltStart, ivStart);
  const iv = envelope.subarray(ivStart, tagStart);
  const tag = envelope.subarray(tagStart, ciphertextStart);
  const ciphertext = envelope.subarray(ciphertextStart);

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(passphrase, salt),
      iv,
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error("Unable to decrypt SQLite backup.");
  }
}

async function writeAtomically(filename: string, content: Buffer | string) {
  const temporaryFilename = `${filename}.tmp-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(temporaryFilename, content, { mode: 0o600 });
    await rename(temporaryFilename, filename);
  } finally {
    await rm(temporaryFilename, { force: true });
  }
}

export async function createEncryptedBackup(options: {
  sourceFilename: string;
  outputDirectory: string;
  passphrase: string;
  now?: () => Date;
}): Promise<EncryptedBackupResult> {
  assertPassphrase(options.passphrase);
  const now = options.now ?? (() => new Date());
  const createdAt = now().toISOString();
  await mkdir(options.outputDirectory, { recursive: true, mode: 0o700 });
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "agent-learning-state-backup-"),
  );
  const temporaryDatabase = join(temporaryDirectory, "state.sqlite");
  let source: Database.Database | null = null;

  try {
    source = new Database(options.sourceFilename, {
      readonly: true,
      fileMustExist: true,
    });
    await source.backup(temporaryDatabase);
    source.close();
    source = null;

    const plaintext = await readFile(temporaryDatabase);
    const encrypted = encrypt(plaintext, options.passphrase);
    const filename = `learning-state-${timestampForFilename(new Date(createdAt))}-${randomBytes(6).toString("hex")}.sqlite.enc`;
    const backupPath = join(options.outputDirectory, filename);
    const manifestPath = `${backupPath}.manifest.json`;
    const manifest: BackupManifest = {
      formatVersion: 1,
      createdAt,
      filename,
      byteSize: encrypted.byteLength,
      sha256: sha256(encrypted),
      restoreVerifiedAt: null,
    };

    await writeAtomically(backupPath, encrypted);
    await writeAtomically(manifestPath, JSON.stringify(manifest, null, 2));
    return { backupPath, manifestPath, manifest };
  } finally {
    source?.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function weekKey(createdAt: string): string {
  const date = new Date(createdAt);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export async function pruneEncryptedBackups(options: {
  outputDirectory: string;
  now?: Date;
}): Promise<{ removed: number; retained: number }> {
  const entries = await readdir(options.outputDirectory, {
    withFileTypes: true,
  });
  const manifests: Array<{ path: string; manifest: BackupManifest }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".manifest.json")) continue;
    try {
      const path = join(options.outputDirectory, entry.name);
      const manifest = JSON.parse(
        await readFile(path, "utf8"),
      ) as BackupManifest;
      if (
        manifest.formatVersion === 1 &&
        basename(manifest.filename) === manifest.filename &&
        manifest.filename.endsWith(".sqlite.enc")
      ) {
        manifests.push({ path, manifest });
      }
    } catch {
      // Invalid manifests are left in place for manual inspection.
    }
  }

  manifests.sort((left, right) =>
    right.manifest.createdAt.localeCompare(left.manifest.createdAt),
  );
  const dailyKeys = new Set<string>();
  const dailyBackups = new Set<string>();
  for (const entry of manifests) {
    const day = entry.manifest.createdAt.slice(0, 10);
    if (dailyKeys.size < 7 && !dailyKeys.has(day)) {
      dailyKeys.add(day);
      dailyBackups.add(entry.path);
    }
  }

  const weeklyKeys = new Set<string>();
  const retained = new Set(dailyBackups);
  for (const entry of manifests) {
    const week = weekKey(entry.manifest.createdAt);
    if (weeklyKeys.has(week)) continue;
    if (weeklyKeys.size >= 3) break;
    weeklyKeys.add(week);
    retained.add(entry.path);
  }

  let removed = 0;
  for (const entry of manifests) {
    if (retained.has(entry.path)) continue;
    await rm(entry.path, { force: true });
    await rm(join(options.outputDirectory, entry.manifest.filename), {
      force: true,
    });
    removed += 1;
  }
  return { removed, retained: retained.size };
}

export async function restoreEncryptedBackup(options: {
  backupFilename: string;
  targetFilename: string;
  passphrase: string;
  now?: () => Date;
}): Promise<{ targetFilename: string; verified: true; sha256: string }> {
  const encrypted = await readFile(options.backupFilename);
  const plaintext = decrypt(encrypted, options.passphrase);
  await mkdir(dirname(options.targetFilename), {
    recursive: true,
    mode: 0o700,
  });
  try {
    await stat(options.targetFilename);
    throw new Error("Target database already exists; choose a new path.");
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error;
    }
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )) {
      throw error;
    }
  }

  const temporaryFilename = join(
    dirname(options.targetFilename),
    `.${basename(options.targetFilename)}.restore-${randomBytes(6).toString("hex")}`,
  );
  let restored: Database.Database | null = null;
  try {
    await writeFile(temporaryFilename, plaintext, { mode: 0o600 });
    restored = new Database(temporaryFilename, {
      readonly: true,
      fileMustExist: true,
    });
    const quickCheck = String(restored.pragma("quick_check", { simple: true }));
    if (quickCheck !== "ok") {
      throw new Error("Restored SQLite backup failed integrity check.");
    }
    restored.close();
    restored = null;
    await rename(temporaryFilename, options.targetFilename);
    try {
      const manifestPath = `${options.backupFilename}.manifest.json`;
      const manifest = JSON.parse(
        await readFile(manifestPath, "utf8"),
      ) as BackupManifest;
      if (manifest.formatVersion === 1) {
        manifest.restoreVerifiedAt = (
          options.now ?? (() => new Date())
        )().toISOString();
        await writeAtomically(manifestPath, JSON.stringify(manifest, null, 2));
      }
    } catch {
      // A restored database remains valid even if its optional manifest cannot be updated.
    }
    return {
      targetFilename: options.targetFilename,
      verified: true,
      sha256: sha256(encrypted),
    };
  } finally {
    restored?.close();
    await rm(temporaryFilename, { force: true });
  }
}
