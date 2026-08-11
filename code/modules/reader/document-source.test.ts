import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadContentCatalogFromDirectory } from "../catalog/catalog-api";
import {
  readOwnedDocument,
  resolveDocumentRelativePath,
} from "./document-source";

const applicationRoot = fileURLToPath(new URL("../../", import.meta.url));

describe("owned reader document source", () => {
  it("loads the curated Markdown body for an owned Learning Item", async () => {
    const catalog = await loadContentCatalogFromDirectory(
      join(applicationRoot, "content"),
    );
    const item = catalog.items.find(
      ({ id }) => id === "agent-loop-maintainer-guide",
    );
    if (!item) throw new Error("Expected the maintainer guide fixture.");

    const document = await readOwnedDocument(item, {
      contentRoot: join(applicationRoot, "content"),
    });

    expect(document).toMatchObject({ itemId: item.id });
    expect(document.markdown).toContain("# Agent loop");
  });
});

describe("document-relative path resolution", () => {
  const readme = "Learning/hello-agents/README.md";

  it("resolves sibling and nested links against the document directory", () => {
    expect(resolveDocumentRelativePath(readme, "./docs/前言.md")).toBe(
      "Learning/hello-agents/docs/前言.md",
    );
    expect(resolveDocumentRelativePath(readme, "docs/chapter1/ch1.md")).toBe(
      "Learning/hello-agents/docs/chapter1/ch1.md",
    );
    expect(resolveDocumentRelativePath(readme, "README_EN.md")).toBe(
      "Learning/hello-agents/README_EN.md",
    );
  });

  it("decodes percent-encoded paths and drops query or fragment", () => {
    expect(
      resolveDocumentRelativePath(
        readme,
        "docs/chapter1/%E7%AC%AC%E4%B8%80.md",
      ),
    ).toBe("Learning/hello-agents/docs/chapter1/第一.md");
    expect(resolveDocumentRelativePath(readme, "./docs/a.md#section")).toBe(
      "Learning/hello-agents/docs/a.md",
    );
  });

  it("walks up without escaping the material root", () => {
    expect(resolveDocumentRelativePath(readme, "../other/x.md")).toBe(
      "Learning/other/x.md",
    );
    expect(resolveDocumentRelativePath(readme, "../../../../etc/passwd")).toBe(
      null,
    );
    expect(resolveDocumentRelativePath(readme, "/etc/passwd")).toBe(null);
    expect(resolveDocumentRelativePath(readme, "..\\windows")).toBe(null);
    expect(resolveDocumentRelativePath(readme, "")).toBe(null);
  });
});
