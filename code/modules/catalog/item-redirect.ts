import type { LearningItem } from "./content-schema";

/**
 * The route a retired entry forwards its visitors to, or `null` when the
 * entry is still an active content owner. Chapter redirects land in the
 * owner's reader so the chapter keeps its course context (table of contents,
 * previous/next); everything else lands on the owner's course guide.
 */
export function itemRedirectHref(item: LearningItem): string | null {
  if (!item.redirect) {
    return null;
  }

  return item.redirect.chapter
    ? `/read/${item.redirect.itemId}?chapter=${encodeURIComponent(
        item.redirect.chapter,
      )}`
    : `/courses/${item.redirect.itemId}`;
}
