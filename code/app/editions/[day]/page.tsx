import { notFound } from "next/navigation";
import { requireDiscovery } from "../../../lib/discovery";
import { DiscoveryCard } from "../../components/discovery-card";
import { SectionIntro } from "../../components/site-chrome";
export const dynamic = "force-dynamic";
export default async function EditionPage({
  params,
}: {
  params: Promise<{ day: string }>;
}) {
  const repo = requireDiscovery();
  const { day } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) notFound();
  const edition = repo.edition(day);
  if (!edition) notFound();
  return (
    <main className="page page-width">
      <SectionIntro
        eyebrow={day}
        title="精选日报"
        summary={`本期收录 ${edition.entries.length} 条，按工程实践价值排序。`}
      />
      {edition.entries.length ? (
        <div className="content-grid">
          {edition.entries.map((entry) => {
            const item = repo.publicItem(entry.id, entry.versionId);
            return item ? (
              <DiscoveryCard
                key={entry.id}
                item={item}
                versionId={entry.versionId}
              />
            ) : null;
          })}
        </div>
      ) : (
        <div className="empty-state">
          <h2>本期暂无符合条件的精选</h2>
          <p>可在发现页浏览滚动资讯。</p>
        </div>
      )}
    </main>
  );
}
