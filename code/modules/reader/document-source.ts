import { readFile, stat } from "node:fs/promises";
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

export type LocalChapter = {
  label: string;
  relativePath: string;
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

export class LocalChapterNotAllowlistedError extends Error {
  constructor(relativePath: string) {
    super(`The local chapter is not allowlisted: ${relativePath}`);
    this.name = "LocalChapterNotAllowlistedError";
  }
}

export class LocalSourceViewUnavailableError extends Error {
  constructor(relativePath: string) {
    super(`A safe text source view is unavailable for ${relativePath}.`);
    this.name = "LocalSourceViewUnavailableError";
  }
}

const MAX_SOURCE_VIEW_BYTES = 256 * 1024;
const BINARY_EXTENSIONS = new Set([
  ".7z",
  ".gif",
  ".gz",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".tar",
  ".webp",
  ".zip",
]);

function localMarkdownExtension(relativePath: string): boolean {
  return new Set([".md", ".mdx", ".markdown"]).has(
    extname(relativePath).toLowerCase(),
  );
}

function localChapterReferences(item: LearningItem): LocalChapter[] {
  const references = [
    ...(item.references ?? [])
      .filter((reference) => reference.localPath !== null)
      .map((reference) => ({
        label: reference.label,
        localPath: reference.localPath as string,
      })),
    ...(item.localPath ? [{ label: "主文档", localPath: item.localPath }] : []),
  ];
  const seen = new Set<string>();
  return references.flatMap(({ label, localPath }) => {
    if (seen.has(localPath)) return [];
    seen.add(localPath);
    return [{ label, relativePath: localPath }];
  });
}

function assertLocalChapter(item: LearningItem, relativePath?: string): string {
  if (item.accessPolicy !== "local-preferred") {
    throw new Error(
      "Only local-preferred content can be read by the local document source.",
    );
  }

  if (item.localPath === null) {
    throw new Error("Local-preferred content requires a local path.");
  }

  const selectedPath = relativePath ?? item.localPath;
  const allowed = localChapterReferences(item).some(
    (chapter) => chapter.relativePath === selectedPath,
  );
  if (!allowed) {
    throw new LocalChapterNotAllowlistedError(selectedPath);
  }

  return selectedPath;
}

async function resolveLocalChapterFile(
  item: LearningItem,
  options: { localRoot: string; relativePath?: string },
) {
  const relativePath = assertLocalChapter(item, options.relativePath);
  const fileAccess = createLocalFileAccess(options.localRoot);
  const file = await fileAccess.resolve(relativePath);
  if (file === null) {
    throw new LocalFileNotFoundError(relativePath);
  }

  return { fileAccess, file };
}

/**
 * Resolves a link or image path written inside a document against that
 * document's own directory, yielding a path relative to the material root.
 *
 * Documents are authored for a checkout, so their hrefs ("./docs/ch1.md") are
 * relative to the file, not to the reader route. Returns null when the target
 * escapes the root — callers still have to check the result against the
 * item's allowlist before serving it.
 */
export function resolveDocumentRelativePath(
  documentPath: string,
  href: string,
): string | null {
  const withoutFragment = href.split(/[?#]/)[0].trim();
  if (withoutFragment === "") return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutFragment);
  } catch {
    decoded = withoutFragment;
  }
  if (decoded.startsWith("/") || decoded.includes("\\")) return null;

  const base = documentPath.split("/").slice(0, -1);
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (base.length === 0) return null; // escaped the material root
      base.pop();
      continue;
    }
    base.push(segment);
  }

  return base.length === 0 ? null : base.join("/");
}

export async function listLocalChapters(
  item: LearningItem,
  options: { localRoot: string },
): Promise<LocalChapter[]> {
  if (item.accessPolicy !== "local-preferred") return [];
  const fileAccess = createLocalFileAccess(options.localRoot);
  const chapters: LocalChapter[] = [];
  for (const chapter of localChapterReferences(item)) {
    try {
      if (
        localMarkdownExtension(chapter.relativePath) &&
        (await fileAccess.resolve(chapter.relativePath))
      ) {
        chapters.push(chapter);
      }
    } catch {
      // Unsafe paths are omitted from navigation and remain unavailable to the reader.
    }
  }
  return chapters;
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
  options: { localRoot: string; relativePath?: string },
): Promise<ReaderDocument> {
  const relativePath = assertLocalChapter(item, options.relativePath);
  if (!localMarkdownExtension(relativePath)) {
    throw new UnsupportedLocalDocumentError(relativePath);
  }

  const { fileAccess, file } = await resolveLocalChapterFile(item, options);

  return {
    itemId: item.id,
    markdown: await fileAccess.readText(file.relativePath),
    sourcePath: file.relativePath,
  };
}

export async function readLocalDocumentSource(
  item: LearningItem,
  options: { localRoot: string; relativePath?: string },
): Promise<ReaderDocument> {
  const { file } = await resolveLocalChapterFile(item, options);
  if (BINARY_EXTENSIONS.has(extname(file.relativePath).toLowerCase())) {
    throw new LocalSourceViewUnavailableError(file.relativePath);
  }
  const fileStats = await stat(file.absolutePath);
  if (fileStats.size > MAX_SOURCE_VIEW_BYTES) {
    throw new LocalSourceViewUnavailableError(file.relativePath);
  }
  const source = await readFile(file.absolutePath);
  const controlByteCount = [...source].filter(
    (byte) => (byte < 9 || (byte > 13 && byte < 32)) && byte !== 0,
  ).length;
  if (
    source.includes(0) ||
    controlByteCount / Math.max(source.length, 1) > 0.01
  ) {
    throw new LocalSourceViewUnavailableError(file.relativePath);
  }

  return {
    itemId: item.id,
    markdown: source.toString("utf8"),
    sourcePath: file.relativePath,
  };
}
