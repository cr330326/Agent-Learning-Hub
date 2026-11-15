import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CollectionError,
  fetchPublic,
  type PublicFetcher,
} from "./public-fetch";
import { canonicalUrl, type DiscoveryRepository } from "./repository";
import type { CollectionSource, SourceRecord } from "./schema";
import type { SourcePage } from "./adapters";

const treeSchema = z.object({
  sha: z.string().regex(/^[a-f0-9]{40}$/),
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      sha: z.string().regex(/^[a-f0-9]{40}$/),
    }),
  ),
});
const resultPath =
  /^(?:harness_engineering_youtube_(?:results|videos)\.json|memory\/daily\/(?:clawhub-skills|github-skill-repos|youtube-skill-videos|bilibili-skill-videos|youtube-harness-engineering|bilibili-harness-engineering|aihot-selected)-\d{4}-\d{2}-\d{2}\.json)$/;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(...values: unknown[]): string {
  const value = values.find(
    (value) =>
      (typeof value === "string" && value.trim()) || typeof value === "number",
  );
  return value === undefined ? "" : String(value);
}

function resultUrl(row: Record<string, unknown>, path: string): string {
  const value = [
    row.url,
    row.link,
    row.permalink,
    row.video_url,
    row.youtube_url,
    row.html_url,
    row.skill_link,
    row.clawhub_link,
    row["YouTube链接"],
    row["B站链接"],
    row["视频链接"],
    row["仓库链接"],
    row["GitHub链接"],
    row.href,
    row.skill_url,
    row.clawhub_url,
    row.bilibili_url,
    row["链接"],
    row["Skill链接"],
    row["ClawHub链接"],
    row.github_url,
    row.youtube_link,
  ].find(
    (value) =>
      (typeof value === "string" && /^https?:\/\//.test(value)) ||
      typeof object(value).link === "string",
  );
  if (value) return text(object(value).link, value);
  if (path.includes("clawhub") && /^\/[a-zA-Z0-9/_-]+$/.test(text(row.href)))
    return new URL(text(row.href), "https://clawhub.ai").toString();
  if (/bilibili/.test(path) && /^BV[a-zA-Z0-9]{10}$/.test(text(row.bvid)))
    return `https://www.bilibili.com/video/${row.bvid}`;
  if (
    /youtube/.test(path) &&
    /^[a-zA-Z0-9_-]{11}$/.test(text(row.video_id, row.videoId))
  )
    return `https://www.youtube.com/watch?v=${text(row.video_id, row.videoId)}`;
  if (/clawhub/.test(path) && /^[a-zA-Z0-9_-]+$/.test(text(row.slug)))
    return `https://clawhub.ai/skills/${row.slug}`;
  return "";
}

export function parseGitHubResults(
  value: unknown,
  path: string,
  commit: string,
): SourcePage {
  const data = object(value);
  const groups = [
    ...new Set(
      [
        data.skills,
        data.repos,
        data.videos,
        data.top10,
        data.top_10,
        data.ranked_top10,
        data.videos_sorted_by_views,
        data.top_skills,
        data.top_repos,
        data.repositories,
        data.articles,
        data.entries,
        data.data,
        data.items,
        data.results,
        ...Object.values(object(data.skills)),
        ...Object.values(object(data.result)),
        ...Object.values(object(data.data)),
        ...Object.values(data).filter(
          (group) =>
            Array.isArray(group) &&
            group.some((row) => resultUrl(object(row), path)),
        ),
      ].filter((group): group is unknown[] => Array.isArray(group)),
    ),
  ];
  const rows = Array.isArray(value)
    ? value
    : groups.length
      ? groups.flat()
      : resultUrl(data, path)
        ? [data]
        : [];
  if (!Array.isArray(value) && !groups.length && !rows.length)
    return { records: [], nextCursor: null, rejected: 1 };
  const records: SourceRecord[] = [];
  const seen = new Set<string>();
  let rejected = 0;
  for (const value of rows) {
    const row = { ...object(value), ...object(object(value).fields) };
    try {
      const url = canonicalUrl(resultUrl(row, path));
      const title = text(
        row.title,
        row.name,
        row.full_name,
        row.repo,
        row.displayName,
        row["视频标题"],
        row["Skill名称"],
        row["仓库名称"],
        row["标题"],
        row["文本"],
        row.video_title,
        row.skill_name,
        row.title_en,
        row.title_ja,
        row.repo_name,
        row.repository_name,
      );
      if (!title) {
        rejected++;
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      const metrics: Record<string, string | number> = {};
      const metricValues = {
        ...object(row.stats),
        ...row,
        views:
          row.views ??
          row.view ??
          row.play_count ??
          row.play ??
          row.view_count ??
          row["播放量"],
        duration:
          row.dur_str ??
          row.duration_display ??
          row.duration_label ??
          row.duration ??
          row["时长"],
        downloads:
          row.downloads ??
          row.downloads_total ??
          row.downloads_all ??
          row["下载数_int"] ??
          row["下载数"] ??
          object(row.stats).downloads,
        installs:
          row.installs ??
          row.installs_total ??
          row["安装数_int"] ??
          row["安装数"] ??
          object(row.stats).installs,
        stars:
          row.stars ??
          row["星标数"] ??
          row["Star数"] ??
          object(row.stats).stars,
        rank: row.rank ?? row["排名"],
      };
      for (const [key, label] of Object.entries({
        views: "播放量",
        duration: "时长",
        downloads: "下载数",
        installs: "安装数",
        stars: "星标数",
        rank: "排名",
      })) {
        const value = metricValues[key as keyof typeof metricValues];
        if (typeof value === "string" || typeof value === "number")
          metrics[label] = value;
      }
      records.push({
        recordId: createHash("sha256").update(url).digest("hex"),
        title,
        url,
        author: text(
          row.author,
          row.channel,
          row.owner,
          row.up,
          row.source,
          row["频道"],
          row["UP主"],
          row["作者"],
          row.up_master,
        ),
        summary: text(
          row.summary,
          row.description,
          row.desc,
          row["摘要"],
          row["描述"],
        ),
        publishedAt: text(
          row.published_at,
          row.publishedAt,
          row.publish_date,
          row.published,
          row["发布时间"],
          row.pub_str,
          row.pub_date,
          row.upload_date,
          typeof row.pubdate === "string" ? row.pubdate : undefined,
          typeof row.pubdate === "number" && row.pubdate > 0
            ? new Date(row.pubdate * 1000).toISOString()
            : undefined,
          row.updated_at,
          row.updated,
          row.created_at,
          row.updateTime,
          row.last_updated,
          row["更新时间"],
          row.publish_time,
          row.publishedTime,
          typeof row.pubdate_ts === "number" && row.pubdate_ts > 0
            ? new Date(row.pubdate_ts * 1000).toISOString()
            : undefined,
          typeof row.publish_timestamp === "number" && row.publish_timestamp > 0
            ? new Date(row.publish_timestamp * 1000).toISOString()
            : undefined,
        ),
        contentType: /youtube|bilibili/.test(path)
          ? "video"
          : /skills|skill-repos/.test(path)
            ? "tool"
            : "article",
        metrics,
        provenance: { path, commit },
        topics: path.includes("harness")
          ? ["Harness Engineering"]
          : path.includes("skill")
            ? ["工具与 Skills"]
            : ["AI 编程"],
        updatedAt: Date.parse(
          `${path.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "1970-01-01"}T00:00:00+08:00`,
        ),
      });
    } catch {
      rejected++;
    }
  }
  return { records, nextCursor: null, rejected };
}

export class GitHubResults {
  private files: z.infer<typeof treeSchema>["tree"] | undefined;
  private commit = "";
  private pendingFiles: {
    path: string;
    sha: string;
    recordIds: string[];
    rejected: number;
    errorCode: string | null;
  }[] = [];
  private readonly repository: string;
  constructor(
    private source: CollectionSource,
    private fetcher: PublicFetcher = fetchPublic,
    private environment: Readonly<
      Record<string, string | undefined>
    > = process.env,
  ) {
    const url = new URL(source.url);
    if (
      url.origin !== "https://github.com" ||
      !/^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      throw new CollectionError("github-repository-invalid");
    this.repository = url.pathname.replace(/^\/|\/$/g, "");
  }
  private async request(path: string) {
    const token = this.source.tokenEnv
      ? this.environment[this.source.tokenEnv]
      : undefined;
    if (!token) throw new CollectionError("github-read-token-missing");
    const response = await this.fetcher(
      `https://api.github.com/repos/${this.repository}/${path}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/vnd.github+json",
        },
        acceptedTypes: ["application/json"],
        maxBytes: 12_000_000,
        timeoutMs: 60_000,
      },
    );
    return JSON.parse(response.text);
  }
  async page(
    cursor: string | null,
    repo?: DiscoveryRepository,
    runId?: string,
  ): Promise<SourcePage> {
    const [savedCommit, offset = "0"] = cursor?.split(":") ?? [];
    if (savedCommit && !/^[a-f0-9]{40}$/.test(savedCommit))
      throw new CollectionError("github-cursor-invalid");
    let index = Number(offset);
    if (!Number.isSafeInteger(index) || index < 0)
      throw new CollectionError("github-cursor-invalid");
    if (!this.files) {
      this.commit =
        savedCommit ??
        z
          .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
          .parse(await this.request("commits/HEAD")).sha;
      const tree = treeSchema.parse(
        await this.request(`git/trees/${this.commit}?recursive=1`),
      );
      if (tree.truncated) throw new CollectionError("github-tree-truncated");
      this.files = tree.tree
        .filter((file) => file.type === "blob" && resultPath.test(file.path))
        .sort((a, b) => {
          const date = (path: string) =>
            path.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
          return (
            date(b.path).localeCompare(date(a.path)) ||
            a.path.localeCompare(b.path, "en")
          );
        });
      if (!this.files.length)
        throw new CollectionError("github-results-missing");
    }
    this.pendingFiles = [];
    const pending: { path: string; sha: string }[] = [];
    while (index < this.files.length && pending.length < 8) {
      const file = this.files[index++];
      const saved = repo?.database.handle
        .prepare(
          "SELECT sha,record_ids,parser_version FROM github_result_files WHERE source_id=? AND path=?",
        )
        .get(this.source.id, file.path) as
        { sha: string; record_ids: string; parser_version: number } | undefined;
      if (saved?.sha === file.sha && saved.parser_version === 6) {
        if (repo && runId)
          repo.database.handle
            .prepare(
              "UPDATE source_records SET last_seen_run=?,state='present' WHERE source_id=? AND record_id IN (SELECT value FROM json_each(?))",
            )
            .run(runId, this.source.id, saved.record_ids);
        continue;
      }
      pending.push(file);
    }
    const pages = await Promise.all(
      pending.map(async (file) => {
        const blob = z
          .object({ encoding: z.literal("base64"), content: z.string() })
          .parse(await this.request(`git/blobs/${file.sha}`));
        let value: unknown;
        try {
          value = JSON.parse(
            Buffer.from(blob.content, "base64").toString("utf8"),
          );
        } catch {
          return {
            file,
            page: { records: [], nextCursor: null, rejected: 1 } as SourcePage,
            errorCode: "invalid-result-json",
          };
        }
        const page = parseGitHubResults(value, file.path, this.commit);
        return {
          file,
          page,
          errorCode:
            page.rejected && !page.records.length
              ? "no-valid-result-links"
              : null,
        };
      }),
    );
    this.pendingFiles = pages.map(({ file, page, errorCode }) => ({
      ...file,
      recordIds: page.records.map((record) => record.recordId),
      rejected: page.rejected,
      errorCode,
    }));
    return {
      records: pages.flatMap(({ page }) => page.records),
      rejected: pages.reduce((sum, { page }) => sum + page.rejected, 0),
      nextCursor: index < this.files.length ? `${this.commit}:${index}` : null,
    };
  }

  savePage(repo: DiscoveryRepository) {
    repo.database.handle
      .transaction(() => {
        const save = repo.database.handle.prepare(
          `INSERT INTO github_result_files(source_id,path,sha,commit_sha,record_ids,parser_version,rejected,error_code) VALUES (?,?,?,?,?,6,?,?) ON CONFLICT(source_id,path) DO UPDATE SET sha=excluded.sha,commit_sha=excluded.commit_sha,record_ids=excluded.record_ids,parser_version=excluded.parser_version,rejected=excluded.rejected,error_code=excluded.error_code`,
        );
        for (const file of this.pendingFiles)
          save.run(
            this.source.id,
            file.path,
            file.sha,
            this.commit,
            JSON.stringify(file.recordIds),
            file.rejected,
            file.errorCode,
          );
      })
      .immediate();
  }
}
