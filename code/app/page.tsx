import Link from "next/link";

import { StageRoute, TrackTag } from "./components/site-chrome";
import { loadPublicCatalog } from "../lib/catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await loadPublicCatalog();
  const stages = catalog.stages
    .slice()
    .sort((left, right) => left.order - right.order);
  // The four counts must account for every entry — otherwise the panel reads
  // like broken arithmetic (the catalog is overwhelmingly local material).
  const countByPolicy = (policy: string) =>
    catalog.items.filter(({ accessPolicy }) => accessPolicy === policy).length;
  const ownedCount = countByPolicy("owned");
  const upstreamCount = countByPolicy("upstream-only");
  const localCount = countByPolicy("local-preferred");

  return (
    <main className="page home-page">
      <section className="hero-grid page-width">
        <div className="hero-copy">
          <p className="eyebrow">AGENT LEARNING HUB / 2026 FIELD EDITION</p>
          <h1>
            从理解 <em>agent loop</em>，到交付一个真正能运行的系统。
          </h1>
          <p className="hero-lede">
            一条以实践产出为终点的九阶段路线。每一站都有目标、资料、动作和验收提示，今天就知道下一步该做什么。
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/roadmap">
              开始走路线 <span aria-hidden="true">→</span>
            </Link>
            <Link className="text-link" href="/courses">
              先看课程目录
            </Link>
          </div>
        </div>
        <aside className="hero-note" aria-label="学习路线摘要">
          <div className="note-kicker">THE WORKING MAP</div>
          <div className="note-number">09</div>
          <p>个阶段，从基础循环到可观测、可部署的 Agent 工程。</p>
          <div className="note-rule" />
          <dl>
            <div>
              <dt>课程条目</dt>
              <dd>{catalog.items.length}</dd>
            </div>
            <div>
              <dt>本地素材</dt>
              <dd>{localCount}</dd>
            </div>
            <div>
              <dt>站内文章</dt>
              <dd>{ownedCount}</dd>
            </div>
            <div>
              <dt>上游导览</dt>
              <dd>{upstreamCount}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section
        className="route-section page-width"
        aria-labelledby="route-title"
      >
        <div className="section-bar">
          <div>
            <p className="eyebrow">THE SEQUENCE</p>
            <h2 id="route-title">九阶段，不是九个收藏夹</h2>
          </div>
          <Link className="text-link" href="/roadmap">
            查看完整路线 →
          </Link>
        </div>
        <StageRoute stages={stages} />
      </section>

      <section
        className="tracks-section page-width"
        aria-labelledby="tracks-title"
      >
        <div className="section-bar">
          <div>
            <p className="eyebrow">FOUR LENSES</p>
            <h2 id="tracks-title">四条轨道，交叉而不是分叉</h2>
          </div>
          <p className="section-aside">按主题找资料，按阶段做项目。</p>
        </div>
        <div className="track-grid">
          {catalog.tracks.map((track) => (
            <Link
              className="track-panel"
              href={`/courses?track=${track.id}`}
              key={track.id}
            >
              <TrackTag track={track} />
              <p>{track.summary}</p>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mode-section page-width" aria-labelledby="mode-title">
        <div className="mode-panel mode-panel-cloud">
          <p className="eyebrow">CLOUD / PUBLIC</p>
          <h2 id="mode-title">云端看路线，链接回到源头。</h2>
          <p>
            自有内容在站内阅读，第三方资料保留作者、许可证状态和上游地址，不复制本地素材正文。
          </p>
          <Link className="text-link" href="/content-policy">
            阅读内容政策 →
          </Link>
        </div>
        <div className="mode-panel mode-panel-local">
          <p className="eyebrow">LOCAL / DEEP READ</p>
          <h2>本地读素材，缺失时清楚回退。</h2>
          <p>
            本地模式只读取课程清单允许的素材路径；本地文件不存在时，页面会明确提示并提供上游链接。
          </p>
          <Link className="text-link" href="/courses?access=local-preferred">
            找本地优先课程 →
          </Link>
        </div>
      </section>
    </main>
  );
}
