import { LearningDashboard } from "../components/learning-dashboard";
import { SectionIntro } from "../components/site-chrome";
import { loadPublicCatalog } from "../../lib/catalog";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const catalog = await loadPublicCatalog();
  const taskTitles = new Map(
    catalog.stageTasks.map((task) => [task.id, task.title]),
  );
  return (
    <main className="page page-width learning-page">
      <SectionIntro
        eyebrow="MY LEARNING / PRIVATE STATE"
        title="把读过的东西，变成下一步能继续的轨迹。"
        summary="这里汇总你的阅读进度、任务勾选、收藏、私人 Markdown 笔记和阶段成果。公开目录不读取这些私人正文。"
      />
      <LearningDashboard
        items={catalog.items
          .filter((item) => !item.redirect)
          .map(({ id, title }) => ({ id, title }))}
        stages={catalog.stages
          .slice()
          .sort((left, right) => left.order - right.order)
          .map(({ id, title, order, taskIds }) => ({
            id,
            title,
            order,
            tasks: taskIds.map((taskId) => ({
              id: taskId,
              title: taskTitles.get(taskId) ?? taskId,
            })),
          }))}
      />
    </main>
  );
}
