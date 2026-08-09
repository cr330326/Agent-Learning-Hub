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
  return (
    <article className="content-card">
      <div className="content-card-topline">
        <TrackTag track={track} />
        <span className="item-policy">{policyLabel(item.accessPolicy)}</span>
      </div>
      <h2>
        <Link href={`/courses/${item.id}`}>{item.title}</Link>
      </h2>
      <p>{item.summary}</p>
      <div className="tag-list" aria-label="标签">
        {item.tags.slice(0, 4).map((tag) => (
          <span key={tag}>#{tag}</span>
        ))}
      </div>
      <div className="content-card-footer">
        <span>{item.author}</span>
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
