#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const JSON_REPORT = "content-boundaries.json";
const MARKDOWN_REPORT = "content-boundaries.md";
const execFileAsync = promisify(execFile);

function usage() {
  return [
    "Usage: node scripts/audit-content-boundaries.mjs [options]",
    "",
    "Options:",
    "  --root <path>        Repository root to inspect (default: current directory)",
    "  --policy <path>      Ownership policy (default: docs/content-boundaries.json)",
    "  --output-dir <path>  Directory for the JSON and Markdown reports",
    "  -h, --help           Show this help message",
  ].join("\n");
}

function parseArguments(args) {
  const options = { root: process.cwd(), policy: undefined, outputDirectory: undefined };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      return { help: true };
    }
    if (argument === "--root" || argument === "--policy" || argument === "--output-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path.`);
      }
      index += 1;
      if (argument === "--root") {
        options.root = value;
      } else if (argument === "--policy") {
        options.policy = value;
      } else {
        options.outputDirectory = value;
      }
      continue;
    }
    throw new Error(`Unknown option: ${argument}`);
  }

  const root = resolve(options.root);
  return {
    help: false,
    root,
    policy: resolve(root, options.policy ?? "docs/content-boundaries.json"),
    outputDirectory: resolve(options.outputDirectory ?? join(root, "reports", "content-boundaries")),
  };
}

function assertStringArray(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`Policy field ${field} must be an array of non-empty strings.`);
  }
}

function validatePolicy(policy) {
  if (!policy || policy.version !== 1) {
    throw new Error("Policy version 1 is required.");
  }
  if (!Array.isArray(policy.ownership)) {
    throw new Error("Policy field ownership must be an array.");
  }
  for (const boundary of policy.ownership) {
    if (
      !boundary ||
      typeof boundary.path !== "string" ||
      typeof boundary.classification !== "string" ||
      typeof boundary.git !== "string" ||
      typeof boundary.image !== "string" ||
      typeof boundary.deployment !== "string"
    ) {
      throw new Error("Each ownership boundary requires path, classification, git, image, and deployment.");
    }
  }
  assertStringArray(policy.gitIgnoreRules, "gitIgnoreRules");
  assertStringArray(policy.dockerIgnoreRules, "dockerIgnoreRules");
  assertStringArray(policy.forbiddenArtifactPrefixes, "forbiddenArtifactPrefixes");
  assertStringArray(policy.forbiddenArtifactPatterns, "forbiddenArtifactPatterns");
  assertStringArray(policy.trackedLocalMaterialAllowlist, "trackedLocalMaterialAllowlist");
}

async function loadPolicy(path) {
  const policy = JSON.parse(await readFile(path, "utf8"));
  validatePolicy(policy);
  return policy;
}

async function readIgnoreRules(path) {
  try {
    const source = await readFile(path, "utf8");
    return source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function missingRules(requiredRules, actualRules) {
  return requiredRules.filter((rule) => !actualRules.includes(rule));
}

function indentation(line) {
  return line.length - line.trimStart().length;
}

function cleanArtifactPath(value) {
  return value.trim().replace(/^['"]|['"]$/g, "").replace(/^\.\//, "");
}

function extractArtifactPaths(source) {
  const lines = source.split(/\r?\n/);
  const paths = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/\buses:\s*actions\/upload-artifact(?:@|\/)/i.test(lines[index])) {
      continue;
    }

    const stepIndentation = indentation(lines[index]);
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      const trimmed = line.trim();
      if (trimmed.startsWith("-") && indentation(line) <= stepIndentation) {
        break;
      }
      const pathMatch = /^\s*path:\s*(.*)$/i.exec(line);
      if (!pathMatch) {
        continue;
      }

      const pathValue = pathMatch[1].trim();
      if (pathValue === "|" || pathValue === ">") {
        const pathIndentation = indentation(line);
        for (cursor += 1; cursor < lines.length; cursor += 1) {
          const nestedLine = lines[cursor];
          const nestedValue = nestedLine.trim();
          if (nestedValue.length === 0) {
            continue;
          }
          if (indentation(nestedLine) <= pathIndentation) {
            cursor -= 1;
            break;
          }
          if (!nestedValue.startsWith("#")) {
            paths.push(cleanArtifactPath(nestedValue));
          }
        }
      } else if (pathValue.length > 0) {
        paths.push(cleanArtifactPath(pathValue));
      }
    }
  }

  return paths;
}

async function workflowFiles(root) {
  const workflowsRoot = join(root, ".github", "workflows");
  try {
    const entries = await readdir(workflowsRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .map((entry) => ({
        absolutePath: join(workflowsRoot, entry.name),
        relativePath: `.github/workflows/${entry.name}`,
      }))
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function forbiddenArtifactReason(path, policy) {
  const prefix = policy.forbiddenArtifactPrefixes.find((candidate) => path.startsWith(candidate));
  if (prefix) {
    return `matches forbidden artifact prefix ${prefix}`;
  }
  const pattern = policy.forbiddenArtifactPatterns.find((candidate) => path.includes(candidate));
  return pattern ? `matches forbidden artifact pattern ${pattern}` : undefined;
}

async function auditCiArtifacts(root, policy) {
  const unsafe = [];
  for (const workflow of await workflowFiles(root)) {
    const source = await readFile(workflow.absolutePath, "utf8");
    for (const artifactPath of extractArtifactPaths(source)) {
      const reason = forbiddenArtifactReason(artifactPath, policy);
      if (reason) {
        unsafe.push({ file: workflow.relativePath, path: artifactPath, reason });
      }
    }
  }
  return unsafe;
}

async function trackedLocalMaterialFiles(root) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", root, "ls-files", "-z", "--", "local-courses"], {
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
    return stdout
      .split("\u0000")
      .filter((path) => path.length > 0)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error && error.code === 128) {
      return [];
    }
    throw error;
  }
}

function renderMarkdown(report) {
  const status = report.status.toUpperCase();
  const sections = [
    "# Content boundary audit",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Status: ${status}`,
    "",
    "## Ownership boundaries",
    "",
    "| Path | Classification | Git | Image | Deployment |",
    "| --- | --- | --- | --- | --- |",
    ...report.ownership.map(
      (boundary) =>
        `| ${boundary.path} | ${boundary.classification} | ${boundary.git} | ${boundary.image} | ${boundary.deployment} |`,
    ),
    "",
    "## Checks",
    "",
    `- Missing Git ignore rules: ${report.checks.gitIgnore.missing.length}`,
    `- Missing Docker ignore rules: ${report.checks.dockerIgnore.missing.length}`,
    `- Unsafe CI artifact paths: ${report.checks.ciArtifacts.unsafe.length}`,
    `- Unapproved tracked local material files: ${report.checks.trackedLocalMaterials.unapproved.length}`,
    "",
  ];

  if (report.violations.length > 0) {
    sections.push("## Violations", "", ...report.violations.map((violation) => `- ${violation}`), "");
  }

  return sections.join("\n");
}

async function createReport(root, policyPath) {
  const policy = await loadPolicy(policyPath);
  const [ciUnsafe, gitIgnoreRules, dockerIgnoreRules, trackedLocalMaterials] = await Promise.all([
    auditCiArtifacts(root, policy),
    readIgnoreRules(join(root, ".gitignore")),
    readIgnoreRules(join(root, ".dockerignore")),
    trackedLocalMaterialFiles(root),
  ]);
  const checks = {
    gitIgnore: {
      missing: missingRules(policy.gitIgnoreRules, gitIgnoreRules),
    },
    dockerIgnore: {
      missing: missingRules(policy.dockerIgnoreRules, dockerIgnoreRules),
    },
    ciArtifacts: {
      unsafe: ciUnsafe,
    },
    trackedLocalMaterials: {
      unapproved: trackedLocalMaterials.filter(
        (path) => !policy.trackedLocalMaterialAllowlist.includes(path),
      ),
    },
  };
  const violations = [
    ...checks.gitIgnore.missing.map((rule) => `Missing Git ignore rule: ${rule}`),
    ...checks.dockerIgnore.missing.map((rule) => `Missing Docker ignore rule: ${rule}`),
    ...checks.ciArtifacts.unsafe.map(
      (artifact) => `Unsafe CI artifact path: ${artifact.path} (${artifact.file})`,
    ),
    ...checks.trackedLocalMaterials.unapproved.map(
      (path) => `Tracked local material is not allowlisted: ${path}`,
    ),
  ];

  return {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    status: violations.length === 0 ? "pass" : "fail",
    ownership: policy.ownership,
    checks,
    violations,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const report = await createReport(options.root, options.policy);
  await mkdir(options.outputDirectory, { recursive: true });
  const jsonPath = join(options.outputDirectory, JSON_REPORT);
  const markdownPath = join(options.outputDirectory, MARKDOWN_REPORT);
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderMarkdown(report), "utf8"),
  ]);

  console.log(`Wrote ${basename(jsonPath)} and ${basename(markdownPath)} to ${options.outputDirectory}`);
  if (report.status === "fail") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
