import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { loadContentCatalogFromDirectory } from "../catalog/catalog-api";
import type { LearningItem } from "../catalog/content-schema";
import { LocalFileNotFoundError } from "../content-resolver/local-file-access";
import {
  readLocalDocument,
  UnsupportedLocalDocumentError,
} from "./document-source";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

let items: LearningItem[];
let localRoot: string;

beforeAll(async () => {
  const catalog = await loadContentCatalogFromDirectory(
    join(repositoryRoot, "content"),
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
});
