import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentCard } from "../../components/content-card";
import { getContentResolver, loadPublicCatalog } from "../../../lib/catalog";

export const dynamic = "force-dynamic";

export default async function StagePage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const { stageId } = await params;
  const catalog = await loadPublicCatalog();
  const stage = catalog.stages.find(({ id }) => id === stageId);
  if (!stage) notFound();

  const tracksById = new Map(catalog.tracks.map((track) => [track.id, track]));
  const tasksById = new Map(catalog.stageTasks.map((task) => [task.id, task]));
  const outcomes = catalog.projectOutcomes.filter((outcome) =>
    stage.projectOutcomeIds.includes(outcome.id),
  );
  const items = catalog.items.filter((item) =>
    stage.learningItemIds.includes(item.id),
  );
  const resolver = getContentResolver();
  const resolvedItems = await Promise.all(
    items.map(async (item) => ({
      item,
      resolved: await resolver.resolve(item),
    })),
  );
  const lastOrder = Math.max(...catalog.stages.map(({ order }) => order));
  const railFill = `${lastOrder === 0 ? 100 : Math.round((stage.order / lastOrder) * 100)}%`;
  // The legacy import seeded learningGoals from the task list and
  // maintainerGuide from the summary; show each string once.
  const taskTitles = new Set(
    stage.taskIds
      .map((taskId) => tasksById.get(taskId)?.title)
      .filter((title): title is string => title !== undefined),
  );
  const distinctGoals = stage.learningGoals.filter(
    (goal) => !taskTitles.has(goal),
  );
  const showMaintainerGuide =
    stage.maintainerGuide.trim() !== "" &&
    stage.maintainerGuide.trim() !== stage.summary.trim();

  return (
    <main className="page page-width stage-page">
      <Link className="back-link" href="/roadmap">
        ← 返回九阶段路线
      </Link>
      <div className="stage-heading">
        <div>
          <p className="eyebrow">
            STAGE {String(stage.order).padStart(2, "0")} / MILESTONE
          </p>
          <h1>{stage.title}</h1>
          <p className="stage-lede">{stage.summary}</p>
        </div>
        <div className="stage-rail" aria-hidden="true">
          <span>{String(stage.order).padStart(2, "0")}</span>
          <i style={{ "--rail-fill": railFill } as React.CSSProperties} />
          <span>{String(lastOrder).padStart(2, "0")}</span>
        </div>
      </div>

      <div className="stage-grid">
        <section className="stage-column" aria-labelledby="goals-title">
          <p className="eyebrow">01 / LEARNING GOALS</p>
          <h2 id="goals-title">这一站要能说清楚</h2>
          {distinctGoals.length > 0 ? (
            <ul className="check-list">
              {distinctGoals.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              这一站的目标就在右侧的实践任务里：把每一条做出来，就说明你说得清楚了。
            </p>
          )}
          {showMaintainerGuide ? (
            <div className="maintainer-note">
              <span>维护者提示</span>
              <p>{stage.maintainerGuide}</p>
            </div>
          ) : null}
        </section>

        <section className="stage-column" aria-labelledby="tasks-title">
          <p className="eyebrow">02 / PRACTICE TASKS</p>
          <h2 id="tasks-title">把理解变成动作</h2>
          <ol className="task-list">
            {stage.taskIds.map((taskId, index) => {
              const task = tasksById.get(taskId);
              if (!task) return null;
              return (
                <li key={task.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{task.title}</strong>
                    {task.summary.trim() !== "" &&
                    task.summary.trim() !== task.title.trim() ? (
                      <p>{task.summary}</p>
                    ) : null}
                    {task.acceptanceCriteria.length > 0 ? (
                      <ul className="task-criteria">
                        {task.acceptanceCriteria.map((criterion) => (
                          <li key={criterion}>{criterion}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section
          className="stage-column outcome-column"
          aria-labelledby="outcome-title"
        >
          <p className="eyebrow">03 / PROOF OF WORK</p>
          <h2 id="outcome-title">留下可复查的成果</h2>
          {outcomes.map((outcome) => (
            <div className="outcome-card" key={outcome.id}>
              <span>STAGE OUTCOME</span>
              <h3>{outcome.summary.replace(/^产出[：:]\s*/, "")}</h3>
              <small>完成前至少提交一条成果，并主动确认阶段完成。</small>
              <Link className="outcome-card-link" href="/learning">
                去“我的学习”登记成果 →
              </Link>
            </div>
          ))}
        </section>
      </div>

      <section className="stage-reading" aria-labelledby="reading-title">
        <div className="section-bar">
          <div>
            <p className="eyebrow">CURATED READING</p>
            <h2 id="reading-title">配套资料</h2>
          </div>
          <span className="section-aside">{items.length} 项</span>
        </div>
        <div className="content-grid">
          {resolvedItems.length === 0 ? (
            <p className="empty-state">
              这一站的资料正在整理中，先从上面的实践任务开始。
            </p>
          ) : (
            resolvedItems.map(({ item, resolved }) => {
              const track = tracksById.get(item.track);
              return track ? (
                <ContentCard
                  item={item}
                  track={track}
                  resolved={resolved}
                  key={item.id}
                />
              ) : null;
            })
          )}
        </div>
      </section>
      <div className="stage-neighbors">
        {stage.order > 0 ? (
          <Link href={`/roadmap/stage-${stage.order - 1}`}>← 上一阶段</Link>
        ) : (
          <span />
        )}
        {stage.order < catalog.stages.length - 1 ? (
          <Link href={`/roadmap/stage-${stage.order + 1}`}>下一阶段 →</Link>
        ) : (
          <Link href="/projects">去项目阶梯 →</Link>
        )}
      </div>
    </main>
  );
}
