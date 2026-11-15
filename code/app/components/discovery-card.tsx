import Link from "next/link";
import type { PublicItem } from "../../modules/discovery/repository";

export function discoveryDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "发布时间待核实";
}
export function processingLabel(
  state: string,
  audience: "public" | "admin" = "public",
) {
  if (state === "ready") return "已生成摘要";
  if (state === "source-summary" || state === "source-only") return "来源内容";
  if (state === "off-topic") return "主题待复核";
  if (state === "model-not-configured" && audience === "admin")
    return "摘要待补 · 模型待配置";
  return "摘要待补";
}
export function DiscoveryCard({
  item,
  versionId,
}: {
  item: PublicItem;
  versionId?: string;
}) {
  return (
    <article className="content-card discovery-card">
      <div className="content-card-topline">
        <span>
          {(
            {
              article: "文章",
              video: "视频",
              tool: "工具",
              update: "动态",
            } as Record<string, string>
          )[item.contentType] ?? "资讯"}
        </span>
        <time>{discoveryDate(item.publishedAt)}</time>
      </div>
      <h2>
        <Link
          href={`/discover/${item.id}${versionId ? `?version=${versionId}` : ""}`}
        >
          {item.title}
        </Link>
      </h2>
      {item.summary ? (
        <p>{item.summary}</p>
      ) : (
        <p>
          {item.withdrawn
            ? "该条目已由维护者撤下。"
            : "摘要待补，可前往原站查看已有内容。"}
        </p>
      )}
      {item.reason ? <p className="discovery-reason">{item.reason}</p> : null}
      {item.sources.length ? (
        <p className="section-aside">
          {item.sources.map((source) => source.name).join(" · ")}
        </p>
      ) : null}
      <div className="tag-list">
        {item.topics.map((topic) => (
          <Link key={topic} href={`/topics/${encodeURIComponent(topic)}`}>
            {topic}
          </Link>
        ))}
      </div>
      <div className="content-card-footer">
        <span>{item.author}</span>
        <span>
          {item.withdrawn ? "已撤下" : processingLabel(item.processingState)}
        </span>
      </div>
      {!item.withdrawn ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          打开原站 ↗
        </a>
      ) : null}
    </article>
  );
}
