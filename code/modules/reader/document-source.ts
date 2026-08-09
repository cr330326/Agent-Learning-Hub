import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import type { LearningItem } from "../catalog/content-schema";
import { getDefaultContentRoot } from "../catalog/catalog-api";
import {
  createLocalFileAccess,
  LocalFileNotFoundError,
} from "../content-resolver/local-file-access";

export type ReaderDocument = {
  itemId: string;
  markdown: string;
  sourcePath: string;
};

export class OwnedDocumentNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Owned document is not available for ${itemId}.`);
    this.name = "OwnedDocumentNotFoundError";
  }
}

export class UnsupportedLocalDocumentError extends Error {
  constructor(relativePath: string) {
    super(`The local document format is not supported: ${relativePath}`);
    this.name = "UnsupportedLocalDocumentError";
  }
}

export async function readOwnedDocument(
  item: LearningItem,
  options: { contentRoot?: string } = {},
): Promise<ReaderDocument> {
  if (item.accessPolicy !== "owned") {
    throw new Error(
      "Only owned content can be read by the owned document source.",
    );
  }

  const sourcePath = resolve(
    options.contentRoot ?? getDefaultContentRoot(),
    "articles",
    `${item.id}.md`,
  );

  try {
    return {
      itemId: item.id,
      markdown: await readFile(sourcePath, "utf8"),
      sourcePath,
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new OwnedDocumentNotFoundError(item.id);
    }
    throw error;
  }
}

export async function readLocalDocument(
  item: LearningItem,
  options: { localRoot: string },
): Promise<ReaderDocument> {
  if (item.accessPolicy !== "local-preferred") {
    throw new Error(
      "Only local-preferred content can be read by the local document source.",
    );
  }

  if (item.localPath === null) {
    throw new Error("Local-preferred content requires a local path.");
  }

  const extension = extname(item.localPath).toLowerCase();
  if (!new Set([".md", ".mdx", ".markdown"]).has(extension)) {
    throw new UnsupportedLocalDocumentError(item.localPath);
  }

  const fileAccess = createLocalFileAccess(options.localRoot);
  const file = await fileAccess.resolve(item.localPath);
  if (file === null) {
    throw new LocalFileNotFoundError(item.localPath);
  }

  return {
    itemId: item.id,
    markdown: await fileAccess.readText(file.relativePath),
    sourcePath: file.relativePath,
  };
}
