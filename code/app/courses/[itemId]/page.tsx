import Link from "next/link";
import { notFound } from "next/navigation";

import {
  ResolverAction,
  authorLabel,
  displayTags,
  licenseLabel,
  policyLabel,
  publicationRightsLabel,
} from "../../components/content-card";
import { LearningStateControls } from "../../components/learning-state-controls";
import { SectionIntro, TrackTag } from "../../components/site-chrome";
import { getContentResolver, loadPublicCatalog } from "../../../lib/catalog";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const catalog = await loadPublicCatalog();
  const item = catalog.items.find(({ id }) => id === itemId);
  if (!item) notFound();
  const track = catalog.tracks.find(({ id }) => id === item.track);
  if (!track) notFound();
  const stages = catalog.stages.filter(({ id }) => item.stageIds.includes(id));
  const resolved = await getContentResolver().resolve(item);
  const localReadable = resolved.kind === "local-document";

  return (
    <main className="page page-width detail-page">
      <Link className="back-link" href="/courses">
        ← 返回课程目录
      </Link>
      <SectionIntro
        eyebrow="COURSE GUIDE / CURATED ITEM"
        title={item.title}
        summary={item.summary}
      />
      <div className="detail-layout">
        <article className="detail-main">
          <div className="detail-topline">
            <TrackTag track={track} />
            <span className={`item-policy policy-${item.accessPolicy}`}>
              {policyLabel(item.accessPolicy)}
            </span>
          </div>
          {item.learningGoals.length > 0 ? (
            <>
              <h2>为什么收录</h2>
              <ul className="check-list">
                {item.learningGoals.map((goal) => (
                  <li key={goal}>{goal}</li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="detail-action-box">
            <div>
              <p className="eyebrow">ACCESS THROUGH RESOLVER</p>
              <h2>
                {resolved.kind === "unavailable"
                  ? "这个条目还不能安全打开"
                  : "从这里开始"}
              </h2>
              {resolved.kind === "unavailable" ? (
                <p>{resolved.reason}</p>
              ) : (
                <p>访问动作会标明这是站内文章、上游网页还是本地可读内容。</p>
              )}
            </div>
            <ResolverAction resolved={resolved} />
          </div>
          {item.references.length > 0 ? (
            <section className="detail-references" aria-labelledby="refs-title">
              <p className="eyebrow">REFERENCES / 相关入口</p>
              <h2 id="refs-title">这个条目还包含</h2>
              <ul>
                {item.references.map((reference) => (
                  <li
                    key={`${reference.label}-${reference.localPath ?? reference.sourceUrl}`}
                  >
                    {reference.sourceUrl ? (
                      <a
                        href={reference.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {reference.label} ↗
                      </a>
                    ) : localReadable && reference.localPath ? (
                      <Link
                        href={`/read/${item.id}?chapter=${encodeURIComponent(reference.localPath)}`}
                      >
                        {reference.label}
                      </Link>
                    ) : (
                      <span>{reference.label}</span>
                    )}
                    {reference.localPath ? (
                      <small>
                        {localReadable
                          ? "本地素材"
                          : "本地素材 · 需在本地模式打开"}
                      </small>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <LearningStateControls itemId={item.id} />
        </article>
        <aside className="detail-meta">
          <dl>
            <div>
              <dt>作者</dt>
              <dd>{authorLabel(item.author)}</dd>
            </div>
            <div>
              <dt>许可证</dt>
              <dd>{licenseLabel(item.license, item.licenseStatus)}</dd>
            </div>
            <div>
              <dt>最近复核</dt>
              <dd>{item.lastReviewedAt ?? "待复核"}</dd>
            </div>
            <div>
              <dt>发布归属</dt>
              <dd>{publicationRightsLabel(item.publicationRights)}</dd>
            </div>
          </dl>
          {displayTags(item.tags).length > 0 ? (
            <div className="detail-tags">
              <span className="eyebrow">TAGS</span>
              {displayTags(item.tags).map((tag) => (
                <Link
                  href={`/courses?tag=${encodeURIComponent(tag)}`}
                  key={tag}
                >
                  #{tag}
                </Link>
              ))}
            </div>
          ) : null}
          <div className="detail-stages">
            <span className="eyebrow">RELATED STAGES</span>
            {stages.length === 0 ? (
              <p>尚未关联路线阶段。</p>
            ) : (
              stages.map((stage) => (
                <Link href={`/roadmap/${stage.id}`} key={stage.id}>
                  Stage {stage.order} · {stage.title}
                </Link>
              ))
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
