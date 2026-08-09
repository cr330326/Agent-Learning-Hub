import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const converterPath = join(repositoryRoot, "scripts", "convert-legacy-content.mjs");

async function createOutputDirectories() {
  const root = await mkdtemp(join(tmpdir(), "agent-learning-hub-convert-"));
  return {
    root,
    contentDirectory: join(root, "content"),
    reportDirectory: join(root, "reports"),
  };
}

async function runConverter(output) {
  await execFileAsync(
    process.execPath,
    [
      converterPath,
      "--root",
      repositoryRoot,
      "--content-dir",
      output.contentDirectory,
      "--report-dir",
      output.reportDirectory,
    ],
    { cwd: repositoryRoot },
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("legacy converter creates a lossless, deterministic catalog import and pending-attribution report", async (t) => {
  const first = await createOutputDirectories();
  const second = await createOutputDirectories();
  t.after(async () => {
    await Promise.all([
      rm(first.root, { force: true, recursive: true }),
      rm(second.root, { force: true, recursive: true }),
    ]);
  });

  await runConverter(first);
  await runConverter(second);

  const [tracks, stages, items, projects, report, firstItemsText, secondItemsText] =
    await Promise.all([
      readJson(join(first.contentDirectory, "catalog", "tracks.json")),
      readJson(join(first.contentDirectory, "stages", "legacy-import.json")),
      readJson(join(first.contentDirectory, "courses", "legacy-import.json")),
      readJson(join(first.contentDirectory, "catalog", "project-outcomes.json")),
      readJson(join(first.reportDirectory, "legacy-conversion.json")),
      readFile(join(first.contentDirectory, "courses", "legacy-import.json"), "utf8"),
      readFile(join(second.contentDirectory, "courses", "legacy-import.json"), "utf8"),
    ]);

  assert.equal(tracks.length, 4);
  assert.equal(stages.length, 9);
  assert.equal(stages.flatMap((document) => document.stageTasks).length, 27);
  assert.equal(stages.flatMap((document) => document.projectOutcomes).length, 9);
  assert.equal(items.length, 514);
  assert.equal(projects.length, 11);
  assert.equal(report.counts.courseCards, 42);
  assert.equal(report.counts.readingGroups, 38);
  assert.equal(report.counts.readingChapters, 472);
  assert.equal(report.counts.stageReadings, 18);
  assert.equal(report.baselineComparison.matches, true);
  assert.equal(report.unresolved.authors, 514);
  assert.equal(report.unresolved.licenses, 514);
  assert.ok(report.unresolved.sourceUrls > 0);
  assert.equal(report.unresolved.entries.length, 514);
  assert.ok(
    report.unresolved.entries.every((entry) =>
      entry.missing.includes("author") && entry.missing.includes("license"),
    ),
  );
  assert.ok(items.every((item) => item.legacyImport.source === "learning-site/data.js"));
  assert.ok(
    items.every(
      (item) => item.author === "Unknown" && item.license === "Unknown",
    ),
  );
  assert.deepEqual(
    items.find((item) => item.id === "legacy-reading-01-001"),
    assert.partialDeepStrictEqual(
      {
        accessPolicy: "unavailable",
        localPath: null,
        references: [],
      },
    ),
  );
  assert.equal(firstItemsText, secondItemsText);
});
