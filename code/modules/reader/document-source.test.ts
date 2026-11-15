import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadContentCatalogFromDirectory } from "../catalog/catalog-api";
import {
  readOwnedDocument,
  resolveDocumentRelativePath,
  resolveDeclaredDocumentPath,
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

describe("declared course document links", () => {
  const root = "Learning/learn-opencode/docs";
  const current = root + "/1-start/01-intro.md";
  const paths = new Set([
    current,
    root + "/1-start/index.md",
    root + "/1-start/02-install.md",
    root + "/appendix/faq.md",
  ]);
  it("resolves extensionless and directory links only to a declared readable chapter", () => {
    expect(
      resolveDeclaredDocumentPath(current, "./02-install#安装", paths),
    ).toBe(root + "/1-start/02-install.md");
    expect(resolveDeclaredDocumentPath(current, "../1-start/", paths)).toBe(
      root + "/1-start/index.md",
    );
    expect(
      resolveDeclaredDocumentPath(current, "./03-network", paths),
    ).toBeNull();
  });
  it("requires an explicit route root and the same whitelist for site-relative course links", () => {
    expect(
      resolveDeclaredDocumentPath(current, "/appendix/faq", paths, root),
    ).toBe(root + "/appendix/faq.md");
    expect(
      resolveDeclaredDocumentPath(current, "/appendix/faq", paths),
    ).toBeNull();
    for (const link of [
      "/../../etc/passwd",
      "//example.com/appendix/faq",
      "/appendix/missing",
      "/1-start/%2e%2e/%2e%2e/secrets",
      "\\windows",
      "javascript:alert(1)",
    ]) {
      expect(
        resolveDeclaredDocumentPath(current, link, paths, root),
      ).toBeNull();
    }
  });
});
