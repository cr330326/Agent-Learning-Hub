import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  getDefaultContentRoot,
  loadCatalogApi,
  loadCatalogApiFromDirectory,
  loadContentCatalogFromDirectory,
} from "./catalog-api";

const sourceContentRoot = fileURLToPath(
  new URL("../../content", import.meta.url),
);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createTemporaryContentRoot() {
  const directory = await mkdtemp(
    join(tmpdir(), "agent-learning-hub-catalog-"),
  );
  temporaryRoots.push(directory);
  await cp(sourceContentRoot, directory, { recursive: true });

  return directory;
}

describe("Catalog API", () => {
  it("uses the repository content directory by default", async () => {
    expect(getDefaultContentRoot()).toBe(sourceContentRoot);
    expect(
      (await loadCatalogApi()).getItem("agent-loop-maintainer-guide"),
    ).toBeDefined();
  });

  it("loads Git-managed structured content without a database and filters items deterministically", async () => {
    const catalog = await loadCatalogApiFromDirectory(sourceContentRoot);
    const allItems = catalog.listItems();
    const legacyReadingItems = catalog.listItems({ tags: ["legacy-reading"] });
    const localPreferredItems = catalog.listItems({
      accessPolicy: "local-preferred",
    });

    expect(allItems).toHaveLength(515);
    expect(allItems.map(({ id }) => id)).toEqual(
      [...allItems.map(({ id }) => id)].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
    );
    expect(legacyReadingItems).toHaveLength(472);
    expect(
      legacyReadingItems.every((item) => item.tags.includes("legacy-reading")),
    ).toBe(true);
    expect(
      catalog
        .listItems({
          stageId: "stage-0",
          track: "learning",
        })
        .map(({ id }) => id),
    ).toEqual(
      expect.arrayContaining(
        catalog.getStage("stage-0")?.learningItemIds ?? [],
      ),
    );
    expect(catalog.listItems({ track: "aicoding" })).not.toHaveLength(0);
    expect(localPreferredItems).not.toHaveLength(0);
    expect(
      localPreferredItems.every(
        (item) => item.accessPolicy === "local-preferred",
      ),
    ).toBe(true);
  });

  it("finds individual records and returns undefined for missing IDs", async () => {
    const catalog = await loadCatalogApiFromDirectory(sourceContentRoot);

    expect(catalog.getItem("legacy-course-001")?.title).toBe("Hello-Agents");
    expect(catalog.getItem("missing-item")).toBeUndefined();
    expect(catalog.getStage("stage-0")?.taskIds).toEqual([
      "stage-0-task-1",
      "stage-0-task-2",
      "stage-0-task-3",
    ]);
    expect(catalog.getStage("stage-missing")).toBeUndefined();
  });

  it("rejects invalid content with the source file and field path", async () => {
    const contentRoot = await createTemporaryContentRoot();
    const itemPath = join(contentRoot, "courses", "courses.json");
    const items = JSON.parse(await readFile(itemPath, "utf8")) as Array<
      Record<string, unknown>
    >;
    delete items[0].title;
    await writeFile(itemPath, `${JSON.stringify(items, null, 2)}\n`);

    await expect(
      loadCatalogApiFromDirectory(contentRoot),
    ).rejects.toMatchObject({
      name: "ContentDocumentValidationError",
      filePath: itemPath,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: [0, "title"] }),
      ]),
    });
  });

  it("flattens array-based legacy imports and keeps unassigned project outcomes", async () => {
    const contentRoot = await createTemporaryContentRoot();
    const sourceItemPath = join(contentRoot, "courses", "courses.json");
    const [importedItem] = JSON.parse(
      await readFile(sourceItemPath, "utf8"),
    ) as Array<Record<string, unknown>>;
    importedItem.id = "legacy-course-999";
    importedItem.stageIds = [];
    await writeFile(
      join(contentRoot, "courses", "extra-import.json"),
      `${JSON.stringify([importedItem], null, 2)}\n`,
    );
    await writeFile(
      join(contentRoot, "catalog", "project-outcomes.json"),
      `${JSON.stringify(
        [
          {
            id: "legacy-project-99",
            stageId: null,
            title: "Legacy project",
            summary: "A project preserved without a guessed stage mapping.",
            evidenceTypes: [],
            level: 99,
          },
        ],
        null,
        2,
      )}\n`,
    );

    const [catalog, api] = await Promise.all([
      loadContentCatalogFromDirectory(contentRoot),
      loadCatalogApiFromDirectory(contentRoot),
    ]);

    expect(api.getItem("legacy-course-999")).toMatchObject({ stageIds: [] });
    expect(catalog.projectOutcomes).toContainEqual(
      expect.objectContaining({ id: "legacy-project-99", stageId: null }),
    );
  });
});
