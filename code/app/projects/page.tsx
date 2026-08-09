import Link from "next/link";

import { SectionIntro } from "../components/site-chrome";
import { loadPublicCatalog } from "../../lib/catalog";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const catalog = await loadPublicCatalog();
  const stagesById = new Map(catalog.stages.map((stage) => [stage.id, stage]));
  const outcomes = catalog.projectOutcomes.slice().sort((left, right) => {
    const leftLevel = left.level ?? Number.MAX_SAFE_INTEGER;
    const rightLevel = right.level ?? Number.MAX_SAFE_INTEGER;
    return leftLevel - rightLevel || left.id.localeCompare(right.id, "en");
  });

  return (
    <main className="page page-width projects-page">
      <SectionIntro
        eyebrow="PROJECT LADDER / PROOF OF WORK"
        title="学习的终点不是读完，是留下一个别人能检查的东西。"
        summary="项目阶梯把抽象能力变成可见产出。路线阶段的成果用于完成约束，阶梯项目则给你下一档的练习方向。"
      />
      <div className="project-ladder">
        {outcomes.map((outcome, index) => {
          const stage = outcome.stageId
            ? stagesById.get(outcome.stageId)
            : undefined;
          return (
            <article className="project-rung" key={outcome.id}>
              <div className="project-level">
                {String(outcome.level ?? index + 1).padStart(2, "0")}
              </div>
              <div className="project-content">
                <div className="project-meta">
                  <span>PROJECT OUTCOME</span>
                  {stage ? (
                    <Link href={`/roadmap/${stage.id}`}>
                      Stage {stage.order}
                    </Link>
                  ) : (
                    <span>OPEN LADDER</span>
                  )}
                </div>
                <h2>{outcome.title}</h2>
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
      <div className="callout-strip">
        <p className="eyebrow">A SMALL PROMISE</p>
        <p>
          阶段完成不会因为你点过链接而自动发生。把成果写下来，再由你亲自确认。
        </p>
      </div>
    </main>
  );
}
