import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testsDirectory, "..");

const policy = {
  version: 1,
  ownership: [
    {
      path: "content/",
      classification: "curated-content",
      git: "included",
      image: "included",
      deployment: "included",
    },
    {
      path: "local-courses/",
      classification: "local-material",
      git: "excluded",
      image: "excluded",
      deployment: "local-only",
    },
  ],
  gitIgnoreRules: [
    "/local-courses/**",
    "/data/**",
    "/backups/**",
    ".env*",
    "*.sqlite",
    "*.sqlite-*",
  ],
  dockerIgnoreRules: [
    "local-courses/",
    "data/",
    "backups/",
    ".env*",
    "*.sqlite",
    "*.sqlite-*",
  ],
  forbiddenArtifactPrefixes: ["local-courses/", "data/", "backups/"],
  forbiddenArtifactPatterns: [".env", ".sqlite", ".db"],
  trackedLocalMaterialAllowlist: ["local-courses/README.md"],
};

test("content-boundary audit writes a passing report for protected source and image contexts", async (t) => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-boundaries-"),
  );
  const outputDirectory = join(fixtureRoot, "reports", "boundaries");
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  await mkdir(join(fixtureRoot, "docs"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "docs", "content-boundaries.json"),
    JSON.stringify(policy),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".gitignore"),
    `${policy.gitIgnoreRules.join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".dockerignore"),
    `${policy.dockerIgnoreRules.join("\n")}\n`,
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts", "audit-content-boundaries.mjs"),
      "--root",
      fixtureRoot,
      "--output-dir",
      outputDirectory,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(
    await readFile(join(outputDirectory, "content-boundaries.json"), "utf8"),
  );
  assert.equal(report.status, "pass");
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.checks.gitIgnore.missing, []);
  assert.deepEqual(report.checks.dockerIgnore.missing, []);
  assert.deepEqual(report.checks.ciArtifacts.unsafe, []);
  assert.deepEqual(report.ownership, policy.ownership);

  const summary = await readFile(
    join(outputDirectory, "content-boundaries.md"),
    "utf8",
  );
  assert.match(summary, /# Content boundary audit/);
  assert.match(summary, /Status: PASS/);
});

test("content-boundary audit fails when a CI artifact would expose local material, state, or secrets", async (t) => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-boundary-leak-"),
  );
  const outputDirectory = join(fixtureRoot, "reports", "boundaries");
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  await mkdir(join(fixtureRoot, "docs"), { recursive: true });
  await mkdir(join(fixtureRoot, ".github", "workflows"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "docs", "content-boundaries.json"),
    JSON.stringify(policy),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".gitignore"),
    `${policy.gitIgnoreRules.join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".dockerignore"),
    `${policy.dockerIgnoreRules.join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".github", "workflows", "publish.yml"),
    `
      jobs:
        archive:
          steps:
            - uses: actions/upload-artifact@v4
              with:
                name: unsafe-build-context
                path: |
                  reports/**
                  local-courses/**
                  data/state.sqlite
                  .env.production
    `,
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts", "audit-content-boundaries.mjs"),
      "--root",
      fixtureRoot,
      "--output-dir",
      outputDirectory,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1, result.stderr);

  const report = JSON.parse(
    await readFile(join(outputDirectory, "content-boundaries.json"), "utf8"),
  );
  assert.equal(report.status, "fail");
  assert.deepEqual(
    report.checks.ciArtifacts.unsafe.map((artifact) => artifact.path),
    ["local-courses/**", "data/state.sqlite", ".env.production"],
  );
  assert.match(
    report.violations.join("\n"),
    /Unsafe CI artifact path: local-courses/,
  );

  const summary = await readFile(
    join(outputDirectory, "content-boundaries.md"),
    "utf8",
  );
  assert.match(summary, /Status: FAIL/);
  assert.match(summary, /Unsafe CI artifact path: data\/state.sqlite/);
});

test("content-boundary audit rejects tracked local material except explicit metadata", async (t) => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-tracked-material-"),
  );
  const outputDirectory = join(fixtureRoot, "reports", "boundaries");
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  await mkdir(join(fixtureRoot, "docs"), { recursive: true });
  await mkdir(join(fixtureRoot, "local-courses"), { recursive: true });
  await writeFile(
    join(fixtureRoot, "docs", "content-boundaries.json"),
    JSON.stringify(policy),
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".gitignore"),
    `${policy.gitIgnoreRules.join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, ".dockerignore"),
    `${policy.dockerIgnoreRules.join("\n")}\n`,
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "local-courses", "README.md"),
    "library metadata",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "local-courses", "third-party.md"),
    "material body",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "local-courses", "第三方资料.md"),
    "material body",
    "utf8",
  );
  const initialized = spawnSync("git", ["init", "--quiet", fixtureRoot], {
    encoding: "utf8",
  });
  assert.equal(initialized.status, 0, initialized.stderr);
  const added = spawnSync(
    "git",
    [
      "-C",
      fixtureRoot,
      "add",
      "-f",
      "local-courses/README.md",
      "local-courses/third-party.md",
      "local-courses/第三方资料.md",
    ],
    { encoding: "utf8" },
  );
  assert.equal(added.status, 0, added.stderr);

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts", "audit-content-boundaries.mjs"),
      "--root",
      fixtureRoot,
      "--output-dir",
      outputDirectory,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1, result.stderr);

  const report = JSON.parse(
    await readFile(join(outputDirectory, "content-boundaries.json"), "utf8"),
  );
  assert.equal(report.status, "fail");
  assert.deepEqual(
    new Set(report.checks.trackedLocalMaterials.unapproved),
    new Set(["local-courses/third-party.md", "local-courses/第三方资料.md"]),
  );
  assert.match(
    report.violations.join("\n"),
    /Tracked local material is not allowlisted/,
  );
});
