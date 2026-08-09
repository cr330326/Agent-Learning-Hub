import Link from "next/link";

import { ContentCard } from "../components/content-card";
import { SectionIntro } from "../components/site-chrome";
import { getContentResolver, loadPublicCatalog } from "../../lib/catalog";
import type { LearningItem } from "../../modules/catalog/content-schema";

export const dynamic = "force-dynamic";

type CourseSearchParams = {
  track?: string;
  access?: string;
  stage?: string;
  tag?: string;
};

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<CourseSearchParams>;
}) {
  const params = await searchParams;
  const catalog = await loadPublicCatalog();
  const track = catalog.tracks.some(({ id }) => id === params.track)
    ? (params.track as LearningItem["track"])
    : undefined;
  const accessPolicy = [
    "owned",
    "upstream-only",
    "local-preferred",
    "unavailable",
  ].includes(params.access ?? "")
    ? (params.access as LearningItem["accessPolicy"])
    : undefined;
  const tag = params.tag?.trim() || undefined;
  const items = catalog.items
    .filter((item) => track === undefined || item.track === track)
    .filter(
      (item) =>
        accessPolicy === undefined || item.accessPolicy === accessPolicy,
    )
    .filter(
      (item) =>
        params.stage === undefined || item.stageIds.includes(params.stage),
    )
    .filter((item) => tag === undefined || item.tags.includes(tag))
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  const resolver = getContentResolver();
  const tracksById = new Map(catalog.tracks.map((item) => [item.id, item]));
  const resolvedItems = await Promise.all(
    items.map(async (item) => ({
      item,
      resolved: await resolver.resolve(item),
    })),
  );
  const tags = [
    ...new Set(catalog.items.flatMap(({ tags: itemTags }) => itemTags)),
  ].sort((left, right) => left.localeCompare(right, "zh-CN"));

  return (
    <main className="page page-width courses-page">
      <SectionIntro
        eyebrow="COURSE DIRECTORY / CURATED SOURCES"
        title="先选一个主题，再选一项今天能打开的资料。"
        summary="这里是路线的资料层：课程卡记录目标、归属、许可证和访问方式；阅读按钮由统一 Content Resolver 决定。"
      />
      <form className="filter-bar" method="get">
        <label>
          <span>学习轨道</span>
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
            <option value="upstream-only">上游链接</option>
            <option value="local-preferred">本地优先</option>
            <option value="unavailable">待处理</option>
          </select>
        </label>
        <label>
          <span>标签</span>
          <select name="tag" defaultValue={tag ?? ""}>
            <option value="">全部标签</option>
            {tags.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-small" type="submit">
          应用筛选
        </button>
        <Link className="filter-reset" href="/courses">
          清除
        </Link>
      </form>
      <div className="directory-heading">
        <p>
          <strong>{items.length}</strong> 项结果
        </p>
        {tag ? <span>标签：{tag}</span> : null}
      </div>
      <div className="content-grid">
        {resolvedItems.length === 0 ? (
          <div className="empty-state empty-state-wide">
            <strong>没有匹配的资料。</strong>
            <p>换一个轨道、标签或访问方式；也可以直接回到九阶段路线。</p>
            <Link className="text-link" href="/roadmap">
              返回路线 →
            </Link>
          </div>
        ) : (
          resolvedItems.map(({ item, resolved }) => {
            const itemTrack = tracksById.get(item.track);
            return itemTrack ? (
              <ContentCard
                item={item}
                track={itemTrack}
                resolved={resolved}
                key={item.id}
              />
            ) : null;
          })
        )}
      </div>
    </main>
  );
}
