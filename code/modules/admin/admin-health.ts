import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  getDefaultContentRoot,
  loadContentCatalogFromDirectory,
} from "../catalog/catalog-api";
import {
  auditContentDirectory,
  type ContentAuditReport,
} from "../catalog/content-audit";
import {
  checkMaterialRepositories,
  discoverMaterialRepositories,
  type MaterialRepositoryResult,
  type MaterialStatus,
} from "../freshness/materials-check";
import type { LearningDatabase } from "../learning-state/database";
import type { BackupManifest } from "../learning-state/backup";
import type { UserRecord } from "../learning-state/repository";
import {
  createPrivacyFirstMonitor,
  type OperationalMetricsSnapshot,
} from "../observability/privacy-monitor";
import type { DeploymentMode } from "../runtime/runtime-config";

export type AdminHealthSnapshot = {
  generatedAt: string;
  mode: DeploymentMode;
  catalog: {
    status: "ok" | "degraded" | "error";
    errorCount: number;
    warningCount: number;
  };
  materials: {
    status: "ok" | "degraded" | "not-mounted";
    repositoriesChecked: number;
    nonGitReferencesSkipped: number;
    counts: Record<MaterialStatus, number>;
  };
  database: {
    status: "ok" | "error";
    schemaVersion: number;
    sqliteVersion: string;
    journalMode: string;
  };
  backup:
    | {
        status: "not-configured";
      }
    | {
        status: "ok" | "degraded";
        retainedBackups: number;
        latestCreatedAt: string | null;
        latestRestoreVerifiedAt: string | null;
        latestByteSize: number | null;
        latestAgeHours: number | null;
        reasons: BackupHealthReason[];
      };
  observability: OperationalMetricsSnapshot;
  deployment: {
    version: string;
    nodeMajor: number;
  };
};

export type AdminHealthEnvironment = Readonly<
  Record<string, string | undefined>
>;

// R07: a backup whose schedule has silently stopped used to keep reporting
// "ok" forever, because health only checked manifest structure and checksums.
// Age thresholds now degrade the summary when the newest backup is too old or
// no restore verification happened within the window. Defaults assume nightly
// backups and a quarterly restore drill; deployments align them with their own
// RPO and drill policy through the environment variables below.
export type BackupHealthReason =
  | "no-valid-backup"
  | "integrity-mismatch"
  | "backup-stale"
  | "backup-future"
  | "restore-unverified"
  | "restore-stale"
  | "restore-future";

const DEFAULT_BACKUP_MAX_AGE_HOURS = 48;
const DEFAULT_BACKUP_MAX_RESTORE_VERIFICATION_AGE_DAYS = 90;

function readThreshold(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isAdminUser(
  user: UserRecord | null,
  environment: AdminHealthEnvironment = process.env,
): boolean {
  if (!user || user.mode !== "cloud" || !user.githubId) return false;
  const adminIds = new Set(
    (environment.ADMIN_GITHUB_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  return adminIds.has(user.githubId);
}

function emptyMaterialCounts(): Record<MaterialStatus, number> {
  return {
    latest: 0,
    behind: 0,
    ahead: 0,
    diverged: 0,
    dirty: 0,
    "check-failed": 0,
  };
}

function catalogHealth(
  report: ContentAuditReport,
): AdminHealthSnapshot["catalog"] {
  return {
    status:
      report.summary.errorCount > 0
        ? "error"
        : report.summary.warningCount > 0
          ? "degraded"
          : "ok",
    errorCount: report.summary.errorCount,
    warningCount: report.summary.warningCount,
  };
}

function materialHealth(
  results: readonly MaterialRepositoryResult[],
  nonGitReferencesSkipped: number,
): AdminHealthSnapshot["materials"] {
  const counts = emptyMaterialCounts();
  for (const result of results) counts[result.status] += 1;
  const hasProblem =
    counts.diverged + counts.dirty + counts["check-failed"] > 0;
  return {
    status: hasProblem ? "degraded" : "ok",
    repositoriesChecked: results.length,
    nonGitReferencesSkipped,
    counts,
  };
}

async function checkLocalMaterials(
  contentRoot: string,
  localMaterialRoot: string,
): Promise<AdminHealthSnapshot["materials"]> {
  if (!existsSync(localMaterialRoot)) {
    return {
      status: "not-mounted",
      repositoriesChecked: 0,
      nonGitReferencesSkipped: 0,
      counts: emptyMaterialCounts(),
    };
  }

  const catalog = await loadContentCatalogFromDirectory(contentRoot);
  const discovered = discoverMaterialRepositories(catalog, localMaterialRoot);
  const inputs = discovered
    .filter(({ repositoryPath }) => existsSync(join(repositoryPath, ".git")))
    .map(({ courseId, repositoryPath }) => ({ courseId, repositoryPath }));
  const results = await checkMaterialRepositories(inputs);
  return materialHealth(results, discovered.length - inputs.length);
}

function databaseHealth(
  database: LearningDatabase,
): AdminHealthSnapshot["database"] {
  try {
    const quickCheck = String(
      database.handle.pragma("quick_check", { simple: true }),
    );
    return {
      status: quickCheck === "ok" ? "ok" : "error",
      schemaVersion: database.schemaVersion,
      sqliteVersion: database.sqliteVersion,
      journalMode: database.journalMode,
    };
  } catch {
    return {
      status: "error",
      schemaVersion: database.schemaVersion,
      sqliteVersion: database.sqliteVersion,
      journalMode: database.journalMode,
    };
  }
}

async function backupHealth(
  environment: AdminHealthEnvironment,
  now: () => Date,
): Promise<AdminHealthSnapshot["backup"]> {
  const outputDirectory = environment.BACKUP_OUTPUT_DIR?.trim();
  if (!outputDirectory) return { status: "not-configured" };

  try {
    const entries = await readdir(outputDirectory, { withFileTypes: true });
    const manifestEntries = entries.filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith(".sqlite.enc.manifest.json"),
    );
    const inspected = await Promise.all(
      manifestEntries.map(async (entry) => {
        try {
          const manifest = JSON.parse(
            await readFile(join(outputDirectory, entry.name), "utf8"),
          ) as BackupManifest;
          if (
            manifest.formatVersion !== 1 ||
            !manifest.createdAt ||
            basename(manifest.filename) !== manifest.filename ||
            !manifest.filename.endsWith(".sqlite.enc") ||
            !Number.isFinite(manifest.byteSize) ||
            !/^[a-f0-9]{64}$/.test(manifest.sha256)
          ) {
            return { manifest: null, valid: false };
          }
          const encrypted = await readFile(
            join(outputDirectory, manifest.filename),
          );
          const checksum = createHash("sha256").update(encrypted).digest("hex");
          return {
            manifest,
            valid:
              encrypted.byteLength === manifest.byteSize &&
              checksum === manifest.sha256,
          };
        } catch {
          return { manifest: null, valid: false };
        }
      }),
    );
    const manifests = inspected
      .map(({ manifest }) => manifest)
      .filter((manifest): manifest is BackupManifest => manifest !== null);
    manifests.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
    const latest = manifests[0];
    if (!latest) {
      return {
        status: "degraded",
        retainedBackups: manifestEntries.length,
        latestCreatedAt: null,
        latestRestoreVerifiedAt: null,
        latestByteSize: null,
        latestAgeHours: null,
        reasons: ["no-valid-backup"],
      };
    }

    const current = now();
    const maxAgeHours = readThreshold(
      environment.BACKUP_MAX_AGE_HOURS,
      DEFAULT_BACKUP_MAX_AGE_HOURS,
    );
    const maxRestoreVerificationAgeDays = readThreshold(
      environment.BACKUP_MAX_RESTORE_VERIFICATION_AGE_DAYS,
      DEFAULT_BACKUP_MAX_RESTORE_VERIFICATION_AGE_DAYS,
    );

    const reasons: BackupHealthReason[] = [];
    if (inspected.some(({ valid }) => !valid)) {
      reasons.push("integrity-mismatch");
    }
    const latestAgeHours =
      Math.round(
        ((current.getTime() - Date.parse(latest.createdAt)) / 3_600_000) * 10,
      ) / 10;
    if (latestAgeHours < 0) {
      reasons.push("backup-future");
    } else if (latestAgeHours > maxAgeHours) {
      reasons.push("backup-stale");
    }

    const restoreVerifiedAt = manifests
      .map((manifest) => manifest.restoreVerifiedAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0];
    const restoreVerificationAgeDays =
      restoreVerifiedAt === undefined
        ? null
        : (current.getTime() - Date.parse(restoreVerifiedAt)) / 86_400_000;
    if (restoreVerifiedAt === undefined) {
      reasons.push("restore-unverified");
    } else if (
      restoreVerificationAgeDays !== null &&
      restoreVerificationAgeDays < 0
    ) {
      reasons.push("restore-future");
    } else if (
      restoreVerificationAgeDays !== null &&
      restoreVerificationAgeDays > maxRestoreVerificationAgeDays
    ) {
      reasons.push("restore-stale");
    }

    return {
      status: reasons.length > 0 ? "degraded" : "ok",
      retainedBackups: manifestEntries.length,
      latestCreatedAt: latest.createdAt,
      latestRestoreVerifiedAt: latest.restoreVerifiedAt,
      latestByteSize: latest.byteSize,
      latestAgeHours,
      reasons,
    };
  } catch {
    return {
      status: "degraded",
      retainedBackups: 0,
      latestCreatedAt: null,
      latestRestoreVerifiedAt: null,
      latestByteSize: null,
      latestAgeHours: null,
      reasons: ["no-valid-backup"],
    };
  }
}

export async function buildRuntimeAdminHealthSnapshot(options: {
  mode: DeploymentMode;
  database: LearningDatabase;
  environment?: AdminHealthEnvironment;
  contentRoot?: string;
  localMaterialRoot?: string;
  operationalMetrics?: OperationalMetricsSnapshot;
  now?: () => Date;
}): Promise<AdminHealthSnapshot> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? (() => new Date());
  const contentRoot = options.contentRoot ?? getDefaultContentRoot(environment);
  const auditReport = await auditContentDirectory({
    contentRoot,
    mode: options.mode,
    localMaterialRoot:
      options.mode === "local" ? options.localMaterialRoot : undefined,
  });
  const materials =
    options.mode === "local" && options.localMaterialRoot
      ? await checkLocalMaterials(contentRoot, options.localMaterialRoot)
      : {
          status: "not-mounted" as const,
          repositoriesChecked: 0,
          nonGitReferencesSkipped: 0,
          counts: emptyMaterialCounts(),
        };

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const backup = await backupHealth(environment, now);
  return {
    generatedAt: new Date(now()).toISOString(),
    mode: options.mode,
    catalog: catalogHealth(auditReport),
    materials,
    database: databaseHealth(options.database),
    backup,
    observability:
      options.operationalMetrics ??
      createPrivacyFirstMonitor(options.database).snapshot(),
    deployment: {
      version: environment.APP_VERSION?.trim() || "development",
      nodeMajor: Number.isFinite(nodeMajor) ? nodeMajor : 0,
    },
  };
}

export type AdminHealthRequestDependencies = {
  user: UserRecord | null;
  environment?: AdminHealthEnvironment;
  buildSnapshot: () => Promise<AdminHealthSnapshot>;
};

export async function handleAdminHealthRequest(
  request: Request,
  dependencies: AdminHealthRequestDependencies,
): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json(
      { error: "管理员健康页面只支持 GET。" },
      { status: 405 },
    );
  }
  if (!dependencies.user) {
    return Response.json({ error: "需要管理员登录。" }, { status: 401 });
  }
  if (!isAdminUser(dependencies.user, dependencies.environment)) {
    return Response.json({ error: "没有管理员权限。" }, { status: 403 });
  }

  try {
    return Response.json(await dependencies.buildSnapshot());
  } catch {
    return Response.json(
      { error: "管理员健康摘要暂时不可用。" },
      { status: 500 },
    );
  }
}
