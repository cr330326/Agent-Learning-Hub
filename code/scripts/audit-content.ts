import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

import {
  auditContentDirectory,
  renderContentAuditMarkdown,
  type ContentAuditMode,
} from "../modules/catalog/content-audit";

function usage() {
  return [
    "Usage: tsx scripts/audit-content.ts [options]",
    "",
    "Options:",
    "  --root <path>                  Application root (default: code/)",
    "  --content-dir <path>           Content directory (default: <root>/content)",
    "  --local-material-root <path>   Local Material directory (default: ../local-courses)",
    "  --mode <cloud|local>           Audit mode (default: cloud)",
    "  --output-dir <path>            Report directory (default: <root>/reports/content-audit)",
    "  -h, --help                     Show this help message",
  ].join("\n");
}

function parseArguments(args: string[]) {
  const options: {
    root: string;
    contentDirectory?: string;
    localMaterialRoot?: string;
    mode: ContentAuditMode;
    outputDirectory?: string;
  } = {
    root: resolve(import.meta.dirname, ".."),
    mode:
      process.env.DEPLOYMENT_MODE === "local"
        ? "local"
        : process.env.DEPLOYMENT_MODE === "cloud"
          ? "cloud"
          : "cloud",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      return { help: true } as const;
    }

    if (
      argument === "--root" ||
      argument === "--content-dir" ||
      argument === "--local-material-root" ||
      argument === "--mode" ||
      argument === "--output-dir"
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;

      if (argument === "--root") {
        options.root = value;
      } else if (argument === "--content-dir") {
        options.contentDirectory = value;
      } else if (argument === "--local-material-root") {
        options.localMaterialRoot = value;
      } else if (argument === "--mode") {
        if (value !== "cloud" && value !== "local") {
          throw new Error("--mode must be cloud or local.");
        }
        options.mode = value;
      } else {
        options.outputDirectory = value;
      }
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  const root = resolve(options.root);
  return {
    help: false as const,
    root,
    contentDirectory: resolve(
      options.contentDirectory ?? join(root, "content"),
    ),
    localMaterialRoot: resolve(
      options.localMaterialRoot ?? resolve(root, "..", "local-courses"),
    ),
    mode: options.mode,
    outputDirectory: resolve(
      options.outputDirectory ?? join(root, "reports", "content-audit"),
    ),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const report = await auditContentDirectory({
    contentRoot: options.contentDirectory,
    localMaterialRoot: options.localMaterialRoot,
    mode: options.mode,
  });
  const reportBaseName = `content-audit-${options.mode}`;
  await mkdir(options.outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(options.outputDirectory, `${reportBaseName}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    ),
    writeFile(
      join(options.outputDirectory, `${reportBaseName}.md`),
      `${renderContentAuditMarkdown(report)}\n`,
    ),
  ]);

  process.stdout.write(
    `Content audit ${report.summary.errorCount === 0 ? "passed" : "failed"}: ${report.summary.errorCount} errors, ${report.summary.warningCount} warnings.\n`,
  );
  if (report.summary.errorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
