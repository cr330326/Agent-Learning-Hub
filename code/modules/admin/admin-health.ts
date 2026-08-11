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
      };
    }
    return {
      status: inspected.every(({ valid }) => valid) ? "ok" : "degraded",
      retainedBackups: manifestEntries.length,
      latestCreatedAt: latest.createdAt,
      latestRestoreVerifiedAt: latest.restoreVerifiedAt,
      latestByteSize: latest.byteSize,
    };
  } catch {
    return {
      status: "degraded",
      retainedBackups: 0,
      latestCreatedAt: null,
      latestRestoreVerifiedAt: null,
      latestByteSize: null,
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
}): Promise<AdminHealthSnapshot> {
  const environment = options.environment ?? process.env;
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
  const backup = await backupHealth(environment);
  return {
    generatedAt: new Date().toISOString(),
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
