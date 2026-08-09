import Link from "next/link";
import { notFound } from "next/navigation";

import { ResolverAction } from "../../components/content-card";
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
            <span className="item-policy">{item.accessPolicy}</span>
          </div>
          <h2>为什么收录</h2>
          <ul className="check-list">
            {item.learningGoals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
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
          <LearningStateControls itemId={item.id} />
        </article>
        <aside className="detail-meta">
          <dl>
            <div>
              <dt>作者</dt>
              <dd>{item.author}</dd>
            </div>
            <div>
              <dt>许可证</dt>
              <dd>{item.license}</dd>
            </div>
            <div>
              <dt>最近复核</dt>
              <dd>{item.lastReviewedAt ?? "待复核"}</dd>
            </div>
            <div>
              <dt>发布归属</dt>
              <dd>{item.publicationRights}</dd>
            </div>
          </dl>
          <div className="detail-tags">
            <span className="eyebrow">TAGS</span>
            {item.tags.map((tag) => (
              <Link href={`/courses?tag=${encodeURIComponent(tag)}`} key={tag}>
                #{tag}
              </Link>
            ))}
          </div>
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
