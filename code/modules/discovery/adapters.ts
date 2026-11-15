import { load } from "cheerio";
import { randomUUID } from "node:crypto";
import {
  CollectionError,
  fetchPublic,
  type PublicFetcher,
} from "./public-fetch";
import { canonicalUrl, DiscoveryRepository } from "./repository";
import type { CollectionSource, SourceRecord } from "./schema";
import type { Job } from "./jobs";
import { GitHubResults } from "./github-results";

export type SourcePage = {
  records: SourceRecord[];
  nextCursor: string | null;
  rejected: number;
};
export type FeishuField = {
  field_id: string;
  field_name: string;
  type: number;
};
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}
function atPath(value: unknown, path: string): unknown {
  let result = value;
  for (const segment of path.split(".").filter(Boolean)) {
    if (!Object.hasOwn(object(result), segment)) return undefined;
    result = object(result)[segment];
  }
  return result;
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  const row = object(value);
  return typeof row.text === "string" ? row.text : "";
}
function link(value: unknown): string {
  const row = object(value);
  if (typeof row.link === "string") return row.link;
  if (typeof row.url === "string") return row.url;
  if (Array.isArray(value)) return value.map(link).find(Boolean) ?? "";
  return text(value);
}
function plain(value: string): string {
  const $ = load(value);
  $("script,style,iframe,noscript,form").remove();
  return $.text().replace(/\s+/g, " ").trim().slice(0, 10000);
}
function validRecords(records: SourceRecord[]): SourcePage {
  const accepted: SourceRecord[] = [];
  for (const record of records) {
    try {
      if (record.title.trim() && record.recordId)
        accepted.push({ ...record, url: canonicalUrl(record.url) });
    } catch {
      /* Invalid upstream rows are counted and shown with sync progress. */
    }
  }
  return {
    records: accepted,
    nextCursor: null,
    rejected: records.length - accepted.length,
  };
}
function jsonResponse(text: string): JsonObject {
  try {
    return object(JSON.parse(text));
  } catch {
    throw new CollectionError("invalid-json");
  }
}
function checkFeishu(response: JsonObject): JsonObject {
  if (response.code !== 0)
    throw new CollectionError(
      `feishu-${Number(response.code) || "invalid-response"}`,
    );
  return object(response.data);
}

export class SourceAdapter {
  private token: string | null = null;
  private github: GitHubResults | undefined;
  constructor(
    private source: CollectionSource,
    private fetcher: PublicFetcher = fetchPublic,
    private environment: Readonly<
      Record<string, string | undefined>
    > = process.env,
  ) {}

  private async feishuToken() {
    if (this.token) return this.token;
    const source = this.source;
    const supplied = source.tokenEnv
      ? this.environment[source.tokenEnv]
      : undefined;
    if (supplied) {
      this.token = supplied;
      return supplied;
    }
    const appId = source.appIdEnv
      ? this.environment[source.appIdEnv]
      : undefined;
    const appSecret = source.appSecretEnv
      ? this.environment[source.appSecretEnv]
      : undefined;
    if (!appId || !appSecret)
      throw new CollectionError("feishu-credentials-missing");
    const response = await this.fetcher(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        acceptedTypes: ["application/json"],
      },
    );
    const result = jsonResponse(response.text);
    if (result.code !== 0 || typeof result.tenant_access_token !== "string")
      throw new CollectionError("feishu-auth-failed");
    this.token = result.tenant_access_token;
    return this.token;
  }
  private feishuBase() {
    return `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.source.appToken}/tables/${this.source.tableId}`;
  }
  async fields(): Promise<FeishuField[]> {
    const fields: FeishuField[] = [];
    const seen = new Set<string>();
    let cursor = "";
    do {
      const url = new URL(`${this.feishuBase()}/fields`);
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("page_token", cursor);
      const response = await this.fetcher(url.toString(), {
        headers: { authorization: `Bearer ${await this.feishuToken()}` },
        acceptedTypes: ["application/json"],
      });
      const data = checkFeishu(jsonResponse(response.text));
      if (!Array.isArray(data.items))
        throw new CollectionError("feishu-fields-invalid");
      for (const item of data.items) {
        const field = object(item);
        if (
          typeof field.field_id !== "string" ||
          typeof field.field_name !== "string"
        )
          throw new CollectionError("feishu-fields-invalid");
        fields.push({
          field_id: field.field_id,
          field_name: field.field_name,
          type: Number(field.type),
        });
      }
      cursor = data.has_more ? String(data.page_token ?? "") : "";
      if (data.has_more && (!cursor || seen.has(cursor)))
        throw new CollectionError("pagination-loop");
      if (cursor) seen.add(cursor);
    } while (cursor);
    return fields;
  }
  async page(
    cursor: string | null,
    fields?: FeishuField[],
  ): Promise<SourcePage> {
    switch (this.source.kind) {
      case "github":
        this.github ??= new GitHubResults(
          this.source,
          this.fetcher,
          this.environment,
        );
        return this.github.page(cursor);
      case "feishu":
        return this.feishuPage(cursor, fields ?? (await this.fields()));
      case "rss":
        return this.rssPage();
      case "json":
        return this.jsonPage(cursor);
      case "html":
        return this.htmlPage(cursor);
    }
  }
  private async feishuPage(
    cursor: string | null,
    fields: FeishuField[],
  ): Promise<SourcePage> {
    const names: Record<string, string> = {};
    for (const [key, fieldId] of Object.entries(this.source.mapping)) {
      const field = fields.find((field) => field.field_id === fieldId);
      if (!field) throw new CollectionError("field-mapping-changed");
      names[key] = field.field_name;
    }
    if (!names.title || !names.url)
      throw new CollectionError("field-mapping-incomplete");
    const url = new URL(`${this.feishuBase()}/records/search`);
    url.searchParams.set("page_size", "500");
    if (cursor) url.searchParams.set("page_token", cursor);
    const response = await this.fetcher(url.toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.feishuToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        view_id: this.source.viewId,
        field_names: [...new Set(Object.values(names))],
        automatic_fields: true,
      }),
      acceptedTypes: ["application/json"],
    });
    const data = checkFeishu(jsonResponse(response.text));
    if (!Array.isArray(data.items))
      throw new CollectionError("feishu-records-invalid");
    const records = data.items.map((value: unknown): SourceRecord => {
      const row = object(value);
      const values = object(row.fields);
      const get = (key: string) => values[names[key]];
      const published = get("publishedAt") || get("publishedAtFallback");
      const metrics: Record<string, string | number> = {};
      for (const key of Object.keys(names).filter((key) =>
        key.startsWith("metric."),
      )) {
        metrics[key.slice(7)] = text(get(key));
      }
      const contentType = text(get("contentType"));
      return {
        recordId: text(row.record_id),
        title: text(get("title")) || text(get("titleFallback")),
        url: link(get("url")) || link(get("urlFallback")),
        author: text(get("author")) || undefined,
        summary: plain(text(get("summary"))),
        publishedAt:
          typeof published === "number"
            ? new Date(published).toISOString()
            : text(published),
        updatedAt:
          typeof row.last_modified_time === "number"
            ? row.last_modified_time
            : undefined,
        contentType: ["video", "tool", "update"].includes(contentType)
          ? (contentType as SourceRecord["contentType"])
          : this.source.contentType,
        metrics: Object.keys(metrics).length ? metrics : undefined,
        sourceStatus:
          typeof get("sourceStatus") === "boolean"
            ? String(get("sourceStatus"))
            : text(get("sourceStatus")),
      };
    });
    const result = validRecords(records);
    result.nextCursor = data.has_more ? text(data.page_token) : null;
    if (data.has_more && !result.nextCursor)
      throw new CollectionError("pagination-cursor-missing");
    return result;
  }
  private async rssPage(): Promise<SourcePage> {
    const response = await this.fetcher(this.source.url, {
      acceptedTypes: [
        "application/rss+xml",
        "application/atom+xml",
        "application/xml",
        "text/xml",
        "text/plain",
      ],
    });
    if (/<!DOCTYPE|<!ENTITY/i.test(response.text))
      throw new CollectionError("xml-entity-refused");
    const $ = load(response.text, { xml: true });
    const records: SourceRecord[] = [];
    $("item,entry").each((_, node) => {
      const item = $(node);
      const url =
        item.find('link[rel="alternate"]').attr("href") ??
        item.find("link").attr("href") ??
        item.find("link").first().text();
      records.push({
        recordId: item.find("guid,id").first().text() || url,
        contentType: this.source.contentType,
        title: plain(item.find("title").first().text()),
        url: new URL(url, this.source.url).toString(),
        author: item.find("author > name,author,dc\\:creator").first().text(),
        summary: plain(
          item
            .find("description,summary,content\\:encoded,content")
            .first()
            .text(),
        ),
        publishedAt: item.find("pubDate,published,updated").first().text(),
      });
    });
    return validRecords(records);
  }
  private checkedPageUrl(cursor: string | null) {
    const url = new URL(cursor ?? this.source.url, this.source.url);
    if (url.origin !== new URL(this.source.url).origin)
      throw new CollectionError("pagination-origin-changed");
    return url.toString();
  }
  private async jsonPage(cursor: string | null): Promise<SourcePage> {
    const response = await this.fetcher(this.checkedPageUrl(cursor), {
      acceptedTypes: ["application/json"],
    });
    const data: unknown = JSON.parse(response.text);
    const rows = this.source.listPath
      ? atPath(data, this.source.listPath)
      : data;
    if (!Array.isArray(rows)) throw new CollectionError("json-list-missing");
    const mapping = this.source.mapping;
    const records = rows.map((row: unknown): SourceRecord => {
      const get = (key: string) => atPath(row, mapping[key] ?? key);
      const url = link(get("url"));
      const type = text(get("contentType"));
      return {
        recordId: text(get("id")) || url,
        title: text(get("title")),
        url: new URL(url, response.url).toString(),
        author: text(get("author")),
        summary: plain(text(get("summary"))),
        publishedAt: text(get("publishedAt")),
        contentType: ["video", "tool", "update"].includes(type)
          ? (type as SourceRecord["contentType"])
          : this.source.contentType,
      };
    });
    const result = validRecords(records);
    const next = atPath(data, mapping.next ?? "next");
    result.nextCursor =
      typeof next === "string" && next
        ? this.checkedPageUrl(new URL(next, response.url).toString())
        : null;
    return result;
  }
  private async htmlPage(cursor: string | null): Promise<SourcePage> {
    const response = await this.fetcher(this.checkedPageUrl(cursor), {
      acceptedTypes: ["text/html", "application/xhtml+xml"],
    });
    const $ = load(response.text);
    $("script,style,iframe,form,noscript").remove();
    const records: SourceRecord[] = [];
    $(this.source.listPath || "article").each((_, node) => {
      const item = $(node);
      const mapping = this.source.mapping;
      const anchor = item.is("a")
        ? item
        : item.find(mapping.url || "a[href]").first();
      const href = anchor.attr("href");
      if (!href) return;
      const url = new URL(href, response.url);
      if (
        this.source.linkPattern &&
        !url.pathname.startsWith(this.source.linkPattern)
      )
        return;
      const title = mapping.title
        ? item.find(mapping.title).text()
        : anchor.text();
      const time = item.find(mapping.publishedAt || "time").first();
      records.push({
        recordId: url.toString(),
        contentType: this.source.contentType,
        url: url.toString(),
        title: plain(title),
        summary: mapping.summary
          ? plain(item.find(mapping.summary).text())
          : undefined,
        author: mapping.author
          ? item.find(mapping.author).text().trim()
          : undefined,
        publishedAt: time.attr("datetime") ?? time.text(),
      });
    });
    const result = validRecords(records);
    const next = $(this.source.mapping.next || 'a[rel="next"]')
      .first()
      .attr("href");
    result.nextCursor = next
      ? this.checkedPageUrl(new URL(next, response.url).toString())
      : null;
    return result;
  }
}

export async function synchronizeSource(
  repo: DiscoveryRepository,
  job: Job,
  fetcher: PublicFetcher = fetchPublic,
) {
  const payload = JSON.parse(job.payload) as { sourceId: string };
  const source = repo.source(payload.sourceId);
  if (!source?.enabled) {
    repo.jobs.complete(job, { skipped: "source-disabled" });
    return;
  }
  const checkpoint = JSON.parse(job.checkpoint) as {
    cursor?: string | null;
    runId?: string;
    pages?: number;
    rejected?: number;
    seen?: string[];
    finished?: boolean;
  };
  if (checkpoint.finished) {
    repo.database.handle
      .transaction(() => {
        repo.finishSync(source, checkpoint.runId!, true);
        repo.jobs.complete(job, checkpoint);
      })
      .immediate();
    return;
  }
  const adapter = new SourceAdapter(source, fetcher);
  const github =
    source.kind === "github" ? new GitHubResults(source, fetcher) : undefined;
  const fields = source.kind === "feishu" ? await adapter.fields() : undefined;
  const runId = checkpoint.runId ?? randomUUID();
  const historical =
    repo.sources().find((status) => status.source.id === source.id)
      ?.last_success_at === null;
  let cursor = checkpoint.cursor ?? null;
  let pages = checkpoint.pages ?? 0;
  let rejected = checkpoint.rejected ?? 0;
  const seen = new Set(checkpoint.seen ?? []);
  do {
    const page = github
      ? await github.page(cursor, repo, runId)
      : await adapter.page(cursor, fields);
    if (
      page.nextCursor &&
      (page.nextCursor === cursor || seen.has(page.nextCursor))
    )
      throw new CollectionError("pagination-loop");
    if (page.nextCursor) seen.add(page.nextCursor);
    cursor = page.nextCursor;
    pages++;
    rejected += page.rejected;
    repo.ingestPage(source, page.records, runId, {
      historical,
      job,
      checkpoint: {
        cursor,
        runId,
        pages,
        rejected,
        seen: [...seen],
        finished: !cursor,
      },
    });
    github?.savePage(repo);
    repo.jobs.heartbeat(job);
    if (github && cursor && pages % 10 === 0) {
      repo.jobs.defer(job, Date.now() + 1000, "historical-import");
      return;
    }
  } while (cursor);
  repo.database.handle
    .transaction(() => {
      repo.finishSync(source, runId, true);
      repo.jobs.complete(job, { pages, rejected });
    })
    .immediate();
}
