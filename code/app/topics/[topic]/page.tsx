import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDiscovery } from "../../../lib/discovery";
import { loadPublicCatalog } from "../../../lib/catalog";
import { discoveryTopics } from "../../../modules/discovery/schema";
import {
  DiscoveryList,
  type DiscoveryFilters,
} from "../../components/discovery-list";
import { SectionIntro } from "../../components/site-chrome";
export const dynamic = "force-dynamic";
export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<DiscoveryFilters>;
}) {
  requireDiscovery();
  const { topic: rawTopic } = await params;
  let topic: string;
  try {
    topic = decodeURIComponent(rawTopic);
  } catch {
    notFound();
  }
  if (!discoveryTopics.includes(topic as (typeof discoveryTopics)[number]))
    notFound();
  const catalog = await loadPublicCatalog();
  const words = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const related = catalog.items
    .filter(
      (item) =>
        !item.redirect &&
        words.some((word) =>
          `${item.title} ${item.summary} ${item.tags.join(" ")}`
            .toLowerCase()
            .includes(word),
        ),
    )
    .slice(0, 6);
  return (
    <main className="page page-width">
      <SectionIntro
        eyebrow=""
        title={topic}
        summary="浏览相关工程资讯，沿课程与路线继续深入。"
      />
      {related.length ? (
        <section>
          <h2>相关学习资料</h2>
          <ul>
            {related.map((item) => (
              <li key={item.id}>
                <Link href={`/courses/${item.id}`}>{item.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <DiscoveryList
        fixedTopic={topic}
        basePath={`/topics/${encodeURIComponent(topic)}`}
        params={await searchParams}
      />
    </main>
  );
}
