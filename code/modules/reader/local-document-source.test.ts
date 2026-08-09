import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadContentCatalogFromDirectory } from "../catalog/catalog-api";
import type { LearningItem } from "../catalog/content-schema";
import { LocalFileNotFoundError } from "../content-resolver/local-file-access";
import {
  listLocalChapters,
  readLocalDocument,
  readLocalDocumentSource,
  LocalSourceViewUnavailableError,
  UnsupportedLocalDocumentError,
} from "./document-source";

const applicationRoot = fileURLToPath(new URL("../../", import.meta.url));

let items: LearningItem[];
let localRoot: string;

beforeAll(async () => {
  const catalog = await loadContentCatalogFromDirectory(
    join(applicationRoot, "content"),
  );
  items = catalog.items;
});

beforeEach(async () => {
  localRoot = await mkdtemp(join(tmpdir(), "agent-learning-local-reader-"));
});

afterEach(async () => {
  await rm(localRoot, { recursive: true, force: true });
});

function localItem(): LearningItem {
  const item = items.find(
    ({ accessPolicy, localPath }) =>
      accessPolicy === "local-preferred" && localPath !== null,
  );
  if (!item) throw new Error("Expected a local-preferred fixture.");
  return item;
}

describe("local reader document source", () => {
  it("reads Markdown through the safe local file access layer", async () => {
    const item = localItem();
    if (item.localPath === null) throw new Error("Expected a local path.");
    const sourcePath = join(localRoot, item.localPath);
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "# Local chapter\n", "utf8");

    await expect(readLocalDocument(item, { localRoot })).resolves.toMatchObject(
      {
        itemId: item.id,
        markdown: "# Local chapter\n",
      },
    );
  });

  it("reports a missing allowlisted file without exposing a fallback path", async () => {
    await expect(
      readLocalDocument(localItem(), { localRoot }),
    ).rejects.toBeInstanceOf(LocalFileNotFoundError);
  });

  it("refuses to read an item that is not local-preferred", async () => {
    const item = items.find(({ accessPolicy }) => accessPolicy === "owned");
    if (!item) throw new Error("Expected an owned fixture.");

    await expect(readLocalDocument(item, { localRoot })).rejects.toThrow(
      "Only local-preferred content",
    );
  });

  it("does not decode a PDF as Markdown", async () => {
    const item = items.find(
      ({ accessPolicy, localPath }) =>
        accessPolicy === "local-preferred" &&
        localPath !== null &&
        localPath.toLowerCase().endsWith(".pdf"),
    );
    if (!item || item.localPath === null) {
      throw new Error("Expected a local PDF fixture.");
    }
    const sourcePath = join(localRoot, item.localPath);
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "%PDF-1.7\n", "utf8");

    await expect(readLocalDocument(item, { localRoot })).rejects.toBeInstanceOf(
      UnsupportedLocalDocumentError,
    );
  });

  it("can expose an allowlisted unsupported file as escaped source text", async () => {
    const baseItem = localItem();
    const item: LearningItem = {
      ...baseItem,
      localPath: "docs/raw.txt",
      references: [
        {
          label: "raw source",
          sourceUrl: "https://example.com/raw",
          localPath: "docs/raw.txt",
        },
      ],
    };
    const sourcePath = join(localRoot, "docs/raw.txt");
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(
      sourcePath,
      "%PDF-1.7\n<script>not executed</script>\n",
      "utf8",
    );

    await expect(
      readLocalDocumentSource(item, { localRoot }),
    ).resolves.toMatchObject({
      itemId: item.id,
      sourcePath: "docs/raw.txt",
      markdown: "%PDF-1.7\n<script>not executed</script>\n",
    });
  });

  it("does not load binary local files into a source view", async () => {
    const item = items.find(
      ({ accessPolicy, localPath }) =>
        accessPolicy === "local-preferred" &&
        localPath !== null &&
        localPath.toLowerCase().endsWith(".pdf"),
    );
    if (!item || item.localPath === null) {
      throw new Error("Expected a local PDF fixture.");
    }
    const sourcePath = join(localRoot, item.localPath);
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(
      sourcePath,
      Buffer.from("%PDF-1.7\n\u0000binary", "binary"),
    );

    await expect(
      readLocalDocumentSource(item, { localRoot }),
    ).rejects.toBeInstanceOf(LocalSourceViewUnavailableError);
  });

  it("only exposes Markdown chapters already allowlisted by the catalog", async () => {
    const baseItem = localItem();
    if (baseItem.localPath === null) throw new Error("Expected a local path.");
    const item: LearningItem = {
      ...baseItem,
      references: [
        { label: "README", sourceUrl: null, localPath: baseItem.localPath },
        {
          label: "Chapter one",
          sourceUrl: null,
          localPath: "docs/chapter-one.md",
        },
        { label: "PDF", sourceUrl: null, localPath: "book.pdf" },
      ],
    };
    await mkdir(dirname(join(localRoot, baseItem.localPath)), {
      recursive: true,
    });
    await writeFile(join(localRoot, baseItem.localPath), "# README");
    await mkdir(join(localRoot, "docs"), { recursive: true });
    await writeFile(join(localRoot, "docs/chapter-one.md"), "# Chapter one");

    const chapters = await listLocalChapters(item, { localRoot });
    expect(chapters).toEqual([
      { label: "README", relativePath: baseItem.localPath },
      { label: "Chapter one", relativePath: "docs/chapter-one.md" },
    ]);
    await expect(
      readLocalDocument(item, {
        localRoot,
        relativePath: "docs/not-allowlisted.md",
      }),
    ).rejects.toThrow(/allowlist/i);
  });
});
