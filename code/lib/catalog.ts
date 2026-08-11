import { resolve } from "node:path";

import {
  getDefaultContentRoot,
  loadContentCatalogFromDirectory,
} from "../modules/catalog/catalog-api";
import {
  createCloudContentResolver,
  createLocalContentResolver,
} from "../modules/content-resolver/content-resolver";
import {
  parseRuntimeConfig,
  type RuntimeConfig,
} from "../modules/runtime/runtime-config";

export async function loadPublicCatalog() {
  return loadContentCatalogFromDirectory(getDefaultContentRoot());
}

export function getRuntimeConfig(): RuntimeConfig {
  return parseRuntimeConfig(process.env);
}

export function getLocalMaterialRoot(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return resolve(
    environment.LOCAL_MATERIAL_ROOT ??
      resolve(process.cwd(), "..", "local-courses"),
  );
}

export function getContentResolver() {
  const runtime = getRuntimeConfig();
  return runtime.mode === "local"
    ? createLocalContentResolver({ localRoot: getLocalMaterialRoot() })
    : createCloudContentResolver();
}
