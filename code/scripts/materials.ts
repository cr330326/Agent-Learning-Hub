import { existsSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import process from "node:process";

import { loadContentCatalogFromDirectory } from "../modules/catalog/catalog-api";
import {
  auditContentDirectory,
  renderContentAuditMarkdown,
} from "../modules/catalog/content-audit";
import {
  checkMaterialRepositories,
  discoverMaterialRepositories,
  updateMaterialRepository,
  type DiscoveredMaterialRepository,
  type MaterialRepositoryResult,
  type MaterialStatus,
} from "../modules/freshness/materials-check";
import { buildRuntimeSearchIndex } from "../modules/search/search-index";

const statuses: readonly MaterialStatus[] = [
  "latest",
  "behind",
  "ahead",
  "diverged",
  "dirty",
  "check-failed",
];

type MaterialsOptions = {
  root: string;
  contentDirectory?: string;
  localMaterialRoot?: string;
  outputDirectory?: string;
};

type MaterialsArguments = MaterialsOptions & {
  command: "check" | "update" | "audit" | "reindex";
  help: boolean;
  courseId?: string;
  confirmed: boolean;
};

type MaterialCheckReport = {
  schemaVersion: 1;
  generatedAt: string;
  localMaterialRoot: string;
  summary: Record<MaterialStatus, number> & { skipped: number; total: number };
  repositories: Array<
    Omit<MaterialRepositoryResult, "repositoryPath"> & {
      repositoryPath: string;
      courseIds: string[];
      materialPaths: string[];
    }
  >;
  skipped: Array<{
    courseIds: string[];
    materialPaths: string[];
    reason: string;
  }>;
};

function usage(): string {
  return [
    "Usage: tsx scripts/materials.ts <check|update|audit|reindex> [course-id] [options]",
    "",
    "Checks Git freshness for each repository referenced by the content catalog.",
    "The check command never pulls, fetches, or changes a material workspace.",
    "The update command requires one catalog course ID and --yes.",
    "",
    "Options:",
    "  --root <path>                  Repository root (default: parent of code/)",
    "  --content-dir <path>           Content directory (default: <root>/content)",
    "  --local-material-root <path>   Local Material directory (default: <root>/local-courses)",
    "  --output-dir <path>            Report directory (default: <root>/reports/materials)",
    "  --yes                          Confirm one explicit fast-forward update",
    "  -h, --help                     Show this help message",
  ].join("\n");
}

function defaultProjectRoot(): string {
  return resolve(
    process.env.PROJECT_ROOT ??
      (process.cwd().endsWith("/code")
        ? resolve(process.cwd(), "..")
        : process.cwd()),
  );
}

function parseArguments(args: string[]): MaterialsArguments {
  const command = args[0];
  if (command === "-h" || command === "--help" || !command) {
    return {
      command: "check",
      help: true,
      root: defaultProjectRoot(),
      confirmed: false,
    };
  }
  if (
    command !== "check" &&
    command !== "update" &&
    command !== "audit" &&
    command !== "reindex"
  ) {
    throw new Error(`Unknown materials command: ${command}`);
  }

  const options: MaterialsOptions = {
    root: defaultProjectRoot(),
  };
  const courseId = command === "update" ? args[1] : undefined;
  if (command === "update" && (!courseId || courseId.startsWith("--"))) {
    throw new Error("materials update requires one course ID.");
  }
  let confirmed = false;
  const firstOptionIndex = command === "update" ? 2 : 1;
  for (let index = firstOptionIndex; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      return { ...options, command, help: true, confirmed: false, courseId };
    }
    if (argument === "--yes") {
      if (command !== "update") {
        throw new Error("--yes is only valid for materials update.");
      }
      confirmed = true;
      continue;
    }
    if (
      argument !== "--root" &&
      argument !== "--content-dir" &&
      argument !== "--local-material-root" &&
      argument !== "--output-dir"
    ) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    if (argument === "--root") options.root = value;
    if (argument === "--content-dir") options.contentDirectory = value;
    if (argument === "--local-material-root") options.localMaterialRoot = value;
    if (argument === "--output-dir") options.outputDirectory = value;
  }

  const root = resolve(options.root);
  return {
    ...options,
    help: false,
    root,
    contentDirectory: resolve(
      options.contentDirectory ?? join(root, "content"),
    ),
    localMaterialRoot: resolve(
      options.localMaterialRoot ?? join(root, "local-courses"),
    ),
    outputDirectory: resolve(
      options.outputDirectory ?? join(root, "reports", "materials"),
    ),
    command,
    courseId,
    confirmed,
  };
}

function emptySummary(): MaterialCheckReport["summary"] {
  return {
    total: 0,
    skipped: 0,
    latest: 0,
    behind: 0,
    ahead: 0,
    diverged: 0,
    dirty: 0,
    "check-failed": 0,
  };
}

function relativeMaterialPath(localRoot: string, path: string): string {
  return relative(localRoot, path) || ".";
}

function renderMarkdown(report: MaterialCheckReport): string {
  const lines = [
    "# Material freshness check",
    "",
    `Generated at: ${report.generatedAt}`,
    `Local Material root: ${report.localMaterialRoot}`,
    "",
    "## Summary",
    "",
    "| Status | Count |",
    "| --- | ---: |",
    ...statuses.map((status) => `| ${status} | ${report.summary[status]} |`),
    `| skipped (not a Git repository) | ${report.summary.skipped} |`,
    "",
    "## Repositories",
    "",
    "| Repository | Catalog references | Status | Ahead | Behind | Error |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...report.repositories.map(
      (repository) =>
        `| ${repository.repositoryPath} | ${repository.courseIds.join(", ")} | ${repository.status} | ${repository.ahead} | ${repository.behind} | ${repository.error ?? ""} |`,
    ),
  ];

  if (report.skipped.length > 0) {
    lines.push(
      "",
      "## Skipped material references",
      "",
      "These catalog references do not belong to a Git repository and were not passed to Git.",
      "",
      ...report.skipped.map(
        (entry) =>
          `- ${entry.courseIds.join(", ")}: ${entry.materialPaths.join(", ")} — ${entry.reason}`,
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

function buildReport(
  localRoot: string,
  discovered: readonly DiscoveredMaterialRepository[],
  checked: readonly MaterialRepositoryResult[],
): MaterialCheckReport {
  const checkedByPath = new Map(
    checked.map((result) => [result.repositoryPath, result]),
  );
  const summary = emptySummary();
  const repositories: MaterialCheckReport["repositories"] = [];
  const skipped: MaterialCheckReport["skipped"] = [];

  for (const group of discovered) {
    if (!existsSync(join(group.repositoryPath, ".git"))) {
      summary.skipped += 1;
      skipped.push({
        courseIds: group.courseIds,
        materialPaths: group.materialPaths,
        reason:
          "No Git repository marker was found for this material reference.",
      });
      continue;
    }
    const result = checkedByPath.get(group.repositoryPath);
    if (!result) {
      throw new Error(`Missing freshness result for ${group.repositoryPath}.`);
    }
    summary[result.status] += 1;
    repositories.push({
      ...result,
      repositoryPath: relativeMaterialPath(localRoot, result.repositoryPath),
      courseIds: group.courseIds,
      materialPaths: group.materialPaths,
    });
  }

  summary.total = repositories.length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    localMaterialRoot: relativeMaterialPath(
      resolve(localRoot, ".."),
      localRoot,
    ),
    summary,
    repositories,
    skipped,
  };
}

async function runCheck(options: MaterialsArguments): Promise<void> {
  const contentDirectory = resolve(
    options.contentDirectory ?? join(options.root, "content"),
  );
  const localMaterialRoot = resolve(options.localMaterialRoot ?? "");
  const catalog = await loadContentCatalogFromDirectory(contentDirectory);
  const discovered = discoverMaterialRepositories(catalog, localMaterialRoot);
  const checkable = discovered.filter((group) =>
    existsSync(join(group.repositoryPath, ".git")),
  );
  const checked = await checkMaterialRepositories(
    checkable.map(({ courseId, repositoryPath }) => ({
      courseId,
      repositoryPath,
    })),
  );
  const report = buildReport(localMaterialRoot, discovered, checked);
  const outputDirectory = resolve(
    options.outputDirectory ?? join(options.root, "reports", "materials"),
  );
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = join(outputDirectory, "materials-check.json");
  const markdownPath = join(outputDirectory, "materials-check.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(markdownPath, renderMarkdown(report)),
  ]);

  const statusSummary = statuses
    .filter((status) => report.summary[status] > 0)
    .map((status) => `${status}=${report.summary[status]}`)
    .join(", ");
  process.stdout.write(
    `Materials check completed: ${report.summary.total} repositories${report.summary.skipped > 0 ? `, ${report.summary.skipped} non-Git references skipped` : ""}. ${statusSummary || "no repositories"}.\nJSON: ${jsonPath}\nMarkdown: ${markdownPath}\n`,
  );
  if (report.summary["check-failed"] > 0) process.exitCode = 1;
}

async function runUpdate(options: MaterialsArguments): Promise<void> {
  if (!options.courseId)
    throw new Error("materials update requires a course ID.");
  if (!options.confirmed) {
    throw new Error("Refusing to update without explicit --yes confirmation.");
  }
  const contentDirectory = resolve(
    options.contentDirectory ?? join(options.root, "content"),
  );
  const localMaterialRoot = resolve(options.localMaterialRoot ?? "");
  const catalog = await loadContentCatalogFromDirectory(contentDirectory);
  const item = catalog.items.find(({ id }) => id === options.courseId);
  if (!item) throw new Error(`Unknown catalog course ID: ${options.courseId}`);
  if (!item.localPath) {
    throw new Error(`Course ${options.courseId} has no Local Material path.`);
  }
  const group = discoverMaterialRepositories(catalog, localMaterialRoot).find(
    (candidate) => candidate.courseIds.includes(options.courseId as string),
  );
  if (!group || !existsSync(join(group.repositoryPath, ".git"))) {
    throw new Error(
      `Course ${options.courseId} is not backed by a Git material repository.`,
    );
  }

  const result = await updateMaterialRepository({
    courseId: options.courseId,
    repositoryPath: group.repositoryPath,
  });
  const repositoryPath = relativeMaterialPath(
    localMaterialRoot,
    result.repositoryPath,
  );
  process.stdout.write(
    `Materials update ${result.updated ? "completed" : "not applied"}: ${options.courseId} -> ${repositoryPath} (${result.status}).\n`,
  );
  if (result.error) process.stdout.write(`Reason: ${result.error}\n`);
  if (!result.updated && result.status !== "latest") process.exitCode = 1;
  if (result.updated) {
    const auditPassed = await runAudit(options);
    if (!auditPassed) {
      process.exitCode = 1;
      return;
    }
    await runReindex(options, false);
  }
}

async function runAudit(options: MaterialsArguments): Promise<boolean> {
  const contentDirectory = resolve(
    options.contentDirectory ?? join(options.root, "content"),
  );
  const localMaterialRoot = resolve(options.localMaterialRoot ?? "");
  const report = await auditContentDirectory({
    contentRoot: contentDirectory,
    localMaterialRoot,
    mode: "local",
  });
  const outputDirectory = resolve(
    options.outputDirectory ?? join(options.root, "reports", "materials"),
  );
  const auditDirectory = join(outputDirectory, "audit");
  await mkdir(auditDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(auditDirectory, "content-audit-local.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    ),
    writeFile(
      join(auditDirectory, "content-audit-local.md"),
      `${renderContentAuditMarkdown(report)}\n`,
    ),
  ]);
  process.stdout.write(
    `Materials audit ${report.summary.errorCount === 0 ? "passed" : "failed"}: ${report.summary.errorCount} errors, ${report.summary.warningCount} warnings.\n`,
  );
  return report.summary.errorCount === 0;
}

async function runReindex(
  options: MaterialsArguments,
  runAuditFirst = true,
): Promise<void> {
  if (runAuditFirst && !(await runAudit(options))) {
    process.exitCode = 1;
    return;
  }
  const contentDirectory = resolve(
    options.contentDirectory ?? join(options.root, "content"),
  );
  const localMaterialRoot = resolve(options.localMaterialRoot ?? "");
  const catalog = await loadContentCatalogFromDirectory(contentDirectory);
  const index = await buildRuntimeSearchIndex(catalog, {
    mode: "local",
    contentRoot: contentDirectory,
    localRoot: localMaterialRoot,
  });
  const outputDirectory = resolve(
    options.outputDirectory ?? join(options.root, "reports", "materials"),
  );
  await mkdir(outputDirectory, { recursive: true });
  const documentKinds = Object.fromEntries(
    [...new Set(index.map((document) => document.kind))].map((kind) => [
      kind,
      index.filter((document) => document.kind === kind).length,
    ]),
  );
  const indexPath = join(outputDirectory, "search-index.json");
  const temporaryIndexPath = `${indexPath}.tmp-${process.pid}`;
  const indexSnapshot = `${JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      documentCount: index.length,
      documentKinds,
      documents: index.map(({ text, ...document }) => ({
        ...document,
        textLength: text.length,
      })),
    },
    null,
    2,
  )}\n`;
  try {
    await writeFile(temporaryIndexPath, indexSnapshot);
    await rename(temporaryIndexPath, indexPath);
  } finally {
    await rm(temporaryIndexPath, { force: true });
  }
  process.stdout.write(
    `Materials reindex completed: ${index.length} documents (${Object.entries(
      documentKinds,
    )
      .map(([kind, count]) => `${kind}=${count}`)
      .join(", ")}).\n`,
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.command === "check") await runCheck(options);
  if (options.command === "update") await runUpdate(options);
  if (options.command === "audit") {
    if (!(await runAudit(options))) process.exitCode = 1;
  }
  if (options.command === "reindex") await runReindex(options);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
