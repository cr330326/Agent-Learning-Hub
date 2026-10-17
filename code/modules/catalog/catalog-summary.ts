import type { LearningItem } from "./content-schema";

/**
 * Browsable entries grouped by the access policy the resolver will apply.
 *
 * The home page panel prints the total plus one line per policy, so the
 * breakdown is only honest if the parts add up to the whole. Keeping the
 * counting here — instead of inline in the page — lets that invariant be
 * asserted in a unit test (PAGE-012). Labels stay in the presentation layer.
 */
export type CatalogSummary = {
  total: number;
  owned: number;
  upstreamOnly: number;
  localPreferred: number;
  unavailable: number;
};

export function summarizeCatalog(
  items: readonly LearningItem[],
): CatalogSummary {
  // Retired entries keep their old ID resolvable via redirect, but they are not
  // catalog content: counting them would inflate the total the visitor sees.
  const browsable = items.filter((item) => !item.redirect);

  const countByPolicy = (policy: LearningItem["accessPolicy"]) =>
    browsable.filter(({ accessPolicy }) => accessPolicy === policy).length;

  return {
    total: browsable.length,
    owned: countByPolicy("owned"),
    upstreamOnly: countByPolicy("upstream-only"),
    localPreferred: countByPolicy("local-preferred"),
    unavailable: countByPolicy("unavailable"),
  };
}
