import Link from "next/link";

import { SectionIntro, TrackTag } from "../components/site-chrome";
import {
  StageProgressBadge,
  StageProgressProvider,
} from "../components/stage-progress";
import { loadPublicCatalog } from "../../lib/catalog";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const catalog = await loadPublicCatalog();
  const tracksById = new Map(catalog.tracks.map((track) => [track.id, track]));
  const stages = catalog.stages
    .slice()
    .sort((left, right) => left.order - right.order);

  return (
    <main className="page page-width roadmap-page">
      <SectionIntro
        eyebrow="THE ROADMAP / 09 STAGES"
        title="从一个循环开始，把复杂度一站一站接上去。"
        summary="每个阶段都回答三个问题：要理解什么、要动手做什么、最后留下什么可以复查的成果。"
      />
      <StageProgressProvider>
        <div className="roadmap-list">
          {stages.map((stage) => (
            <article className="roadmap-row" key={stage.id}>
              <div className="roadmap-index" aria-hidden="true">
                {String(stage.order).padStart(2, "0")}
              </div>
              <div className="roadmap-main">
                <div className="roadmap-meta">
                  <span>STAGE {String(stage.order).padStart(2, "0")}</span>
                  {/* Every stage currently spans all four tracks, so repeating
                    the full set nine times says nothing. Only list them when a
                    stage is actually narrower than the whole roadmap. */}
                  {stage.trackIds.length < catalog.tracks.length
                    ? stage.trackIds.map((trackId) => {
                        const track = tracksById.get(trackId);
                        return track ? (
                          <TrackTag key={track.id} track={track} />
                        ) : null;
                      })
                    : null}
                </div>
                <h2>
                  <Link href={`/roadmap/${stage.id}`}>{stage.title}</Link>
                </h2>
                <p>{stage.summary}</p>
                <ul className="inline-list">
                  {stage.learningGoals.slice(0, 3).map((goal) => (
                    <li key={goal}>{goal}</li>
                  ))}
                </ul>
              </div>
              <div className="roadmap-counts">
                <span>
                  <strong>{stage.taskIds.length}</strong> 个动作
                </span>
                <span>
                  <strong>{stage.learningItemIds.length}</strong> 项精选阅读
                </span>
                <span>
                  <strong>{stage.projectOutcomeIds.length}</strong> 个验收产物
                </span>
                <StageProgressBadge
                  stageId={stage.id}
                  taskIds={stage.taskIds}
                />
              </div>
              <Link
                className="row-arrow"
                href={`/roadmap/${stage.id}`}
                aria-label={`查看 ${stage.title}`}
              >
                →
              </Link>
            </article>
          ))}
        </div>
      </StageProgressProvider>
      <section className="callout-strip">
        <p className="eyebrow">THE RULE</p>
        <p>
          阅读和点击只代表开始。完成一个阶段，需要你主动留下至少一条成果记录。
        </p>
        <Link className="text-link" href="/projects">
          看项目阶梯 →
        </Link>
      </section>
    </main>
  );
}
