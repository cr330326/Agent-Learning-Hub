import Link from "next/link";

import { SectionIntro } from "../components/site-chrome";
import {
  getLocalMaterialRoot,
  getRuntimeConfig,
  loadPublicCatalog,
} from "../../lib/catalog";
import { getDefaultContentRoot } from "../../modules/catalog/catalog-api";
import {
  buildRuntimeSearchIndex,
  searchDocuments,
} from "../../modules/search/search-index";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    track?: string;
    access?: string;
  }>;
}) {
  const params = await searchParams;
  const catalog = await loadPublicCatalog();
  const runtime = getRuntimeConfig();
  const index = await buildRuntimeSearchIndex(catalog, {
    mode: runtime.mode,
    contentRoot: getDefaultContentRoot(),
    localRoot: getLocalMaterialRoot(),
  });
  const track = catalog.tracks.some(({ id }) => id === params.track)
    ? (params.track as "learning" | "aicoding" | "agentic" | "application")
    : undefined;
  const accessPolicy = [
    "owned",
    "upstream-only",
    "local-document",
    "unavailable",
  ].includes(params.access ?? "")
    ? (params.access as
        "owned" | "upstream-only" | "local-document" | "unavailable")
    : undefined;
  const results = searchDocuments(index, {
    query: params.q,
    stageId: params.stage,
    track,
    accessPolicy,
  });
  const stageTitles = new Map(
    catalog.stages.map((stage) => [stage.id, stage.title]),
  );

  return (
    <main className="page page-width search-page">
      <SectionIntro
        eyebrow="SEARCH / PUBLIC INDEX"
        title="在路线、资料和实践成果里找下一步。"
        summary="搜索只包含公开目录和允许访问的正文，不包含私人笔记；本地模式额外读取课程清单白名单中的章节。"
      />
      <form className="search-bar" method="get">
        <label className="search-query">
          <span>关键词</span>
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="例如：agent loop、评估、记忆"
          />
        </label>
        <label>
          <span>阶段</span>
          <select name="stage" defaultValue={params.stage ?? ""}>
            <option value="">全部阶段</option>
            {catalog.stages.map((stage) => (
              <option value={stage.id} key={stage.id}>
                {stage.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>轨道</span>
          <select name="track" defaultValue={track ?? ""}>
            <option value="">全部轨道</option>
            {catalog.tracks.map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>访问方式</span>
          <select name="access" defaultValue={accessPolicy ?? ""}>
            <option value="">全部方式</option>
            <option value="owned">站内内容</option>
            <option value="local-document">本地章节</option>
            <option value="upstream-only">上游链接</option>
            <option value="unavailable">暂不可用</option>
          </select>
        </label>
        <button className="button button-small" type="submit">
          搜索
        </button>
      </form>
      <div className="directory-heading">
        <p>
          <strong>{results.length}</strong> 项结果
        </p>
        <span>
          {runtime.mode === "local" ? "本地白名单已纳入" : "云端公开索引"}
        </span>
      </div>
      {results.length === 0 ? (
        <div className="empty-state empty-state-wide">
          没有找到匹配内容。试试更短的关键词，或从九阶段路线开始浏览。
        </div>
      ) : (
        <div className="search-result-list">
          {results.map((result) => {
            const href = result.href ?? "/courses";
            return (
              <article
                className="search-result"
                key={`${result.kind}-${result.id}`}
              >
                <div>
                  <span className="search-result-kind">{result.kind}</span>
                  <h2>
                    <Link href={href}>{result.title}</Link>
                  </h2>
                  <p>
                    {result.stageIds
                      ?.map((stageId) => stageTitles.get(stageId) ?? stageId)
                      .join(" / ")}
                  </p>
                </div>
                <span className="item-policy">
                  {result.accessPolicy ?? "公开内容"}
                </span>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
