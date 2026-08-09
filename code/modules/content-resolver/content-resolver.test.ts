import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadContentCatalogFromDirectory } from "../catalog/catalog-api";
import {
  createCloudContentResolver,
  type ResolvedContent,
} from "./content-resolver";

const applicationRoot = fileURLToPath(new URL("../../", import.meta.url));

async function loadItems() {
  const catalog = await loadContentCatalogFromDirectory(
    join(applicationRoot, "content"),
  );
  return catalog.items;
}

function byPolicy(
  items: Awaited<ReturnType<typeof loadItems>>,
  policy: string,
) {
  const item = items.find(({ accessPolicy }) => accessPolicy === policy);
  if (!item) {
    throw new Error(`Fixture is missing an item with ${policy} access.`);
  }
  return item;
}

describe("Cloud Content Resolver", () => {
  it.each([
    ["owned", "internal-mdx"],
    ["upstream-only", "external-link"],
  ] as const)("maps %s content to %s", async (policy, kind) => {
    const items = await loadItems();
    const result = await createCloudContentResolver().resolve(
      byPolicy(items, policy),
    );

    expect(result.kind).toBe(kind);
    if ("href" in result) {
      expect(result.href).toMatch(
        kind === "external-link" ? /^https:\/\// : /^\//,
      );
    }
  });

  it("uses the upstream URL for local-preferred content in Cloud Mode", async () => {
    const items = await loadItems();
    const item = items.find(
      ({ accessPolicy, sourceUrl }) =>
        accessPolicy === "local-preferred" && sourceUrl !== null,
    );
    if (!item) {
      throw new Error(
        "Fixture is missing a local-preferred item with an upstream URL.",
      );
    }
    const sourceUrl = item.sourceUrl;
    if (sourceUrl === null) {
      throw new Error("Fixture item is missing its upstream URL.");
    }

    const result = await createCloudContentResolver().resolve(item);

    expect(result).toMatchObject<Partial<ResolvedContent>>({
      kind: "external-link",
      href: sourceUrl,
    });
  });

  it("returns an unavailable explanation when Cloud Mode has no legal target", async () => {
    const items = await loadItems();
    const item = items.find(
      ({ accessPolicy, sourceUrl }) =>
        (accessPolicy === "local-preferred" ||
          accessPolicy === "unavailable") &&
        sourceUrl === null,
    );
    if (!item) {
      throw new Error("Fixture is missing an unavailable item.");
    }

    const result = await createCloudContentResolver().resolve(item);

    expect(result.kind).toBe("unavailable");
    expect("reason" in result ? result.reason : "").toBeTruthy();
  });
});
