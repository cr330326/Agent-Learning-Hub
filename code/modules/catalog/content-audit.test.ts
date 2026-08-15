import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  auditContentDirectory,
  renderContentAuditMarkdown,
} from "./content-audit";

const applicationRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceContentRoot = join(applicationRoot, "content");
const localMaterialRoot = join(applicationRoot, "..", "local-courses");
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createTemporaryContentRoot() {
  const root = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-content-audit-"),
  );
  temporaryRoots.push(root);
  const contentRoot = join(root, "content");
  await cp(sourceContentRoot, contentRoot, { recursive: true });

  return contentRoot;
}

describe("content audit", () => {
  it("reports deterministic attribution warnings without blocking the cloud catalog", async () => {
    const report = await auditContentDirectory({
      contentRoot: sourceContentRoot,
      mode: "cloud",
    });

    // Counts are deliberately not pinned. Curating attribution or backfilling
    // an upstream URL moves them by design, and a test that fails on every
    // intended catalog edit stops meaning anything. The invariant worth
    // holding is that these stay warnings and never block the cloud catalog;
    // the running totals live in the generated audit report.
    expect(report.errors).toEqual([]);
    for (const code of [
      "missing-source-url",
      "unknown-license",
      "unknown-author",
    ]) {
      const warning = report.warningGroups.find((group) => group.code === code);
      expect(warning, `expected a ${code} warning group`).toBeDefined();
      expect(warning!.count).toBeGreaterThan(0);
      expect(warning!.itemIds).toHaveLength(warning!.count);
    }
    expect(report.network.status).toBe("not-run");
  });

  it("reports schema failures with the content file and field path", async () => {
    const contentRoot = await createTemporaryContentRoot();
    const itemPath = join(contentRoot, "courses", "courses.json");
    const items = JSON.parse(await readFile(itemPath, "utf8")) as Array<
      Record<string, unknown>
    >;
    delete items[0].title;
    await writeFile(itemPath, `${JSON.stringify(items, null, 2)}\n`);

    const report = await auditContentDirectory({ contentRoot, mode: "cloud" });

    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "schema-validation",
        filePath: itemPath,
        path: [0, "title"],
      }),
    );
  });

  it("warns without failing when an allowed local path is missing", async () => {
    const contentRoot = await createTemporaryContentRoot();
    const itemPath = join(contentRoot, "courses", "courses.json");
    const items = JSON.parse(await readFile(itemPath, "utf8")) as Array<
      Record<string, unknown>
    >;
    const localItem = items.find((item) => item.localPath !== null);
    if (!localItem) {
      throw new Error("Expected the fixture to include Local Material.");
    }
    localItem.localPath = "does-not-exist.md";
    await writeFile(itemPath, `${JSON.stringify(items, null, 2)}\n`);

    const report = await auditContentDirectory({
      contentRoot,
      localMaterialRoot,
      mode: "local",
    });

    expect(report.warningGroups).toContainEqual(
      expect.objectContaining({
        code: "local-path-missing",
        itemIds: expect.arrayContaining([localItem.id]),
      }),
    );
    expect(
      report.errors.filter((error) => error.itemId === localItem.id),
    ).toEqual([]);
  });

  it("audits chapter references, not just the item's own local path", async () => {
    const contentRoot = await createTemporaryContentRoot();
    const itemPath = join(contentRoot, "courses", "courses.json");
    const items = JSON.parse(await readFile(itemPath, "utf8")) as Array<
      Record<string, unknown>
    >;
    // An item whose own path still resolves but whose chapter does not: the
    // reader loses that chapter silently, so the audit has to see it.
    const withChapters = items.find((item) => {
      const references = item.references as Array<{ localPath: string | null }>;
      return (
        item.localPath !== null &&
        references.some((reference) => reference.localPath !== null)
      );
    });
    if (!withChapters) {
      throw new Error("Expected the fixture to include chapter references.");
    }
    const references = withChapters.references as Array<{
      localPath: string | null;
    }>;
    const chapter = references.find(
      (reference) => reference.localPath !== null,
    )!;
    chapter.localPath = "chapter-does-not-exist.md";
    await writeFile(itemPath, `${JSON.stringify(items, null, 2)}\n`);

    const report = await auditContentDirectory({
      contentRoot,
      localMaterialRoot,
      mode: "local",
    });

    expect(report.warningGroups).toContainEqual(
      expect.objectContaining({
        code: "local-path-missing",
        itemIds: expect.arrayContaining([withChapters.id]),
      }),
    );
  });

  it("skips local path checks when the root exists but holds no material", async () => {
    // A clean checkout still has local-courses/README.md, so "the directory
    // exists" must not be read as "the material is mounted".
    const root = await mkdtemp(join(tmpdir(), "agent-learning-hub-unmounted-"));
    temporaryRoots.push(root);
    const emptyLibrary = join(root, "local-courses");
    await mkdir(emptyLibrary, { recursive: true });
    await writeFile(join(emptyLibrary, "README.md"), "# Library metadata\n");

    const report = await auditContentDirectory({
      contentRoot: sourceContentRoot,
      localMaterialRoot: emptyLibrary,
      mode: "local",
    });

    expect(report.errors).toEqual([]);
    expect(report.warningGroups).toContainEqual(
      expect.objectContaining({ code: "local-material-root-unavailable" }),
    );
    expect(
      report.warningGroups.some(
        (warning) => warning.code === "local-path-missing",
      ),
    ).toBe(false);
  });

  it("renders Prettier-stable Markdown tables for generated audit reports", () => {
    const markdown = renderContentAuditMarkdown({
      formatVersion: 1,
      mode: "cloud",
      errors: [],
      warningGroups: [
        {
          code: "unknown-author",
          count: 1,
          itemIds: [],
          message: "Brief warning.",
        },
        {
          code: "local-material-root-unavailable",
          count: 42,
          itemIds: [],
          message: "A warning with a longer explanation.",
        },
      ],
      summary: { errorCount: 0, warningCount: 43 },
      network: { status: "not-run", reason: "Not part of this report." },
    });

    const tableLines = markdown
      .split("\n")
      .filter((line) => line.startsWith("|"));

    expect(tableLines).toHaveLength(4);
    expect(new Set(tableLines.map((line) => line.length))).toEqual(
      new Set([tableLines[0].length]),
    );
    expect(tableLines.some((line) => line.includes("| unknown-author"))).toBe(
      true,
    );
    expect(
      tableLines.some((line) =>
        line.includes("| local-material-root-unavailable"),
      ),
    ).toBe(true);
  });
});
