import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

    expect(report.errors).toEqual([]);
    expect(report.warningGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing-source-url", count: 488 }),
        expect.objectContaining({ code: "unknown-license", count: 514 }),
        expect.objectContaining({ code: "unknown-author", count: 514 }),
      ]),
    );
    expect(report.network.status).toBe("not-run");
  });

  it("reports schema failures with the content file and field path", async () => {
    const contentRoot = await createTemporaryContentRoot();
    const itemPath = join(contentRoot, "courses", "legacy-import.json");
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

  it("fails a local audit when an allowed local path is missing", async () => {
    const contentRoot = await createTemporaryContentRoot();
    const itemPath = join(contentRoot, "courses", "legacy-import.json");
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

    expect(report.errors).toContainEqual(
      expect.objectContaining({
        code: "local-path-missing",
        itemId: localItem.id,
      }),
    );
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
