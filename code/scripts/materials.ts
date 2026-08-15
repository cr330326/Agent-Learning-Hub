import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import process from "node:process";

import { loadContentCatalogFromDirectory } from "../modules/catalog/catalog-api";
import {
  auditContentDirectory,
  renderContentAuditMarkdown,
} from "../modules/catalog/content-audit";
import {
  applyMovedPaths,
  buildCatalogDriftReport,
  toWebBaseUrl,
  type CatalogDriftReport,
} from "../modules/freshness/catalog-drift";
import {
  checkMaterialRepositories,
  discoverMaterialRepositories,
  updateMaterialRepository,
  type DiscoveredMaterialRepository,
  type MaterialRepositoryResult,
  type MaterialStatus,
} from "../modules/freshness/materials-check";
import { buildRuntimeSearchIndex } from "../modules/search/search-index";
import { recordOperatorMetric } from "../modules/observability/operator-monitor";

const statuses: readonly MaterialStatus[] = [
  "latest",
  "behind",
  "ahead",
  "diverged",
  "dirty",
  "check-failed",
];

function recordMaterialsUpdate(outcome: "success" | "failure") {
  recordOperatorMetric(
    { event: "materials_update", scope: "materials-update", outcome },
    {
      databaseFilename:
        process.env.OPERATIONAL_METRICS_DATABASE_PATH?.trim() ||
        process.env.STATE_DATABASE_PATH?.trim(),
    },
  );
}

type MaterialsOptions = {
  root: string;
  contentDirectory?: string;
  localMaterialRoot?: string;
  outputDirectory?: string;
};

type MaterialsArguments = MaterialsOptions & {
  command: "check" | "update" | "audit" | "reindex" | "drift";
  help: boolean;
  courseId?: string;
  confirmed: boolean;
  apply: boolean;
};

type MaterialCheckReport = {
  schemaVersion: 1;
  generatedAt: string;
  localMaterialRoot: string;
  summary: Record<MaterialStatus, number> & {
    skipped: number;
    /** References whose material path is gone — Catalog Drift, not a Git state. */
    missing: number;
    total: number;
  };
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
    "Usage: tsx scripts/materials.ts <check|drift|update|audit|reindex> [course-id] [options]",
    "",
    "The check command reports Freshness Status: Local Material against its",
    "Upstream Source. It never pulls, fetches, or changes a material workspace.",
    "The drift command reports Catalog Drift: what the catalog declares against",
    "what the library actually holds. It writes nothing unless given --apply,",
    "and even then only rewrites paths it could corroborate as moved.",
    "The update command requires one catalog course ID and --yes.",
    "",
    "Options:",
    "  --root <path>                  Application root (default: code/)",
    "  --content-dir <path>           Content directory (default: <root>/content)",
    "  --local-material-root <path>   Local Material directory (default: ../local-courses)",
    "  --output-dir <path>            Report directory (default: <root>/reports/materials)",
    "  --apply                        Write corroborated moves back to the catalog",
    "  --yes                          Confirm one explicit fast-forward update",
    "  -h, --help                     Show this help message",
  ].join("\n");
}

function defaultApplicationRoot(): string {
  return resolve(
    process.env.PROJECT_ROOT ?? resolve(import.meta.dirname, ".."),
  );
}

function parseArguments(args: string[]): MaterialsArguments {
  const command = args[0];
  if (command === "-h" || command === "--help" || !command) {
    return {
      command: "check",
      help: true,
      root: defaultApplicationRoot(),
      confirmed: false,
      apply: false,
    };
  }
  if (
    command !== "check" &&
    command !== "update" &&
    command !== "audit" &&
    command !== "reindex" &&
    command !== "drift"
  ) {
    throw new Error(`Unknown materials command: ${command}`);
  }

  const options: MaterialsOptions = {
    root: defaultApplicationRoot(),
  };
  const courseId = command === "update" ? args[1] : undefined;
  if (command === "update" && (!courseId || courseId.startsWith("--"))) {
    throw new Error("materials update requires one course ID.");
  }
  let confirmed = false;
  let apply = false;
  const firstOptionIndex = command === "update" ? 2 : 1;
  for (let index = firstOptionIndex; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      return {
        ...options,
        command,
        help: true,
        confirmed: false,
        apply: false,
        courseId,
      };
    }
    if (argument === "--yes") {
      if (command !== "update") {
        throw new Error("--yes is only valid for materials update.");
      }
      confirmed = true;
      continue;
    }
    if (argument === "--apply") {
      if (command !== "drift") {
        throw new Error("--apply is only valid for materials drift.");
      }
      apply = true;
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
      options.localMaterialRoot ?? resolve(root, "..", "local-courses"),
    ),
    outputDirectory: resolve(
      options.outputDirectory ?? join(root, "reports", "materials"),
    ),
    command,
    courseId,
    confirmed,
    apply,
  };
}

function emptySummary(): MaterialCheckReport["summary"] {
  return {
    total: 0,
    skipped: 0,
    missing: 0,
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
    `| missing (material path is gone) | ${report.summary.missing} |`,
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
      // "No Git marker" and "the path is gone" are different failures. A loose
      // PDF has no marker and never will; a vanished directory means the
      // catalog is pointing at nothing and the site is broken. Folding both
      // into one skipped count is how 133 dead entries once hid behind
      // "56 non-Git references skipped" with a zero exit code.
      const isMissing = !group.materialPaths.some((materialPath) =>
        existsSync(resolve(localRoot, materialPath)),
      );
      if (isMissing) {
        summary.missing += 1;
      } else {
        summary.skipped += 1;
      }
      skipped.push({
        courseIds: group.courseIds,
        materialPaths: group.materialPaths,
        reason: isMissing
          ? "The material path does not exist. This is Catalog Drift; run `materials drift`."
          : "No Git repository marker was found for this material reference.",
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
    `Materials check completed: ${report.summary.total} repositories${report.summary.skipped > 0 ? `, ${report.summary.skipped} non-Git references skipped` : ""}${report.summary.missing > 0 ? `, ${report.summary.missing} missing material paths` : ""}. ${statusSummary || "no repositories"}.\nJSON: ${jsonPath}\nMarkdown: ${markdownPath}\n`,
  );
  if (report.summary.missing > 0) {
    process.stdout.write(
      `${report.summary.missing} material paths no longer exist. Run \`materials drift\` for repair candidates.\n`,
    );
  }
  if (report.summary["check-failed"] > 0 || report.summary.missing > 0) {
    process.exitCode = 1;
  }
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

function renderDriftMarkdown(report: CatalogDriftReport): string {
  const lines = [
    "# Catalog drift report",
    "",
    `Generated at: ${report.generatedAt}`,
    `Local Material root: ${report.localMaterialRoot}`,
    "",
  ];

  if (!report.mounted) {
    lines.push(
      "Local Material is not mounted, so nothing was compared. Declared paths:" +
        ` ${report.summary.declaredPaths}.`,
      "",
    );
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    "## Summary",
    "",
    "| Finding | Count |",
    "| --- | ---: |",
    `| Declared paths | ${report.summary.declaredPaths} |`,
    `| Missing paths | ${report.summary.missing} |`,
    `| — corroborated moves (\`--apply\` rewrites these) | ${report.summary.moved} |`,
    `| — uncertain (decide by hand) | ${report.summary.uncertain} |`,
    `| — gone (no file of that name on disk) | ${report.summary.gone} |`,
    `| Uncatalogued repositories | ${report.summary.uncatalogued} |`,
    `| Items without an upstream fallback | ${report.summary.itemsMissingSourceUrl} |`,
    `| — grouped into repositories to confirm | ${report.summary.upstreamGapRepositories} |`,
    "",
  );

  const moved = report.missingPaths.filter(({ kind }) => kind === "moved");
  if (moved.length > 0) {
    lines.push(
      "## Corroborated moves",
      "",
      "Each target is backed by a directory rewrite that several paths agree on.",
      "",
      "| Declared path | Proposed path | Items |",
      "| --- | --- | ---: |",
      ...moved.map(
        (finding) =>
          `| \`${finding.localPath}\` | \`${finding.proposedPath}\` | ${finding.itemIds.length} |`,
      ),
      "",
    );
  }

  const undecided = report.missingPaths.filter(({ kind }) => kind !== "moved");
  if (undecided.length > 0) {
    lines.push(
      "## Needs a decision",
      "",
      "`--apply` never touches these. A deleted file usually still has a",
      "same-named twin somewhere in the library, so a candidate here is not",
      "evidence the material moved.",
      "",
      "| Declared path | Kind | Candidates | Items |",
      "| --- | --- | ---: | ---: |",
      ...undecided.map(
        (finding) =>
          `| \`${finding.localPath}\` | ${finding.kind} | ${finding.candidateCount} | ${finding.itemIds.join(", ")} |`,
      ),
      "",
    );
  }

  if (report.uncatalogued.length > 0) {
    lines.push(
      "## Uncatalogued material",
      "",
      "Git repositories in the library that no catalog entry points into.",
      "Nothing is added automatically: track, stage, summary, attribution and the",
      "chapter list are curation decisions that cannot be read off a disk.",
      "",
      "| Repository | Markdown files | Branch | Remote |",
      "| --- | ---: | --- | --- |",
      ...report.uncatalogued.map(
        (repository) =>
          `| \`${repository.repositoryPath}\` | ${repository.markdownCount} | ${repository.branch ?? "—"} | ${repository.remote ?? "—"} |`,
      ),
      "",
      "### Paste-ready skeleton",
      "",
      "```json",
      JSON.stringify(
        report.uncatalogued.map((repository) => ({
          id: "TODO-stable-kebab-case-id",
          title: "TODO",
          track: "TODO: learning | aicoding | agentic | application",
          stageIds: [],
          summary: "TODO",
          learningGoals: ["TODO"],
          sourceUrl: toWebBaseUrl(repository.remote),
          localPath: `${repository.repositoryPath}/README.md`,
          accessPolicy: "local-preferred",
          publicationRights: "third-party",
          author: "TODO",
          license: "TODO",
          licenseStatus: "unknown",
          tags: [],
          lastReviewedAt: null,
          references: [
            {
              label: "本地 README",
              sourceUrl: null,
              localPath: `${repository.repositoryPath}/README.md`,
            },
          ],
          unavailableReason: null,
        })),
        null,
        2,
      ),
      "```",
      "",
    );
  }

  if (report.upstreamGaps.length > 0) {
    lines.push(
      "## Upstream fallback gaps",
      "",
      "Items with no `sourceUrl`, grouped by the repository their material lives",
      "in. Confirm once per repository rather than reading every derived link:",
      "the sample is built exactly like the rest of its group, so opening it",
      "settles the whole group.",
      "",
      "The sample URL is **derived, not verified** — this report stays offline by",
      "design. Deriving is not enough on its own: a repository can be private,",
      "renamed or deleted upstream, and a local copy that has drifted from",
      "upstream can name a file that upstream no longer has. Open the sample",
      "before accepting a group.",
      "",
      "| Repository | Items | Branch | Sample upstream URL |",
      "| --- | ---: | --- | --- |",
      ...report.upstreamGaps.map(
        (gap) =>
          `| \`${gap.repositoryPath || "(no repository)"}\` | ${gap.itemIds.length} | ${gap.branch ?? "—"} | ${gap.sampleSourceUrl ?? "—"} |`,
      ),
      "",
    );
  }

  return `${lines.join("\n")}\n`;
}

async function formatAsPrettier(
  filePath: string,
  value: unknown,
): Promise<string> {
  const prettier = await import("prettier");
  const config = await prettier.resolveConfig(filePath);

  // Indent before handing it over. Prettier's JSON printer keeps an object
  // expanded when the source has a newline after its brace, so feeding it
  // minified JSON collapses every object that happens to fit the print width
  // and turns a 113-path edit into a whole-file reformat.
  return prettier.format(JSON.stringify(value, null, 2), {
    ...config,
    filepath: filePath,
  });
}

async function runDrift(options: MaterialsArguments): Promise<void> {
  const contentDirectory = resolve(
    options.contentDirectory ?? join(options.root, "content"),
  );
  const localMaterialRoot = resolve(options.localMaterialRoot ?? "");
  const catalog = await loadContentCatalogFromDirectory(contentDirectory);
  const report = await buildCatalogDriftReport({
    catalog,
    localMaterialRoot,
  });

  const outputDirectory = resolve(
    options.outputDirectory ?? join(options.root, "reports", "materials"),
  );
  await mkdir(outputDirectory, { recursive: true });
  const jsonPath = join(outputDirectory, "catalog-drift.json");
  const markdownPath = join(outputDirectory, "catalog-drift.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(markdownPath, renderDriftMarkdown(report)),
  ]);

  process.stdout.write(
    `Catalog drift: ${report.summary.missing} missing paths ` +
      `(${report.summary.moved} corroborated moves, ${report.summary.uncertain} uncertain, ` +
      `${report.summary.gone} gone), ${report.summary.uncatalogued} uncatalogued repositories, ` +
      `${report.summary.itemsMissingSourceUrl} items without an upstream fallback.\n` +
      `JSON: ${jsonPath}\nMarkdown: ${markdownPath}\n`,
  );

  if (!report.mounted) {
    process.stdout.write(
      "Local Material is not mounted; nothing was compared.\n",
    );
    return;
  }

  if (options.apply) {
    const catalogPath = join(contentDirectory, "courses", "courses.json");
    const items = JSON.parse(await readFile(catalogPath, "utf8")) as unknown[];
    const applied = applyMovedPaths(items, report);
    if (applied.rewrittenPaths === 0) {
      process.stdout.write("No corroborated moves to apply.\n");
    } else {
      // The catalog is hand-maintained and Prettier-checked, so the rewrite has
      // to come back out in Prettier's shape. Writing raw JSON.stringify would
      // expand every inline array and bury 113 real edits in a whole-file diff.
      await writeFile(
        catalogPath,
        await formatAsPrettier(catalogPath, applied.items),
      );
      process.stdout.write(
        `Applied ${applied.rewrittenPaths} path rewrites across ${applied.rewrittenItems} items in ${catalogPath}.\n`,
      );
    }
  }

  // Drift is reported, never enforced by npm run check: the material library is
  // outside this repository and a maintainer reorganising it must not break
  // typecheck, tests and build. A non-zero exit is what makes this command
  // usable as its own gate.
  if (report.summary.missing > 0 || report.summary.uncatalogued > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (options.command === "check") await runCheck(options);
  if (options.command === "drift") await runDrift(options);
  if (options.command === "update") {
    await runUpdate(options);
    recordMaterialsUpdate(process.exitCode ? "failure" : "success");
  }
  if (options.command === "audit") {
    if (!(await runAudit(options))) process.exitCode = 1;
  }
  if (options.command === "reindex") await runReindex(options);
}

main().catch((error) => {
  if (process.argv[2] === "update") recordMaterialsUpdate("failure");
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
