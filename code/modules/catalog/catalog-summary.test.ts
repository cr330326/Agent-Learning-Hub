import { describe, expect, it } from "vitest";

import {
  getDefaultContentRoot,
  loadContentCatalogFromDirectory,
} from "./catalog-api";
import { summarizeCatalog } from "./catalog-summary";
import type { LearningItem } from "./content-schema";

function item(
  id: string,
  accessPolicy: LearningItem["accessPolicy"],
  redirect?: LearningItem["redirect"],
) {
  return { id, accessPolicy, redirect } as unknown as LearningItem;
}

describe("summarizeCatalog", () => {
  it("counts every browsable entry exactly once across the four policies", async () => {
    const catalog = await loadContentCatalogFromDirectory(
      getDefaultContentRoot(),
    );
    const summary = summarizeCatalog(catalog.items);

    expect(
      summary.owned +
        summary.upstreamOnly +
        summary.localPreferred +
        summary.unavailable,
    ).toBe(summary.total);
  });

  it("counts unavailable entries instead of dropping them", () => {
    const summary = summarizeCatalog([
      item("owned-entry", "owned"),
      item("upstream-entry", "upstream-only"),
      item("local-entry", "local-preferred"),
      item("pending-entry", "unavailable"),
    ]);

    expect(summary).toEqual({
      total: 4,
      owned: 1,
      upstreamOnly: 1,
      localPreferred: 1,
      unavailable: 1,
    });
  });

  it("keeps retired entries resolvable but out of the totals", () => {
    const summary = summarizeCatalog([
      item("local-entry", "local-preferred"),
      item("retired-entry", "local-preferred", {
        itemId: "local-entry",
      }),
    ]);

    expect(summary.total).toBe(1);
    expect(summary.localPreferred).toBe(1);
  });
});
