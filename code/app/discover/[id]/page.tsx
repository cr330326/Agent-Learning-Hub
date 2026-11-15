import { DiscoveryPersonal } from "../../components/discovery-personal";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDiscovery } from "../../../lib/discovery";
import {
  discoveryDate,
  processingLabel,
} from "../../components/discovery-card";
export const dynamic = "force-dynamic";
export default async function DiscoveryDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const repo = requireDiscovery();
  const { id } = await params;
  const { version } = await searchParams;
  // Only versions referenced by a public edition are publicly addressable.
  if (version && !repo.isEditionVersion(id, version)) notFound();
  const item = repo.publicItem(id, version);
  if (!item) notFound();
  return (
    <main className="page page-width">
      <article className="discovery-detail">
        <Link className="text-link" href="/discover">
          ← 返回发现
        </Link>
        <h1>{item.title}</h1>
        <p className="section-aside">
          {item.author} · {discoveryDate(item.publishedAt)} ·{" "}
          {item.withdrawn ? "已撤下" : processingLabel(item.processingState)}
        </p>
        {version ? (
          <p>
            当前展示日报收录时的摘要版本。
            <Link href={`/discover/${id}`}>查看当前版本</Link>
          </p>
        ) : null}
        {item.withdrawn ? (
          <p>
            维护者已撤下此条资讯，历史引用予以保留。
            {item.mergedInto ? (
              <Link href={`/discover/${item.mergedInto}`}>
                查看关联事件主条目
              </Link>
            ) : null}
          </p>
        ) : (
          <>
            <div className="tag-list">
              {item.topics.map((topic) => (
                <Link key={topic} href={`/topics/${encodeURIComponent(topic)}`}>
                  {topic}
                </Link>
              ))}
            </div>
            <section>
              <h2>内容摘要</h2>
              <p className="discovery-summary">
                {item.summary || "摘要待补，目前可通过原站链接访问。"}
              </p>
            </section>
            {item.reason ? (
              <section>
                <h2>推荐理由</h2>
                <p>{item.reason}</p>
              </section>
            ) : null}
            <p>
              采集来源　{item.sources.map((source) => source.name).join("、")}
            </p>
            {item.relatedOriginals.length ? (
              <section>
                <h2>关联原文</h2>
                <ul>
                  {item.relatedOriginals.map((original) => (
                    <li key={original.url}>
                      <a href={original.url} target="_blank" rel="noreferrer">
                        {original.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {item.metrics.map((metric, index) => (
              <p key={index} className="section-aside">
                {Object.entries(metric.values)
                  .map(([name, value]) => `${name} ${value}`)
                  .join(" · ")}{" "}
                · 观测于{" "}
                {new Date(metric.observedAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                })}
              </p>
            ))}
            <a
              className="button button-primary"
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              {item.contentType === "video"
                ? "前往原站观看"
                : "前往原站阅读全文"}{" "}
              ↗
            </a>
          </>
        )}
        <DiscoveryPersonal itemId={id} withdrawn={item.withdrawn} />
      </article>
    </main>
  );
}
