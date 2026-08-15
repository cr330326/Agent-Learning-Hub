import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const applicationRoot = resolve(import.meta.dirname, "..");
const tsxPath = join(applicationRoot, "node_modules", ".bin", "tsx");
const auditCommandPath = join(applicationRoot, "scripts", "audit-content.ts");

async function createTemporaryDirectory() {
  return mkdtemp(join(tmpdir(), "agent-learning-hub-content-audit-cli-"));
}

async function runAudit(args) {
  return execFileAsync(tsxPath, [auditCommandPath, ...args], {
    cwd: applicationRoot,
  });
}

test("content audit CLI writes Cloud JSON and Markdown reports", async (t) => {
  const outputDirectory = await createTemporaryDirectory();
  t.after(() => rm(outputDirectory, { force: true, recursive: true }));

  await runAudit([
    "--root",
    applicationRoot,
    "--mode",
    "cloud",
    "--output-dir",
    outputDirectory,
  ]);

  const report = JSON.parse(
    await readFile(join(outputDirectory, "content-audit-cloud.json"), "utf8"),
  );
  const markdown = await readFile(
    join(outputDirectory, "content-audit-cloud.md"),
    "utf8",
  );

  assert.equal(report.summary.errorCount, 0);
  assert.match(markdown, /# Content audit report/);
});

test("content audit CLI exits unsuccessfully after writing a deterministic error report", async (t) => {
  const root = await createTemporaryDirectory();
  const contentRoot = join(root, "content");
  const outputDirectory = join(root, "reports");
  t.after(() => rm(root, { force: true, recursive: true }));
  await cp(join(applicationRoot, "content"), contentRoot, { recursive: true });

  const itemPath = join(contentRoot, "courses", "courses.json");
  const items = JSON.parse(await readFile(itemPath, "utf8"));
  delete items[0].title;
  await writeFile(itemPath, `${JSON.stringify(items, null, 2)}\n`);

  await assert.rejects(
    runAudit([
      "--root",
      applicationRoot,
      "--content-dir",
      contentRoot,
      "--mode",
      "cloud",
      "--output-dir",
      outputDirectory,
    ]),
    (error) => error?.code === 1,
  );

  const report = JSON.parse(
    await readFile(join(outputDirectory, "content-audit-cloud.json"), "utf8"),
  );
  assert.equal(report.summary.errorCount, 1);
  assert.equal(report.errors[0].code, "schema-validation");
});
