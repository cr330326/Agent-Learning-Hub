import Link from "next/link";

import type { LearningItem, Track } from "../../modules/catalog/content-schema";
import type { ResolvedContent } from "../../modules/content-resolver/content-resolver";
import { TrackTag } from "./site-chrome";

export function ResolverAction({ resolved }: { resolved: ResolvedContent }) {
  if (resolved.kind === "unavailable") {
    return (
      <span className="resolver-action is-unavailable" title={resolved.reason}>
        {resolved.label}
      </span>
    );
  }

  const isExternal = resolved.kind === "external-link";
  return (
    <a
      className="resolver-action"
      href={resolved.href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
    >
      {resolved.label} <span aria-hidden="true">↗</span>
    </a>
  );
}

export function ContentCard({
  item,
  track,
  resolved,
}: {
  item: LearningItem;
  track: Track;
  resolved: ResolvedContent;
}) {
  // The legacy import copied the collection name into both the summary and a
  // tag, so a tag identical to the summary would just repeat the line above it.
  const tags = displayTags(item.tags)
    .filter((tag) => tag.trim() !== item.summary.trim())
    .slice(0, 3);

  return (
    <article className="content-card">
      <div className="content-card-topline">
        <TrackTag track={track} />
        <span className={`item-policy policy-${item.accessPolicy}`}>
          {policyLabel(item.accessPolicy)}
        </span>
      </div>
      <h2>
        <Link href={`/courses/${item.id}`}>{item.title}</Link>
      </h2>
      <p>{item.summary}</p>
      {tags.length > 0 ? (
        <div className="tag-list" aria-label="标签">
          {tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
      <div className="content-card-footer">
        <span>{authorLabel(item.author)}</span>
        <ResolverAction resolved={resolved} />
      </div>
    </article>
  );
}

export function policyLabel(policy: LearningItem["accessPolicy"]) {
  return {
    owned: "站内内容",
    "upstream-only": "上游链接",
    "local-preferred": "本地优先",
    unavailable: "待处理",
  }[policy];
}

export function publicationRightsLabel(
  rights: LearningItem["publicationRights"],
) {
  return {
    "project-owned": "本站自有",
    "republication-authorized": "已授权转载",
    "third-party": "第三方素材",
  }[rights];
}

/** The legacy import left every unknown field as the literal string "Unknown". */
export function authorLabel(author: string) {
  return author.trim() === "" || author === "Unknown" ? "作者待补" : author;
}

export function licenseLabel(
  license: string,
  status: LearningItem["licenseStatus"],
) {
  if (status === "known" && license && license !== "Unknown") return license;
  return "许可证待确认";
}

/** Bookkeeping tags from the legacy import that carry no reader value. */
const INTERNAL_TAGS = new Set([
  "legacy-reading",
  "legacy-course",
  "legacy",
  "local",
  "featured",
]);

export function displayTags(tags: readonly string[]) {
  return tags.filter((tag) => !INTERNAL_TAGS.has(tag));
}
