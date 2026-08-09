import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadContentCatalogFromDirectory } from "../catalog/catalog-api";
import { readOwnedDocument } from "./document-source";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("owned reader document source", () => {
  it("loads the curated Markdown body for an owned Learning Item", async () => {
    const catalog = await loadContentCatalogFromDirectory(
      join(repositoryRoot, "content"),
    );
    const item = catalog.items.find(
      ({ id }) => id === "agent-loop-maintainer-guide",
    );
    if (!item) throw new Error("Expected the maintainer guide fixture.");

    const document = await readOwnedDocument(item, {
      contentRoot: join(repositoryRoot, "content"),
    });

    expect(document).toMatchObject({ itemId: item.id });
    expect(document.markdown).toContain("# Agent loop");
  });
});
