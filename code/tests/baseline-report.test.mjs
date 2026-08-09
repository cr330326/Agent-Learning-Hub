import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(testsDirectory, "..");

test("baseline-report writes a machine-readable and Markdown snapshot for the legacy site", async (t) => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-baseline-"),
  );
  const outputDirectory = join(fixtureRoot, "reports", "baseline");
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  await mkdir(join(fixtureRoot, "learning-site", "scripts"), {
    recursive: true,
  });
  await mkdir(join(fixtureRoot, "local-courses", "Learning", "course-a"), {
    recursive: true,
  });
  await mkdir(
    join(fixtureRoot, "local-courses", "Agentic", "course-b", ".git"),
    {
      recursive: true,
    },
  );

  await writeFile(
    join(fixtureRoot, "learning-site", "data.js"),
    `
      (function () {
        const tracks = [
          { id: "learning", dir: "Learning" },
          { id: "agentic", dir: "Agentic" }
        ];
        const stages = [
          { id: "stage-0", reading: [{ doc: "Learning/course-a/README.md" }] },
          { id: "stage-1", reading: [] }
        ];
        const courses = [
          {
            title: "Course A",
            mark: "manual",
            links: [
              ["Read", "Learning/course-a/README.md"],
              ["Upstream", "https://example.com/course-a"]
            ]
          },
          { title: "Course B", links: [["Read", "Agentic/course-b/lesson.md"]] },
          { title: "Remote course", links: [["Upstream", "https://example.com/remote"]] }
        ];
        const menuData = [
          {
            track: "learning",
            items: [
              { doc: "@root/README.md" },
              { doc: "Learning/course-a/README.md" }
            ]
          },
          { track: "agentic", items: [{ doc: "Agentic/course-b/lesson.md" }] }
        ];
        const imageRewrites = [[/^https:\\/\\/example.com\\//, "Learning/course-a/images/"]];
        window.HubData = { tracks, stages, courses, menuData, imageRewrites };
      })();
    `,
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "learning-site", "app.js"),
    "legacy app",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "learning-site", "index.html"),
    "<main>Legacy site</main>",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "learning-site", "styles.css"),
    "@media (max-width: 600px) {}",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "learning-site", "scripts", "audit_paths.py"),
    "# audit",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "local-courses", "Learning", "course-a", "README.md"),
    "A",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "local-courses", "Learning", "course-a", ".git"),
    "gitdir: ignored",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "local-courses", "Agentic", "course-b", "lesson.md"),
    "B",
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts", "baseline-report.mjs"),
      "--root",
      fixtureRoot,
      "--output-dir",
      outputDirectory,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(
    await readFile(join(outputDirectory, "baseline.json"), "utf8"),
  );
  assert.deepEqual(report.counts, {
    courses: 3,
    localReferences: 7,
    readingChapters: 3,
    readingGroups: 2,
    stages: 2,
    tracks: 2,
  });
  assert.deepEqual(report.localMaterials.summary, {
    available: true,
    nestedGitRepositories: 2,
    visibleFiles: 2,
  });

  const summary = await readFile(join(outputDirectory, "baseline.md"), "utf8");
  assert.match(summary, /# Agent Learning Hub baseline report/);
  assert.match(summary, /\| Tracks \| 2 \|/);
  assert.match(summary, /2 nested Git repositories/);
  assert.match(summary, /## Snapshot reconciliation/);
  assert.match(summary, /non-hidden regular files/);
});

test("baseline-report marks missing local references and project directories absent from the catalog", async (t) => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-coverage-"),
  );
  const outputDirectory = join(fixtureRoot, "reports", "baseline");
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  await mkdir(join(fixtureRoot, "learning-site"), { recursive: true });
  await mkdir(join(fixtureRoot, "local-courses", "Learning", "listed"), {
    recursive: true,
  });
  await mkdir(join(fixtureRoot, "local-courses", "Learning", "unlisted"), {
    recursive: true,
  });
  await writeFile(
    join(fixtureRoot, "learning-site", "data.js"),
    `
      window.HubData = {
        tracks: [{ id: "learning", dir: "Learning" }],
        stages: [],
        courses: [{ links: [["Read", "Learning/listed/README.md"]] }],
        menuData: [{ items: [{ doc: "Learning/missing.md" }] }],
        imageRewrites: []
      };
    `,
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "local-courses", "Learning", "listed", "README.md"),
    "listed",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "local-courses", "Learning", "unlisted", "README.md"),
    "unlisted",
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts", "baseline-report.mjs"),
      "--root",
      fixtureRoot,
      "--output-dir",
      outputDirectory,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(
    await readFile(join(outputDirectory, "baseline.json"), "utf8"),
  );
  assert.deepEqual(report.referenceAudit.missing, [
    { kind: "doc", path: "Learning/missing.md" },
  ]);
  assert.deepEqual(report.coverage, {
    projectDirectories: 2,
    unlistedProjects: ["Learning/unlisted"],
  });

  const summary = await readFile(join(outputDirectory, "baseline.md"), "utf8");
  assert.match(summary, /Missing local references: 1/);
  assert.match(summary, /Unlisted project directories: 1/);
});

test("baseline-report marks nested material repositories with uncommitted changes", async (t) => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-dirty-repository-"),
  );
  const outputDirectory = join(fixtureRoot, "reports", "baseline");
  const materialRepository = join(
    fixtureRoot,
    "local-courses",
    "Learning",
    "dirty-course",
  );
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  await mkdir(join(fixtureRoot, "learning-site"), { recursive: true });
  await mkdir(materialRepository, { recursive: true });
  await writeFile(
    join(fixtureRoot, "learning-site", "data.js"),
    "window.HubData = { tracks: [], stages: [], courses: [], menuData: [], imageRewrites: [] };",
    "utf8",
  );
  const initialized = spawnSync(
    "git",
    ["init", "--quiet", materialRepository],
    { encoding: "utf8" },
  );
  assert.equal(initialized.status, 0, initialized.stderr);
  await writeFile(
    join(materialRepository, "pending.md"),
    "uncommitted",
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts", "baseline-report.mjs"),
      "--root",
      fixtureRoot,
      "--output-dir",
      outputDirectory,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(
    await readFile(join(outputDirectory, "baseline.json"), "utf8"),
  );
  assert.deepEqual(report.repositories, [
    { path: "Learning/dirty-course", workingTree: "dirty" },
  ]);

  const summary = await readFile(join(outputDirectory, "baseline.md"), "utf8");
  assert.match(summary, /Repositories with local changes: 1/);
});

test("baseline-report records the legacy capability baseline used for Phase 8 parity checks", async (t) => {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-capabilities-"),
  );
  const outputDirectory = join(fixtureRoot, "reports", "baseline");
  t.after(() => rm(fixtureRoot, { force: true, recursive: true }));

  await mkdir(join(fixtureRoot, "learning-site", "scripts"), {
    recursive: true,
  });
  await writeFile(
    join(fixtureRoot, "learning-site", "data.js"),
    'window.HubData = { tracks: [{ id: "learning" }], stages: [{ id: "stage-0" }], courses: [{ title: "Course" }], menuData: [], imageRewrites: [] };',
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "learning-site", "app.js"),
    'function renderTrackFilter() {} async function loadDoc() {} function markdownToHtml() {} localStorage.setItem("agentHubLastDoc", "path");',
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "learning-site", "styles.css"),
    "@media (max-width: 600px) {}",
    "utf8",
  );
  await writeFile(
    join(fixtureRoot, "learning-site", "scripts", "audit_paths.py"),
    "# audit",
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [
      join(workspaceRoot, "scripts", "baseline-report.mjs"),
      "--root",
      fixtureRoot,
      "--output-dir",
      outputDirectory,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(
    await readFile(join(outputDirectory, "baseline.json"), "utf8"),
  );
  assert.deepEqual(
    report.legacyCapabilities.map(({ available, id }) => ({ available, id })),
    [
      { available: true, id: "learning-route" },
      { available: true, id: "course-catalog" },
      { available: true, id: "track-filtering" },
      { available: true, id: "local-document-reader" },
      { available: true, id: "reading-progress" },
      { available: true, id: "path-audit" },
      { available: true, id: "responsive-layout" },
    ],
  );

  const summary = await readFile(join(outputDirectory, "baseline.md"), "utf8");
  assert.match(summary, /## Legacy capability baseline/);
  assert.match(summary, /Local Markdown reader/);
});
