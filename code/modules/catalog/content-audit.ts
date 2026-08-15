import { readdir, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import {
  ContentCatalogValidationError,
  type ContentSchemaIssue,
} from "./content-schema";
import {
  ContentDocumentParseError,
  ContentDocumentValidationError,
  loadContentCatalogFromDirectory,
} from "./catalog-api";

export type ContentAuditMode = "cloud" | "local";

export type ContentAuditError = {
  code:
    | "content-document-parse"
    | "schema-validation"
    | "catalog-validation"
    | "local-path-not-file"
    | "local-path-escape"
    | "unexpected-audit-error";
  message: string;
  filePath?: string;
  path?: Array<string | number>;
  itemId?: string;
  localPath?: string;
};

export type ContentAuditWarningGroup = {
  code:
    | "missing-source-url"
    | "unknown-author"
    | "unknown-license"
    | "unreferenced-item"
    | "local-material-root-unavailable"
    | "local-path-missing";
  message: string;
  count: number;
  itemIds: string[];
};

export type ContentAuditReport = {
  formatVersion: 1;
  mode: ContentAuditMode;
  errors: ContentAuditError[];
  warningGroups: ContentAuditWarningGroup[];
  summary: {
    errorCount: number;
    warningCount: number;
  };
  network: {
    status: "not-run";
    reason: string;
  };
};

export type ContentAuditOptions = {
  contentRoot: string;
  mode: ContentAuditMode;
  localMaterialRoot?: string;
};

type WarningCode = ContentAuditWarningGroup["code"];

function isOutsideDirectory(root: string, candidate: string) {
  const path = relative(root, candidate);
  return path === ".." || path.startsWith(`..${sep}`) || path.startsWith("../");
}

function formatSchemaIssues(
  issues: ContentSchemaIssue[],
  code: "schema-validation" | "catalog-validation",
  filePath?: string,
): ContentAuditError[] {
  return issues.map((issue) => ({
    code,
    message: issue.message,
    filePath,
    path: issue.path,
  }));
}

function createWarningCollector() {
  const warnings = new Map<
    WarningCode,
    { message: string; itemIds: string[] }
  >();

  return {
    add(code: WarningCode, message: string, itemId?: string) {
      const warning = warnings.get(code) ?? { message, itemIds: [] };
      if (itemId !== undefined) {
        warning.itemIds.push(itemId);
      }
      warnings.set(code, warning);
    },
    values(): ContentAuditWarningGroup[] {
      return [...warnings.entries()]
        .map(([code, warning]) => ({
          code,
          message: warning.message,
          count: warning.itemIds.length || 1,
          itemIds: [...warning.itemIds].sort((left, right) =>
            left.localeCompare(right, "en"),
          ),
        }))
        .sort((left, right) => left.code.localeCompare(right.code, "en"));
    },
  };
}

function finaliseReport(
  mode: ContentAuditMode,
  errors: ContentAuditError[],
  warningGroups: ContentAuditWarningGroup[],
): ContentAuditReport {
  return {
    formatVersion: 1,
    mode,
    errors,
    warningGroups,
    summary: {
      errorCount: errors.length,
      warningCount: warningGroups.reduce(
        (total, warning) => total + warning.count,
        0,
      ),
    },
    network: {
      status: "not-run",
      reason:
        "Network link checks are intentionally separate from deterministic content validation.",
    },
  };
}

/**
 * Answers whether Local Material is actually mounted, which is not the same
 * question as whether the root directory exists.
 *
 * The repository tracks `local-courses/README.md` as library metadata, so a
 * clean checkout — CI, a cloud clean room — has the directory but none of the
 * material. Treating "directory exists" as "mounted" made every declared path
 * look missing there, which is why `check:local` could never pass in CI. A
 * mounted library always has at least one material directory under the root.
 */
export async function isLocalMaterialMounted(root: string): Promise<boolean> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory());
  } catch {
    return false;
  }
}

/** Every Local Material path an item makes readable: its own plus its chapters. */
function declaredLocalPaths(
  item: Awaited<
    ReturnType<typeof loadContentCatalogFromDirectory>
  >["items"][number],
): string[] {
  const paths = [
    ...(item.localPath === null ? [] : [item.localPath]),
    ...item.references
      .map((reference) => reference.localPath)
      .filter((path): path is string => path !== null),
  ];

  return [...new Set(paths)];
}

async function auditLocalPaths(
  localMaterialRoot: string | undefined,
  items: Awaited<ReturnType<typeof loadContentCatalogFromDirectory>>["items"],
  warnings: ReturnType<typeof createWarningCollector>,
): Promise<ContentAuditError[]> {
  if (
    !localMaterialRoot ||
    !(await isLocalMaterialMounted(localMaterialRoot))
  ) {
    warnings.add(
      "local-material-root-unavailable",
      "Local Material is not mounted, so local path existence checks were skipped.",
    );
    return [];
  }

  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(localMaterialRoot);
  } catch {
    warnings.add(
      "local-material-root-unavailable",
      "Local Material is not mounted, so local path existence checks were skipped.",
    );
    return [];
  }

  const errors: ContentAuditError[] = [];
  for (const item of items) {
    // A missing path is Catalog Drift, not an invalid catalog: the material
    // library is outside this repository and the maintainer reorganises it
    // freely. It warns here and `materials drift` reports it with repair
    // candidates. An escaping or non-file path stays an error — those are
    // boundary violations that no amount of reorganising makes correct.
    let itemHasMissingPath = false;

    for (const localPath of declaredLocalPaths(item)) {
      const candidate = resolve(localMaterialRoot, localPath);
      if (isOutsideDirectory(localMaterialRoot, candidate)) {
        errors.push({
          code: "local-path-escape",
          message: "The local path escapes the Local Material root.",
          itemId: item.id,
          localPath,
        });
        continue;
      }

      try {
        const resolvedCandidate = await realpath(candidate);
        if (isOutsideDirectory(resolvedRoot, resolvedCandidate)) {
          errors.push({
            code: "local-path-escape",
            message: "The resolved local path escapes the Local Material root.",
            itemId: item.id,
            localPath,
          });
          continue;
        }

        const target = await stat(resolvedCandidate);
        if (!target.isFile()) {
          errors.push({
            code: "local-path-not-file",
            message: "The local path must point to a regular file.",
            itemId: item.id,
            localPath,
          });
        }
      } catch {
        itemHasMissingPath = true;
      }
    }

    if (itemHasMissingPath) {
      warnings.add(
        "local-path-missing",
        "A declared local path no longer exists; run `materials drift` for repair candidates.",
        item.id,
      );
    }
  }

  return errors;
}

export async function auditContentDirectory(
  options: ContentAuditOptions,
): Promise<ContentAuditReport> {
  try {
    const catalog = await loadContentCatalogFromDirectory(options.contentRoot);
    const warnings = createWarningCollector();
    const referencedByStage = new Set(
      catalog.stages.flatMap((stage) => stage.learningItemIds),
    );

    for (const item of catalog.items) {
      if (item.publicationRights === "third-party" && item.sourceUrl === null) {
        warnings.add(
          "missing-source-url",
          "The Learning Item has no upstream source URL.",
          item.id,
        );
      }
      if (item.author === "Unknown") {
        warnings.add(
          "unknown-author",
          "The Learning Item author is awaiting attribution.",
          item.id,
        );
      }
      if (item.licenseStatus === "unknown") {
        warnings.add(
          "unknown-license",
          "The Learning Item license is awaiting confirmation.",
          item.id,
        );
      }
      if (item.stageIds.length === 0 && !referencedByStage.has(item.id)) {
        warnings.add(
          "unreferenced-item",
          "The Learning Item is not associated with a Learning Stage.",
          item.id,
        );
      }
    }

    const errors =
      options.mode === "local"
        ? await auditLocalPaths(
            options.localMaterialRoot,
            catalog.items,
            warnings,
          )
        : [];
    return finaliseReport(options.mode, errors, warnings.values());
  } catch (error) {
    let errors: ContentAuditError[];
    if (error instanceof ContentDocumentValidationError) {
      errors = formatSchemaIssues(
        error.issues,
        "schema-validation",
        error.filePath,
      );
    } else if (error instanceof ContentCatalogValidationError) {
      errors = formatSchemaIssues(error.issues, "catalog-validation");
    } else if (error instanceof ContentDocumentParseError) {
      errors = [
        {
          code: "content-document-parse",
          message: error.message,
          filePath: error.filePath,
        },
      ];
    } else {
      errors = [
        {
          code: "unexpected-audit-error",
          message: error instanceof Error ? error.message : String(error),
        },
      ];
    }

    return finaliseReport(options.mode, errors, []);
  }
}

function renderMarkdownTable(
  headers: string[],
  alignments: Array<"left" | "right">,
  rows: string[][],
) {
  const widths = headers.map((header, index) =>
    Math.max(3, header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const renderRow = (row: string[], header = false) =>
    `| ${row
      .map((cell, index) => {
        const width = widths[index];
        return alignments[index] === "right" && !header
          ? cell.padStart(width)
          : cell.padEnd(width);
      })
      .join(" | ")} |`;
  const separator = `| ${widths
    .map((width, index) =>
      alignments[index] === "right"
        ? `${"-".repeat(Math.max(3, width - 1))}:`
        : "-".repeat(width),
    )
    .join(" | ")} |`;

  return [
    renderRow(headers, true),
    separator,
    ...rows.map((row) => renderRow(row)),
  ];
}

export function renderContentAuditMarkdown(report: ContentAuditReport): string {
  const warningRows = report.warningGroups.map((warning) => [
    warning.code,
    String(warning.count),
    warning.message,
  ]);
  const lines = [
    "# Content audit report",
    "",
    `Mode: ${report.mode}`,
    "",
    "## Summary",
    "",
    `- Errors: ${report.summary.errorCount}`,
    `- Warnings: ${report.summary.warningCount}`,
    `- Network checks: ${report.network.status}`,
    "",
    "## Warnings",
    "",
    ...renderMarkdownTable(
      ["Code", "Count", "Message"],
      ["left", "right", "left"],
      warningRows,
    ),
    "",
    "## Errors",
    "",
  ];

  if (report.errors.length === 0) {
    lines.push("None.");
  } else {
    const errorRows = report.errors.map((error) => {
      const target = error.itemId ?? error.filePath ?? "—";
      const path = error.path?.join(".") ?? error.localPath ?? "—";
      return [error.code, target, path, error.message];
    });
    lines.push(
      ...renderMarkdownTable(
        ["Code", "Item / file", "Path", "Message"],
        ["left", "left", "left", "left"],
        errorRows,
      ),
    );
  }

  return lines.join("\n");
}
