import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  loadCatalogApi,
  loadContentCatalogFromDirectory,
  getDefaultContentRoot,
} from "./catalog-api";
import { itemRedirectHref } from "./item-redirect";
import { listLocalChapters } from "../reader/document-source";

const temporaryRoots: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("curated course continuity", () => {
  it("keeps the old OpenCode lesson ID while routing into its complete ordered course", async () => {
    const api = await loadCatalogApi();
    const old = api.getItem("legacy-reading-14-003")!;
    expect(old.redirect).toEqual({
      itemId: "legacy-course-017",
      chapter: "Learning/learn-opencode/docs/1-start/01-intro.md",
    });
    expect(itemRedirectHref(old)).toContain("legacy-course-017");
    expect(api.listItems().some((item) => item.id === old.id)).toBe(false);
    const owner = api.getItem("legacy-course-017")!;
    const paths = owner.references.map((ref) => ref.localPath);
    const intro = paths.indexOf(
      "Learning/learn-opencode/docs/1-start/01-intro.md",
    );
    expect(intro).toBeGreaterThan(0);
    expect(paths[intro + 1]).toBe(
      "Learning/learn-opencode/docs/1-start/02-install.md",
    );
    expect(paths).toContain(
      "Learning/learn-opencode/docs/1-start/03-network.md",
    );
    expect(paths).toContain(
      "Learning/learn-opencode/docs/5-advanced/25-git-worktree.md",
    );
    expect(paths).toContain(
      "Learning/learn-opencode/docs/appendix/experimental-features.md",
    );
    expect(paths.some((path) => path?.includes("/changelog/"))).toBe(false);
  });
  it("uses the same readable declaration order for navigation, filtering unavailable files", async () => {
    const catalog = await loadContentCatalogFromDirectory(
      getDefaultContentRoot(),
    );
    const owner = catalog.items.find(
      (item) => item.id === "legacy-course-017",
    )!;
    const localRoot = await mkdtemp(join(tmpdir(), "course-navigation-"));
    temporaryRoots.push(localRoot);
    const expected = [
      "Learning/learn-opencode/docs/1-start/01-intro.md",
      "Learning/learn-opencode/docs/1-start/02-install.md",
      "Learning/learn-opencode/docs/1-start/03-network.md",
    ];
    for (const path of expected) {
      await mkdir(dirname(join(localRoot, path)), { recursive: true });
      await writeFile(join(localRoot, path), "# Fixture");
    }
    expect(
      (await listLocalChapters(owner, { localRoot })).map(
        (chapter) => chapter.relativePath,
      ),
    ).toEqual(expected);
  });
});
