#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import vm from "node:vm";

const REPORT_FILE_NAME = "baseline.json";
const SUMMARY_FILE_NAME = "baseline.md";
const execFileAsync = promisify(execFile);

function usage() {
  return [
    "Usage: node scripts/baseline-report.mjs [options]",
    "",
    "Options:",
    "  --root <path>        Repository root to inspect (default: current directory)",
    "  --output-dir <path>  Directory for baseline.json and baseline.md",
    "  -h, --help           Show this help message",
  ].join("\n");
}

function parseArguments(args) {
  const options = { root: process.cwd(), outputDirectory: undefined };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-h" || argument === "--help") {
      return { help: true };
    }

    if (argument === "--root" || argument === "--output-dir") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path.`);
      }
      index += 1;
      if (argument === "--root") {
        options.root = value;
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
    outputDirectory: resolve(options.outputDirectory ?? join(root, "reports", "baseline")),
  };
}

async function loadLegacyData(root) {
  const dataPath = join(root, "learning-site", "data.js");
  const source = await readFile(dataPath, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: dataPath, timeout: 1_000 });

  const data = sandbox.window.HubData;
  if (!data || !Array.isArray(data.tracks) || !Array.isArray(data.stages) || !Array.isArray(data.courses)) {
    throw new Error(`Expected ${dataPath} to assign tracks, stages, and courses to window.HubData.`);
  }

  return data;
}

async function readOptionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function inspectLegacyCapabilities(root, data) {
  const siteRoot = join(root, "learning-site");
  const [appSource, auditSource, stylesSource] = await Promise.all([
    readOptionalText(join(siteRoot, "app.js")),
    readOptionalText(join(siteRoot, "scripts", "audit_paths.py")),
    readOptionalText(join(siteRoot, "styles.css")),
  ]);
  const app = appSource ?? "";
  const styles = stylesSource ?? "";

  return [
    {
      id: "learning-route",
      label: "Learning route",
      available: data.stages.length > 0,
      evidence: ["learning-site/data.js"],
    },
    {
      id: "course-catalog",
      label: "Course catalog",
      available: data.courses.length > 0,
      evidence: ["learning-site/data.js"],
    },
    {
      id: "track-filtering",
      label: "Track filtering",
      available: data.tracks.length > 0 && app.includes("renderTrackFilter"),
      evidence: ["learning-site/data.js", "learning-site/app.js"],
    },
    {
      id: "local-document-reader",
      label: "Local Markdown reader",
      available: app.includes("loadDoc") && app.includes("markdownToHtml"),
      evidence: ["learning-site/app.js"],
    },
    {
      id: "reading-progress",
      label: "Reading progress",
      available: app.includes("localStorage") && app.includes("agentHubLastDoc"),
      evidence: ["learning-site/app.js"],
    },
    {
      id: "path-audit",
      label: "Local path audit",
      available: auditSource !== undefined,
      evidence: ["learning-site/scripts/audit_paths.py"],
    },
    {
      id: "responsive-layout",
      label: "Responsive layout",
      available: styles.includes("@media"),
      evidence: ["learning-site/styles.css"],
    },
  ];
}

function isExternalReference(value) {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function collectLocalReferences(data) {
  const references = new Map();
  const add = (kind, value) => {
    if (typeof value !== "string" || value.length === 0 || isExternalReference(value)) {
      return;
    }
    references.set(`${kind}\u0000${value}`, { kind, path: value });
  };

  for (const stage of data.stages) {
    for (const reading of stage.reading ?? []) {
      add("doc", reading.doc);
    }
  }

  for (const group of data.menuData ?? []) {
    for (const item of group.items ?? []) {
      add("doc", item.doc);
    }
  }

  for (const course of data.courses) {
    for (const link of course.links ?? []) {
      if (Array.isArray(link)) {
        add("link", link[1]);
      }
    }
    if (typeof course.mark === "string" && course.mark.length > 0) {
      add("mark", `@mark/${course.mark}`);
    }
  }

  for (const rewrite of data.imageRewrites ?? []) {
    if (Array.isArray(rewrite)) {
      add("image-rewrite", rewrite[1]);
    }
  }

  return [...references.values()].sort((left, right) => {
    const kindComparison = left.kind.localeCompare(right.kind);
    return kindComparison === 0 ? left.path.localeCompare(right.path) : kindComparison;
  });
}

function resolveReference(root, reference) {
  if (reference.path.startsWith("@root/")) {
    return join(root, reference.path.slice("@root/".length));
  }
  if (reference.path.startsWith("@mark/")) {
    return join(root, "learning-site", "assets", "marks", `${reference.path.slice("@mark/".length)}.svg`);
  }
  return join(root, "local-courses", reference.path);
}

async function auditReferences(root, references) {
  const missing = [];
  let resolved = 0;

  for (const reference of references) {
    try {
      const target = await stat(resolveReference(root, reference));
      const expectedDirectory = reference.kind === "image-rewrite";
      if ((expectedDirectory && target.isDirectory()) || (!expectedDirectory && target.isFile())) {
        resolved += 1;
      } else {
        missing.push(reference);
      }
    } catch (error) {
      if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
        missing.push(reference);
      } else {
        throw error;
      }
    }
  }

  return { missing, resolved, total: references.length };
}

const PROJECT_MARKERS = new Set([".git", "package.json", "pyproject.toml", "pom.xml", "Cargo.toml"]);
const PROJECT_MAX_DEPTH = 4;

function isProjectDirectory(entries) {
  return entries.some(
    (entry) => PROJECT_MARKERS.has(entry.name) || /^readme.*\.md$/i.test(entry.name),
  );
}

async function findProjectDirectories(root) {
  const libraryRoot = join(root, "local-courses");
  const projects = [];

  async function walk(directory, relativeDirectory = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    const depth = relativeDirectory === "" ? 0 : relativeDirectory.split("/").length;
    if (relativeDirectory && isProjectDirectory(entries)) {
      projects.push(relativeDirectory);
      return;
    }
    if (depth >= PROJECT_MAX_DEPTH) {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || !entry.isDirectory()) {
        continue;
      }
      const childRelativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      await walk(join(directory, entry.name), childRelativePath);
    }
  }

  try {
    await walk(libraryRoot);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  return projects.sort((left, right) => left.localeCompare(right));
}

function projectIsListed(projectDirectory, references) {
  const prefix = `${projectDirectory}/`;
  return references.some(
    (reference) =>
      !reference.path.startsWith("@") &&
      (reference.path === projectDirectory || reference.path.startsWith(prefix)),
  );
}

async function scanLocalMaterials(root) {
  const libraryRoot = join(root, "local-courses");
  let visibleFiles = 0;
  const nestedRepositories = [];

  async function walk(directory, relativeDirectory = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    if (relativeDirectory && entries.some((entry) => entry.name === ".git")) {
      nestedRepositories.push(relativeDirectory);
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }

      const childPath = join(directory, entry.name);
      const childRelativePath = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
      if (entry.isDirectory()) {
        await walk(childPath, childRelativePath);
      } else if (entry.isFile()) {
        visibleFiles += 1;
      }
    }
  }

  try {
    await walk(libraryRoot);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        summary: { available: false, nestedGitRepositories: 0, visibleFiles: 0 },
        nestedRepositories: [],
      };
    }
    throw error;
  }

  nestedRepositories.sort((left, right) => left.localeCompare(right));
  return {
    summary: {
      available: true,
      nestedGitRepositories: nestedRepositories.length,
      visibleFiles,
    },
    nestedRepositories,
  };
}

async function inspectRepositories(root, nestedRepositories) {
  return Promise.all(
    nestedRepositories.map(async (repositoryPath) => {
      try {
        const { stdout } = await execFileAsync(
          "git",
          ["-C", join(root, "local-courses", repositoryPath), "status", "--porcelain=v1", "--untracked-files=normal"],
          {
            encoding: "utf8",
            env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
            maxBuffer: 1_024 * 1_024,
          },
        );
        return { path: repositoryPath, workingTree: stdout.trim() === "" ? "clean" : "dirty" };
      } catch {
        return { path: repositoryPath, workingTree: "unavailable" };
      }
    }),
  );
}

function countReadingChapters(data) {
  return (data.menuData ?? []).reduce((total, group) => total + (group.items?.length ?? 0), 0);
}

function renderMarkdown(report) {
  const { counts, coverage, legacyCapabilities, localMaterials, referenceAudit, repositories } = report;
  const materialSummary = localMaterials.summary.available
    ? `${localMaterials.summary.visibleFiles} visible files and ${localMaterials.summary.nestedGitRepositories} nested Git repositories`
    : "local-courses is not available";

  return [
    "# Agent Learning Hub baseline report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Legacy content counts",
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Tracks | ${counts.tracks} |`,
    `| Stages | ${counts.stages} |`,
    `| Courses | ${counts.courses} |`,
    `| Reading groups | ${counts.readingGroups} |`,
    `| Reading chapters | ${counts.readingChapters} |`,
    `| Local references | ${counts.localReferences} |`,
    "",
    "## Local Material Library",
    "",
    `The scan found ${materialSummary}.`,
    "",
    "## Integrity findings",
    "",
    `- Missing local references: ${referenceAudit.missing.length}`,
    `- Unlisted project directories: ${coverage.unlistedProjects.length}`,
    `- Repositories with local changes: ${repositories.filter((repository) => repository.workingTree === "dirty").length}`,
    "",
    "## Legacy capability baseline",
    "",
    "| Capability | Available | Evidence |",
    "| --- | --- | --- |",
    ...legacyCapabilities.map(
      (capability) =>
        `| ${capability.label} | ${capability.available ? "yes" : "no"} | ${capability.evidence.join(", ")} |`,
    ),
    "",
    "## Snapshot reconciliation",
    "",
    "These figures are generated from this checkout and replace hand-maintained counts as the current baseline.",
    "The Local Material Library scan counts non-hidden regular files and excludes hidden entries, Git metadata, and symbolic links.",
    "Treat dated manual figures as historical context when their collection method or checkout differs from this report.",
    "",
  ].join("\n");
}

async function createBaselineReport(root) {
  const data = await loadLegacyData(root);
  const references = collectLocalReferences(data);
  const [coverageProjects, legacyCapabilities, localMaterials, referenceAudit] = await Promise.all([
    findProjectDirectories(root),
    inspectLegacyCapabilities(root, data),
    scanLocalMaterials(root),
    auditReferences(root, references),
  ]);
  const coverage = {
    projectDirectories: coverageProjects.length,
    unlistedProjects: coverageProjects.filter(
      (projectDirectory) => !projectIsListed(projectDirectory, references),
    ),
  };
  const repositories = await inspectRepositories(root, localMaterials.nestedRepositories);

  return {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      legacyData: "learning-site/data.js",
    },
    counts: {
      tracks: data.tracks.length,
      stages: data.stages.length,
      courses: data.courses.length,
      readingGroups: (data.menuData ?? []).length,
      readingChapters: countReadingChapters(data),
      localReferences: references.length,
    },
    localMaterials,
    legacyCapabilities,
    referenceAudit,
    coverage,
    repositories,
    references,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const report = await createBaselineReport(options.root);
  await mkdir(options.outputDirectory, { recursive: true });

  const reportPath = join(options.outputDirectory, REPORT_FILE_NAME);
  const summaryPath = join(options.outputDirectory, SUMMARY_FILE_NAME);
  await Promise.all([
    writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(summaryPath, renderMarkdown(report), "utf8"),
  ]);

  console.log(`Wrote ${basename(reportPath)} and ${basename(summaryPath)} to ${options.outputDirectory}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
