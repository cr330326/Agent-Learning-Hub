import Link from "next/link";

import { SectionIntro } from "../components/site-chrome";
import { loadPublicCatalog } from "../../lib/catalog";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const catalog = await loadPublicCatalog();
  const stagesById = new Map(catalog.stages.map((stage) => [stage.id, stage]));
  const byLevel = (
    left: { level: number | null; id: string },
    right: { level: number | null; id: string },
  ) => {
    const leftLevel = left.level ?? Number.MAX_SAFE_INTEGER;
    const rightLevel = right.level ?? Number.MAX_SAFE_INTEGER;
    return leftLevel - rightLevel || left.id.localeCompare(right.id, "en");
  };
  // Stage outcomes are acceptance gates for the roadmap; ladder projects are
  // free practice. Mixing them into one numbered list made both unreadable.
  const stageOutcomes = catalog.projectOutcomes
    .filter(({ stageId }) => stageId !== null)
    .slice()
    .sort(
      (left, right) =>
        (stagesById.get(left.stageId ?? "")?.order ?? 0) -
        (stagesById.get(right.stageId ?? "")?.order ?? 0),
    );
  const ladderOutcomes = catalog.projectOutcomes
    .filter(({ stageId }) => stageId === null)
    .slice()
    .sort(byLevel);

  return (
    <main className="page page-width projects-page">
      <SectionIntro
        eyebrow="PROJECT LADDER / PROOF OF WORK"
        title="学习的终点不是读完，是留下一个别人能检查的东西。"
        summary="项目阶梯把抽象能力变成可见产出。路线阶段的成果用于完成约束，阶梯项目则给你下一档的练习方向。"
      />

      <section aria-labelledby="ladder-title">
        <div className="section-bar">
          <div>
            <p className="eyebrow">OPEN LADDER</p>
            <h2 id="ladder-title">按难度往上走的练习项目</h2>
          </div>
          <p className="section-aside">
            {ladderOutcomes.length} 个项目 · 每个都留下代码、演示和一段总结。
          </p>
        </div>
        {/* Ladder projects carry no suggested evidence, so reserving the
            evidence column left a dead third column beside every row. */}
        <div
          className={
            ladderOutcomes.some(({ evidenceTypes }) => evidenceTypes.length > 0)
              ? "project-ladder"
              : "project-ladder project-ladder-compact"
          }
        >
          {ladderOutcomes.map((outcome, index) => (
            <article className="project-rung" key={outcome.id}>
              <div className="project-level">
                {String(outcome.level ?? index + 1).padStart(2, "0")}
              </div>
              <div className="project-content">
                <h2>{outcome.title}</h2>
                <p>{outcome.summary}</p>
              </div>
              {outcome.evidenceTypes.length > 0 ? (
                <div className="project-evidence">
                  <span>建议证据</span>
                  <strong>{outcome.evidenceTypes.join(" / ")}</strong>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="stage-outcome-section" aria-labelledby="gates-title">
        <div className="section-bar">
          <div>
            <p className="eyebrow">STAGE GATES</p>
            <h2 id="gates-title">九阶段各自要留下的成果</h2>
          </div>
          <p className="section-aside">完成一个阶段前，至少交一条。</p>
        </div>
        <div className="project-ladder">
          {stageOutcomes.map((outcome) => {
            const stage = stagesById.get(outcome.stageId ?? "");
            return (
              <article className="project-rung" key={outcome.id}>
                <div className="project-level">
                  {String(stage?.order ?? 0).padStart(2, "0")}
                </div>
                <div className="project-content">
                  <h2>{stage?.title ?? outcome.title}</h2>
                  <p>{outcome.summary}</p>
                  {stage ? (
                    <Link className="text-link" href={`/roadmap/${stage.id}`}>
                      查看阶段要求 →
                    </Link>
                  ) : null}
                </div>
                <div className="project-evidence">
                  <span>建议证据</span>
                  <strong>
                    {outcome.evidenceTypes.length > 0
                      ? outcome.evidenceTypes.join(" / ")
                      : "代码 / 演示 / 总结"}
                  </strong>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="callout-strip">
        <p className="eyebrow">A SMALL PROMISE</p>
        <p>
          阶段完成不会因为你点过链接而自动发生。把成果写下来，再由你亲自确认。
        </p>
      </div>
    </main>
  );
}
