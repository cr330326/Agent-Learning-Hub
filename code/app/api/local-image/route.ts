import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { getLocalMaterialRoot, loadPublicCatalog } from "../../../lib/catalog";
import type { LearningItem } from "../../../modules/catalog/content-schema";
import {
  createLocalFileAccess,
  UnsafeLocalPathError,
} from "../../../modules/content-resolver/local-file-access";

export const dynamic = "force-dynamic";

const imageTypes: Record<string, string> = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function allowlistedImagePaths(item: LearningItem): Set<string> {
  return new Set([
    ...(item.localPath ? [item.localPath] : []),
    ...(item.references ?? [])
      .map((reference) => reference.localPath)
      .filter((path): path is string => path !== null),
  ]);
}

export async function handleLocalImageRequest(
  request: Request,
  item: LearningItem,
  localRoot: string,
): Promise<Response> {
  if (item.accessPolicy !== "local-preferred") {
    return new Response("Not found", { status: 404 });
  }
  const path = new URL(request.url).searchParams.get("path");
  if (!path || !allowlistedImagePaths(item).has(path)) {
    return new Response("Not found", { status: 404 });
  }
  const contentType = imageTypes[extname(path).toLowerCase()];
  if (!contentType) return new Response("Not found", { status: 404 });

  try {
    const file = await createLocalFileAccess(localRoot).resolve(path);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(await readFile(file.absolutePath), {
      headers: {
        "cache-control": "private, max-age=60",
        "content-type": contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof UnsafeLocalPathError) {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  const itemId = new URL(request.url).searchParams.get("itemId");
  if (!itemId) return new Response("Not found", { status: 404 });
  const catalog = await loadPublicCatalog();
  const item = catalog.items.find((candidate) => candidate.id === itemId);
  if (!item) return new Response("Not found", { status: 404 });
  return handleLocalImageRequest(request, item, getLocalMaterialRoot());
}
