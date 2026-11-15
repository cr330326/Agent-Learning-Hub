import Link from "next/link";
import { getDiscoveryRepository } from "../../lib/discovery";
import { discoveryTopics } from "../../modules/discovery/schema";
import { Pagination } from "./pagination";
import { DiscoveryCard } from "./discovery-card";
import { DiscoveryAutoRefresh } from "./discovery-auto-refresh";

export type DiscoveryFilters = {
  topic?: string;
  type?: string;
  source?: string;
  day?: string;
  q?: string;
  page?: string;
};
export function DiscoveryList({
  params,
  basePath = "/discover",
  fixedTopic,
}: {
  params: DiscoveryFilters;
  basePath?: string;
  fixedTopic?: string;
}) {
  const repo = getDiscoveryRepository();
  const sources = repo
    .sources()
    .filter(({ source }) => repo.listPublic({ source: source.id }).count > 0);
  const availableTopics = discoveryTopics.filter(
    (topic) => repo.listPublic({ topic }).count > 0,
  );
  const topic =
    fixedTopic ??
    (availableTopics.includes(params.topic as (typeof discoveryTopics)[number])
      ? params.topic
      : undefined);
  const source = sources.some(({ source }) => source.id === params.source)
    ? params.source
    : undefined;
  const type = ["article", "video", "tool", "update"].includes(
    params.type ?? "",
  )
    ? params.type
    : undefined;
  const day =
    /^\d{4}-\d{2}-\d{2}$/.test(params.day ?? "") &&
    Number.isFinite(Date.parse(params.day!))
      ? params.day
      : undefined;
  const query = params.q?.slice(0, 200);
  const results = repo.listPublic({
    topic,
    source,
    type,
    day,
    query,
    page: Number(params.page),
  });
  const timestamps = repo
    .sources()
    .map((status) => status.last_success_at ?? 0);
  const lastSync = Math.max(0, ...timestamps);
  return (
    <>
      <DiscoveryAutoRefresh />
      <form
        className="filter-bar discovery-filters"
        method="get"
        action={basePath}
      >
        <label>
          <span>关键词</span>
          <input
            name="q"
            defaultValue={query ?? ""}
            maxLength={200}
            placeholder="搜索工程方法、工具或评测"
          />
        </label>
        {!fixedTopic ? (
          <label>
            <span>主题</span>
            <select name="topic" defaultValue={topic ?? ""}>
              <option value="">全部主题</option>
              {availableTopics.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          <span>内容类型</span>
          <select name="type" defaultValue={type ?? ""}>
            <option value="">全部类型</option>
            <option value="article">文章</option>
            <option value="video">视频</option>
            <option value="tool">工具</option>
            <option value="update">动态</option>
          </select>
        </label>
        <label>
          <span>来源</span>
          <select name="source" defaultValue={source ?? ""}>
            <option value="">全部来源</option>
            {sources.map(({ source }) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>原始日期</span>
          <input type="date" name="day" defaultValue={day ?? ""} />
        </label>
        <button className="button button-primary" type="submit">
          筛选
        </button>
      </form>
      <p className="section-aside">
        共 {results.count} 条资讯
        {lastSync
          ? ` · 最近同步 ${new Date(lastSync).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`
          : " · 等待首次采集"}{" "}
        · <Link href="/editions">历史日报</Link>
      </p>
      {repo
        .sources()
        .filter((status) => status.source.enabled && status.last_error)
        .map((status) => (
          <p className="section-aside" role="status" key={status.source.id}>
            {status.source.name}{" "}
            同步暂时失败，正在重试，当前展示最近成功的数据。
          </p>
        ))}
      {results.items.length ? (
        <div className="content-grid">
          {results.items.map((item) => (
            <DiscoveryCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>暂时没有符合条件的资讯</h2>
          <p>可以调整筛选条件，或稍后查看新内容。</p>
        </div>
      )}
      <Pagination
        basePath={basePath}
        params={{
          topic: fixedTopic ? undefined : topic,
          source,
          type,
          day,
          q: query,
        }}
        page={results.page}
        pageCount={Math.max(1, Math.ceil(results.count / 24))}
      />
    </>
  );
}
