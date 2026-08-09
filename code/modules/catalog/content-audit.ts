import { realpath, stat } from "node:fs/promises";
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
    | "local-path-missing"
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
    | "local-material-root-unavailable";
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

async function auditLocalPaths(
  localMaterialRoot: string | undefined,
  items: Awaited<ReturnType<typeof loadContentCatalogFromDirectory>>["items"],
  warnings: ReturnType<typeof createWarningCollector>,
): Promise<ContentAuditError[]> {
  if (!localMaterialRoot) {
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
    if (item.localPath === null) {
      continue;
    }

    const candidate = resolve(localMaterialRoot, item.localPath);
    if (isOutsideDirectory(localMaterialRoot, candidate)) {
      errors.push({
        code: "local-path-escape",
        message: "The local path escapes the Local Material root.",
        itemId: item.id,
        localPath: item.localPath,
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
          localPath: item.localPath,
        });
        continue;
      }

      const target = await stat(resolvedCandidate);
      if (!target.isFile()) {
        errors.push({
          code: "local-path-not-file",
          message: "The local path must point to a regular file.",
          itemId: item.id,
          localPath: item.localPath,
        });
      }
    } catch {
      errors.push({
        code: "local-path-missing",
        message: "The local path does not exist in Local Material.",
        itemId: item.id,
        localPath: item.localPath,
      });
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

export function renderContentAuditMarkdown(report: ContentAuditReport): string {
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
    "| Code | Count | Message |",
    "| --- | ---: | --- |",
    ...report.warningGroups.map(
      (warning) =>
        `| ${warning.code} | ${warning.count} | ${warning.message} |`,
    ),
    "",
    "## Errors",
    "",
  ];

  if (report.errors.length === 0) {
    lines.push("None.");
  } else {
    lines.push(
      "| Code | Item / file | Path | Message |",
      "| --- | --- | --- | --- |",
    );
    lines.push(
      ...report.errors.map((error) => {
        const target = error.itemId ?? error.filePath ?? "—";
        const path = error.path?.join(".") ?? error.localPath ?? "—";
        return `| ${error.code} | ${target} | ${path} | ${error.message} |`;
      }),
    );
  }

  return lines.join("\n");
}
