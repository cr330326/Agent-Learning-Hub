import { createHash, randomUUID } from "node:crypto";
import type { DiscoveryDatabase } from "./database";
import type { SearchDocument } from "../search/search-index";
import { DiscoveryJobs, type Job } from "./jobs";
import { budgetDay } from "./budget";
import {
  discoveryTopics,
  sourceSchema,
  summarySchema,
  type CollectionSource,
  type SourceRecord,
  type SummaryOutput,
} from "./schema";

export type DiscoveryInput = {
  title: string;
  url: string;
  author: string;
  sourceSummary: string;
  publishedAt: string | null;
  timeVerified: boolean;
  contentType: "article" | "video" | "tool" | "update";
  topics: string[];
  historical: boolean;
};
export type ItemVersion = {
  id: string;
  item_id: string;
  content_hash: string;
  input: string;
  output: string | null;
  processing_state: string;
  processing_version: string | null;
  created_at: number;
};
export type DiscoveryItem = {
  id: string;
  canonical_url: string;
  published_version: string | null;
  pending_version: string | null;
  publication_state: "draft" | "published" | "withdrawn";
  protected_fields: string;
  published_at: number | null;
  updated_at: number;
};
export type SourceStatus = {
  source: CollectionSource;
  last_success_at: number | null;
  upstream_updated_at: number | null;
  next_sync_at: number;
  last_error: string | null;
  progress: string;
};
export type PublicItem = {
  id: string;
  versionId: string;
  url: string;
  title: string;
  author: string;
  summary: string;
  reason: string;
  topics: string[];
  publishedAt: string | null;
  timeVerified: boolean;
  contentType: string;
  processingState: string;
  withdrawn: boolean;
  mergedInto: string | null;
  relatedOriginals: { title: string; url: string }[];
  score: number;
  sources: { id: string; name: string }[];
  metrics: {
    observedAt: number;
    sourceId: string;
    values: Record<string, string | number>;
  }[];
};

export type EditionEntry = {
  id: string;
  versionId: string;
  snapshot?: Pick<
    PublicItem,
    "title" | "summary" | "reason" | "topics" | "score" | "processingState"
  >;
};

export function canonicalUrl(value: string): string {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("原文地址无效。");
  // Preserve content selectors and fragments. Only known tracking keys are removed.
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      ["fbclid", "gclid"].includes(key.toLowerCase())
    )
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (
    ["www.youtube.com", "m.youtube.com", "youtube.com", "youtu.be"].includes(
      url.hostname,
    )
  ) {
    const id =
      url.hostname === "youtu.be"
        ? url.pathname.slice(1)
        : url.searchParams.get("v");
    if (id && /^[\w-]{11}$/.test(id))
      return `https://www.youtube.com/watch?v=${id}`;
  }
  return url.toString();
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function engineeringScore(scores: SummaryOutput["scores"]) {
  return (
    scores.actionability * 3 +
    scores.verifiability * 3 +
    scores.relevance * 2 +
    scores.impact
  );
}

function isDailyCandidate(output: SummaryOutput) {
  const scores = output.scores;
  if (scores.relevance < 3 || scores.verifiability < 2) return false;
  const score = engineeringScore(scores);
  return (
    (scores.actionability >= 3 && score >= 27) ||
    (scores.impact >= 4 && scores.verifiability >= 3 && score >= 24)
  );
}

export class DiscoveryRepository {
  readonly jobs: DiscoveryJobs;
  constructor(
    readonly database: DiscoveryDatabase,
    private now = () => Date.now(),
  ) {
    this.jobs = new DiscoveryJobs(database, now);
  }
  saveSource(value: unknown, actor: string): CollectionSource {
    const source = sourceSchema.parse(value);
    canonicalUrl(source.url);
    this.database.handle
      .transaction(() => {
        this.database.handle
          .prepare(
            `INSERT INTO sources(id,config,enabled,next_sync_at) VALUES (?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET config=excluded.config,enabled=excluded.enabled,next_sync_at=MIN(sources.next_sync_at,excluded.next_sync_at)`,
          )
          .run(
            source.id,
            JSON.stringify(source),
            Number(source.enabled),
            this.now(),
          );
        this.audit(actor, "source-save", source.id, {
          enabled: source.enabled,
          publicationMode: source.publicationMode,
        });
      })
      .immediate();
    return source;
  }
  source(id: string): CollectionSource | null {
    const row = this.database.handle
      .prepare("SELECT config FROM sources WHERE id=?")
      .get(id) as { config: string } | undefined;
    return row ? sourceSchema.parse(JSON.parse(row.config)) : null;
  }
  sources(): SourceStatus[] {
    return (
      this.database.handle
        .prepare("SELECT * FROM sources ORDER BY id")
        .all() as (Omit<SourceStatus, "source"> & { config: string })[]
    ).map(({ config, ...row }) => ({
      ...row,
      source: sourceSchema.parse(JSON.parse(config)),
    }));
  }
  audit(actor: string, action: string, target: string, detail: unknown) {
    this.database.handle
      .prepare("INSERT INTO admin_actions VALUES (?,?,?,?,?,?)")
      .run(
        randomUUID(),
        actor,
        action,
        target,
        JSON.stringify(detail),
        this.now(),
      );
  }
  ingestPage(
    source: CollectionSource,
    records: SourceRecord[],
    runId: string,
    options: { historical?: boolean; job?: Job; checkpoint?: unknown } = {},
  ) {
    return this.database.handle
      .transaction(() => {
        let added = 0;
        let updated = 0;
        for (const record of records) {
          if (!record.recordId || !record.title.trim()) continue;
          const url = canonicalUrl(record.url);
          const previousRecord = this.database.handle
            .prepare(
              "SELECT item_id,upstream_updated_at FROM source_records WHERE source_id=? AND record_id=?",
            )
            .get(source.id, record.recordId) as
            { item_id: string; upstream_updated_at: number | null } | undefined;
          if (
            source.kind === "github" &&
            previousRecord?.upstream_updated_at &&
            record.updatedAt &&
            previousRecord.upstream_updated_at > record.updatedAt
          ) {
            this.database.handle
              .prepare(
                "UPDATE source_records SET last_seen_run=?,state='present' WHERE source_id=? AND record_id=?",
              )
              .run(runId, source.id, record.recordId);
            continue;
          }
          const matchingItem = this.database.handle
            .prepare(
              `SELECT id FROM items WHERE canonical_url=? UNION ALL SELECT item_id AS id FROM item_urls WHERE url=? LIMIT 1`,
            )
            .get(url, url) as { id: string } | undefined;
          const id =
            previousRecord?.item_id ??
            matchingItem?.id ??
            `news-${digest(url).slice(0, 32)}`;
          const parsedTime = Date.parse(record.publishedAt ?? "");
          const verified =
            Number.isFinite(parsedTime) &&
            parsedTime > 0 &&
            parsedTime <= this.now() + 86_400_000;
          const input: DiscoveryInput = {
            title: record.title.slice(0, 300),
            url,
            author: (record.author ?? "作者待补").slice(0, 300),
            sourceSummary: (record.summary ?? "").slice(0, 10000),
            publishedAt: verified ? new Date(parsedTime).toISOString() : null,
            timeVerified: verified,
            contentType: record.contentType ?? "article",
            topics: record.topics ?? source.topics,
            historical: options.historical ?? false,
          };
          // Import priority and metrics do not change the underlying content version.
          const hash = digest(
            JSON.stringify({ ...input, historical: undefined }),
          );
          const versionId = `version-${digest(id + hash).slice(0, 32)}`;
          const time = this.now();
          const existing = this.item(id);
          this.database.handle
            .prepare(
              `INSERT INTO items(id,canonical_url,first_seen_at,updated_at)
          VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING`,
            )
            .run(id, existing?.canonical_url ?? url, time, time);
          this.database.handle
            .prepare(
              "INSERT INTO item_urls VALUES (?,?) ON CONFLICT(url) DO NOTHING",
            )
            .run(url, id);
          const inserted = this.database.handle
            .prepare(
              `INSERT INTO item_versions(id,item_id,content_hash,input,created_at)
          VALUES (?,?,?,?,?) ON CONFLICT(item_id,content_hash) DO NOTHING`,
            )
            .run(versionId, id, hash, JSON.stringify(input), time);
          if (!existing) added++;
          if (inserted.changes) {
            if (existing) updated++;
            this.database.handle
              .prepare(
                "UPDATE items SET pending_version=?,updated_at=? WHERE id=?",
              )
              .run(versionId, time, id);
            if (!source.aggregation && processRecently(input, time))
              this.jobs.enqueue({
                key: `process:${versionId}`,
                kind: "process",
                payload: { versionId, sourceId: source.id },
                priority: options.historical ? 10 : 100,
              });
          }
          this.database.handle
            .prepare(
              `INSERT INTO source_records
          (source_id,record_id,item_id,version_id,last_seen_run,source_status,upstream_updated_at)
          VALUES (?,?,?,?,?,?,?) ON CONFLICT(source_id,record_id) DO UPDATE SET
          item_id=excluded.item_id,version_id=excluded.version_id,last_seen_run=excluded.last_seen_run,
          state='present',source_status=excluded.source_status,upstream_updated_at=excluded.upstream_updated_at`,
            )
            .run(
              source.id,
              record.recordId,
              id,
              versionId,
              runId,
              record.provenance
                ? JSON.stringify(record.provenance)
                : (record.sourceStatus ?? null),
              record.updatedAt ?? null,
            );
          if (record.metrics) {
            const metrics = JSON.stringify(record.metrics);
            const latest = this.database.handle
              .prepare(
                "SELECT metrics FROM metric_observations WHERE item_id=? AND source_id=? ORDER BY observed_at DESC LIMIT 1",
              )
              .get(id, source.id) as { metrics: string } | undefined;
            if (latest?.metrics !== metrics)
              this.database.handle
                .prepare(
                  `INSERT INTO metric_observations VALUES (?,?,?,?)
          ON CONFLICT(item_id,source_id,observed_at) DO UPDATE SET metrics=excluded.metrics`,
                )
                .run(id, source.id, time, metrics);
          }
          if (record.updatedAt)
            this.database.handle
              .prepare(
                "UPDATE sources SET upstream_updated_at=MAX(COALESCE(upstream_updated_at,0),?) WHERE id=?",
              )
              .run(record.updatedAt, source.id);
          if (
            !source.aggregation &&
            !processRecently(input, time) &&
            source.publicationMode === "auto" &&
            inserted.changes
          )
            this.publishVersion(versionId, "source-summary");
          if (
            source.aggregation &&
            source.publicationMode === "auto" &&
            existing?.publication_state !== "withdrawn"
          ) {
            const candidates = this.database.handle
              .prepare(
                `SELECT r.version_id,v.input FROM source_records r JOIN sources s ON s.id=r.source_id JOIN item_versions v ON v.id=r.version_id
               WHERE r.item_id=? AND r.state='present' AND json_extract(s.config,'$.aggregation')=1
               AND json_extract(s.config,'$.publicationMode')='auto'
               ORDER BY COALESCE(json_extract(s.config,'$.priority'),0) DESC,
               COALESCE(r.upstream_updated_at,0) DESC, r.source_id, r.record_id`,
              )
              .all(id) as { version_id: string; input: string }[];
            const preferred = candidates[0];
            if (preferred) {
              const combined = JSON.parse(preferred.input) as DiscoveryInput;
              for (const candidate of candidates.slice(1)) {
                const fallback = JSON.parse(candidate.input) as DiscoveryInput;
                combined.sourceSummary ||= fallback.sourceSummary;
                if (!combined.author || combined.author === "作者待补")
                  combined.author = fallback.author;
                if (!combined.publishedAt && fallback.publishedAt) {
                  combined.publishedAt = fallback.publishedAt;
                  combined.timeVerified = fallback.timeVerified;
                }
              }
              const combinedInput = JSON.stringify(combined);
              if (combinedInput !== preferred.input) {
                const hash = digest(
                  JSON.stringify({ ...combined, historical: undefined }),
                );
                preferred.version_id = `version-${digest(id + hash).slice(0, 32)}`;
                this.database.handle
                  .prepare(
                    "INSERT INTO item_versions(id,item_id,content_hash,input,created_at) VALUES (?,?,?,?,?) ON CONFLICT(item_id,content_hash) DO NOTHING",
                  )
                  .run(preferred.version_id, id, hash, combinedInput, time);
              }
            }
            if (
              preferred &&
              this.item(id)?.published_version !== preferred.version_id
            ) {
              this.database.handle
                .prepare(
                  "UPDATE item_versions SET processing_state=CASE WHEN output IS NULL THEN 'source-only' ELSE processing_state END WHERE id=?",
                )
                .run(preferred.version_id);
              this.publishVersion(preferred.version_id, "source-aggregation");
            }
            this.database.handle
              .prepare(
                "UPDATE items SET pending_version=NULL WHERE id=? AND pending_version=?",
              )
              .run(id, versionId);
          }
        }
        if (options.job)
          this.jobs.saveCheckpoint(options.job, options.checkpoint ?? {});
        this.database.handle
          .prepare("UPDATE sources SET progress=? WHERE id=?")
          .run(
            JSON.stringify({
              runId,
              added,
              updated,
              records: records.length,
              checkpoint: options.checkpoint,
            }),
            source.id,
          );
        return { added, updated };
      })
      .immediate();
  }
  finishSync(source: CollectionSource, runId: string, fullScan: boolean) {
    this.database.handle
      .transaction(() => {
        if (fullScan)
          this.database.handle
            .prepare(
              "UPDATE source_records SET state='unverified-missing' WHERE source_id=? AND last_seen_run<>? AND state='present'",
            )
            .run(source.id, runId);
        this.database.handle
          .prepare(
            "UPDATE sources SET last_success_at=?,next_sync_at=?,last_error=NULL WHERE id=?",
          )
          .run(
            this.now(),
            this.now() + source.intervalMinutes * 60_000,
            source.id,
          );
      })
      .immediate();
  }
  syncFailed(sourceId: string, code: string) {
    this.database.handle
      .prepare("UPDATE sources SET last_error=? WHERE id=?")
      .run(code, sourceId);
  }
  confirmDeleted(sourceId: string, recordId: string, actor: string) {
    this.database.handle
      .transaction(() => {
        this.database.handle
          .prepare(
            "UPDATE source_records SET state='confirmed-deleted' WHERE source_id=? AND record_id=?",
          )
          .run(sourceId, recordId);
        this.audit(actor, "confirm-source-deletion", sourceId, { recordId });
      })
      .immediate();
  }
  item(id: string): DiscoveryItem | null {
    return (
      (this.database.handle
        .prepare("SELECT * FROM items WHERE id=?")
        .get(id) as DiscoveryItem | undefined) ?? null
    );
  }
  version(id: string): ItemVersion | null {
    return (
      (this.database.handle
        .prepare("SELECT * FROM item_versions WHERE id=?")
        .get(id) as ItemVersion | undefined) ?? null
    );
  }
  saveOutput(
    versionId: string,
    state: string,
    output: SummaryOutput | null,
    processingVersion: string,
  ) {
    const parsed = output ? summarySchema.parse(output) : null;
    this.database.handle
      .prepare(
        "UPDATE item_versions SET processing_state=?,output=?,processing_version=? WHERE id=?",
      )
      .run(
        state,
        parsed ? JSON.stringify(parsed) : null,
        processingVersion,
        versionId,
      );
  }
  publishVersion(versionId: string, actor: string) {
    this.database.handle
      .transaction(() => {
        const version = this.version(versionId);
        if (!version) throw new Error("资讯版本不存在。");
        const input = JSON.parse(version.input) as DiscoveryInput;
        const item = this.item(version.item_id)!;
        const previous = item.published_version
          ? this.version(item.published_version)
          : null;
        // A model/prompt revision alone must not give an unchanged source a new
        // publication window and make it eligible for another daily edition.
        const sameContent = previous && previous.input === version.input;
        const publishedAt = sameContent
          ? item.published_at
          : input.historical
            ? Date.parse(input.publishedAt ?? "")
            : this.now();
        this.database.handle
          .prepare(
            `UPDATE items SET published_version=?,pending_version=CASE WHEN pending_version=? THEN NULL ELSE pending_version END,
        publication_state='published',published_at=?,updated_at=? WHERE id=?`,
          )
          .run(
            versionId,
            versionId,
            publishedAt !== null && Number.isFinite(publishedAt)
              ? publishedAt
              : null,
            this.now(),
            item.id,
          );
        this.audit(actor, "publish", item.id, { versionId });
      })
      .immediate();
  }
  setPublication(id: string, state: "published" | "withdrawn", actor: string) {
    const item = this.item(id);
    if (!item?.published_version) throw new Error("资讯尚无可发布版本。");
    this.database.handle
      .transaction(() => {
        this.database.handle
          .prepare(
            "UPDATE items SET publication_state=?,updated_at=? WHERE id=?",
          )
          .run(state, this.now(), id);
        this.audit(actor, state, id, {});
      })
      .immediate();
  }
  correct(
    id: string,
    fields: {
      title?: string;
      summary?: string;
      reason?: string;
      topics?: string[];
    },
    actor: string,
  ) {
    const item = this.item(id);
    if (!item) throw new Error("资讯不存在。");
    this.database.handle
      .transaction(() => {
        this.database.handle
          .prepare(
            "UPDATE items SET protected_fields=?,updated_at=? WHERE id=?",
          )
          .run(
            JSON.stringify({ ...JSON.parse(item.protected_fields), ...fields }),
            this.now(),
            id,
          );
        this.audit(actor, "correct", id, fields);
      })
      .immediate();
  }
  publicItem(id: string, versionId?: string): PublicItem | null {
    const item = this.item(id);
    if (!item || item.publication_state === "draft" || !item.published_version)
      return null;
    const version = this.version(versionId ?? item.published_version);
    if (!version || version.item_id !== id) return null;
    const input = JSON.parse(version.input) as DiscoveryInput;
    const output = version.output
      ? summarySchema.parse(JSON.parse(version.output))
      : null;
    // New editions freeze the effective fields, including editorial corrections.
    // Legacy entries have no snapshot and keep their original model version.
    const snapshot = versionId ? this.frozenSnapshot(id, versionId) : undefined;
    const corrections =
      snapshot ?? (versionId ? {} : JSON.parse(item.protected_fields));
    const sources = (
      this.database.handle
        .prepare(
          `SELECT DISTINCT s.id,s.config FROM sources s JOIN source_records r ON r.source_id=s.id WHERE r.item_id=?`,
        )
        .all(id) as { id: string; config: string }[]
    ).map(({ id, config }) => ({
      id,
      name: (JSON.parse(config) as CollectionSource).name,
    }));
    const metrics = (
      this.database.handle
        .prepare(
          `SELECT source_id,observed_at,metrics FROM metric_observations WHERE item_id=? ORDER BY observed_at DESC LIMIT 10`,
        )
        .all(id) as {
        source_id: string;
        observed_at: number;
        metrics: string;
      }[]
    ).map((row) => ({
      sourceId: row.source_id,
      observedAt: row.observed_at,
      values: JSON.parse(row.metrics),
    }));
    const merge = this.database.handle
      .prepare("SELECT target_id FROM item_merges WHERE source_id=?")
      .get(id) as { target_id: string } | undefined;
    const related = this.database.handle
      .prepare(
        `SELECT v.input FROM item_merges m JOIN items i ON i.id=m.source_id JOIN item_versions v ON v.id=i.published_version WHERE m.target_id=?`,
      )
      .all(id) as { input: string }[];
    const withdrawn = item.publication_state === "withdrawn";
    return {
      id,
      versionId: version.id,
      url: input.url,
      title: withdrawn
        ? "该资讯已撤下"
        : (corrections.title ?? output?.title ?? input.title),
      author: withdrawn ? "" : input.author,
      summary: withdrawn
        ? ""
        : (corrections.summary ?? output?.summary ?? input.sourceSummary),
      reason: withdrawn ? "" : (corrections.reason ?? output?.reason ?? ""),
      topics: withdrawn
        ? []
        : (corrections.topics ?? output?.topics ?? input.topics),
      publishedAt: input.publishedAt,
      timeVerified: input.timeVerified,
      contentType: input.contentType,
      processingState: snapshot?.processingState ?? version.processing_state,
      withdrawn,
      mergedInto: merge?.target_id ?? null,
      relatedOriginals: withdrawn
        ? []
        : related.map((row) => {
            const input = JSON.parse(row.input) as DiscoveryInput;
            return { title: input.title, url: input.url };
          }),
      score: snapshot?.score ?? (output ? engineeringScore(output.scores) : 0),
      sources: withdrawn ? [] : sources,
      metrics: withdrawn ? [] : metrics,
    };
  }
  private frozenSnapshot(
    itemId: string,
    versionId: string,
  ): EditionEntry["snapshot"] {
    const row = this.database.handle
      .prepare(
        `
      SELECT json_extract(entry.value,'$.snapshot') AS snapshot
      FROM editions, json_each(editions.entries) entry
      WHERE json_extract(entry.value,'$.id')=? AND json_extract(entry.value,'$.versionId')=?
      ORDER BY editions.cutoff, editions.day LIMIT 1
    `,
      )
      .get(itemId, versionId) as { snapshot: string | null } | undefined;
    return row?.snapshot ? JSON.parse(row.snapshot) : undefined;
  }
  listPublic(
    filters: {
      topic?: string;
      type?: string;
      source?: string;
      day?: string;
      query?: string;
      page?: number;
    } = {},
  ) {
    const clauses = ["i.publication_state='published'"];
    const params: (string | number)[] = [];
    if (filters.source && this.source(filters.source)) {
      clauses.push(
        "EXISTS(SELECT 1 FROM source_records r WHERE r.item_id=i.id AND r.source_id=?)",
      );
      params.push(filters.source);
    }
    if (
      filters.type &&
      ["article", "video", "tool", "update"].includes(filters.type)
    ) {
      clauses.push("json_extract(v.input,'$.contentType')=?");
      params.push(filters.type);
    }
    if (
      filters.topic &&
      discoveryTopics.includes(
        filters.topic as (typeof discoveryTopics)[number],
      )
    ) {
      clauses.push(
        "EXISTS(SELECT 1 FROM json_each(COALESCE(json_extract(i.protected_fields,'$.topics'),json_extract(v.output,'$.topics'),json_extract(v.input,'$.topics'))) WHERE value=?)",
      );
      params.push(filters.topic);
    }
    if (
      filters.day &&
      /^\d{4}-\d{2}-\d{2}$/.test(filters.day) &&
      Number.isFinite(Date.parse(filters.day))
    ) {
      clauses.push(
        "json_extract(v.input,'$.publishedAt')>=? AND json_extract(v.input,'$.publishedAt')<?",
      );
      const start = Date.parse(`${filters.day}T00:00:00+08:00`);
      params.push(
        new Date(start).toISOString(),
        new Date(start + 86_400_000).toISOString(),
      );
    }
    if (filters.query?.trim()) {
      clauses.push(
        "(instr(lower(v.input),lower(?))>0 OR instr(lower(COALESCE(v.output,'')),lower(?))>0 OR instr(lower(i.protected_fields),lower(?))>0)",
      );
      params.push(
        filters.query.trim().slice(0, 200),
        filters.query.trim().slice(0, 200),
        filters.query.trim().slice(0, 200),
      );
    }
    const from = `FROM items i JOIN item_versions v ON v.id=i.published_version WHERE ${clauses.join(" AND ")}`;
    const { count } = this.database.handle
      .prepare(`SELECT COUNT(*) AS count ${from}`)
      .get(...params) as { count: number };
    const requestedPage = filters.page ?? 1;
    const page =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? Math.min(Math.max(1, Math.ceil(count / 24)), requestedPage)
        : 1;
    const rows = this.database.handle
      .prepare(
        `SELECT i.id ${from} ORDER BY COALESCE(json_extract(v.input,'$.publishedAt'),'') DESC,i.id LIMIT 24 OFFSET ?`,
      )
      .all(...params, (page - 1) * 24) as { id: string }[];
    return { count, page, items: rows.map((row) => this.publicItem(row.id)!) };
  }
  previewEdition(day = budgetDay(this.now())) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)))
      throw new Error("日报日期无效。");
    const hour = this.settingNumber("edition_hour", 9);
    const cutoff = Date.parse(
      `${day}T${String(hour).padStart(2, "0")}:00:00+08:00`,
    );
    const last = this.database.handle
      .prepare("SELECT MAX(cutoff) AS cutoff FROM editions WHERE cutoff<?")
      .get(cutoff) as { cutoff: number | null };
    const start = last.cutoff ?? cutoff - 86_400_000;
    const rows = this.database.handle
      .prepare(
        `
      SELECT i.id,v.id AS versionId,v.output FROM items i JOIN item_versions v ON v.id=i.published_version
      WHERE i.publication_state='published' AND i.published_at>? AND i.published_at<=?
      AND v.processing_state='ready' AND json_extract(v.input,'$.timeVerified')=1
    `,
      )
      .all(start, cutoff) as {
      id: string;
      versionId: string;
      output: string | null;
    }[];
    const frozenVersions = new Set(
      (
        this.database.handle
          .prepare(
            `
        SELECT json_extract(entry.value,'$.versionId') AS versionId
        FROM editions, json_each(editions.entries) entry
      `,
          )
          .all() as { versionId: string }[]
      ).map((entry) => entry.versionId),
    );
    const candidates = rows
      .filter(
        (row) =>
          !frozenVersions.has(row.versionId) &&
          row.output !== null &&
          isDailyCandidate(summarySchema.parse(JSON.parse(row.output))),
      )
      .map((row) => this.publicItem(row.id)!)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const draft = this.database.handle
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(`edition_draft:${day}`) as { value: string } | undefined;
    const requested = draft
      ? (JSON.parse(draft.value) as string[])
      : candidates.map((item) => item.id);
    const ids = new Set(candidates.map((item) => item.id));
    const selectedIds = requested
      .filter((id) => ids.has(id))
      .slice(0, this.settingNumber("edition_limit", 10));
    return {
      day,
      cutoff,
      locked: cutoff <= this.now() || Boolean(this.edition(day)),
      custom: Boolean(draft),
      candidates,
      selectedIds,
    };
  }
  saveEditionDraft(day: string, ids: string[] | null, actor: string) {
    this.database.handle
      .transaction(() => {
        const preview = this.previewEdition(day);
        if (preview.locked) throw new Error("该期已到截止时间，不能调整。");
        if (
          ids &&
          (new Set(ids).size !== ids.length ||
            ids.length > this.settingNumber("edition_limit", 10) ||
            ids.some(
              (id) => !preview.candidates.some((item) => item.id === id),
            ))
        )
          throw new Error(
            "精选条目需要满足当前出刊条件，且不可重复或超出数量。",
          );
        const key = `edition_draft:${day}`;
        if (ids === null)
          this.database.handle
            .prepare("DELETE FROM settings WHERE key=?")
            .run(key);
        else
          this.database.handle
            .prepare(
              "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            )
            .run(key, JSON.stringify(ids));
        this.audit(actor, "edition-draft", day, { ids });
      })
      .immediate();
  }
  createEdition(day = budgetDay(this.now())) {
    return this.database.handle
      .transaction(() => {
        const existing = this.edition(day);
        if (existing) return existing;
        const preview = this.previewEdition(day);
        if (preview.cutoff > this.now()) return null;
        const entries = preview.selectedIds.map((id) => {
          const item = preview.candidates.find((item) => item.id === id)!;
          return {
            id: item.id,
            versionId: item.versionId,
            snapshot: {
              title: item.title,
              summary: item.summary,
              reason: item.reason,
              topics: item.topics,
              score: item.score,
              processingState: item.processingState,
            },
          };
        });
        this.database.handle
          .prepare("INSERT INTO editions VALUES (?,?,?,?)")
          .run(day, preview.cutoff, JSON.stringify(entries), this.now());
        return this.edition(day);
      })
      .immediate();
  }
  isEditionVersion(itemId: string, versionId: string): boolean {
    return Boolean(
      this.database.handle
        .prepare(
          `SELECT 1 FROM editions, json_each(editions.entries) entry
      WHERE json_extract(entry.value,'$.id')=? AND json_extract(entry.value,'$.versionId')=? LIMIT 1`,
        )
        .get(itemId, versionId),
    );
  }
  searchMetadata(): SearchDocument[] {
    const rows = this.database.handle
      .prepare(
        `SELECT i.id,
      COALESCE(json_extract(i.protected_fields,'$.title'),json_extract(v.output,'$.title'),json_extract(v.input,'$.title')) AS title,
      COALESCE(json_extract(i.protected_fields,'$.summary'),json_extract(v.output,'$.summary'),json_extract(v.input,'$.sourceSummary')) AS summary
      FROM items i JOIN item_versions v ON v.id=i.published_version WHERE i.publication_state='published'`,
      )
      .all() as { id: string; title: string; summary: string }[];
    return rows.map((row) => ({
      id: row.id,
      kind: "news",
      title: row.title,
      summary: row.summary,
      text: `${row.title} ${row.summary}`,
      accessPolicy: "upstream-only",
      href: `/discover/${row.id}`,
    }));
  }
  settingNumber(key: string, fallback: number) {
    const row = this.database.handle
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key) as { value: string } | undefined;
    return row ? Number(row.value) : fallback;
  }
  edition(day: string): {
    day: string;
    cutoff: number;
    entries: EditionEntry[];
  } | null {
    const row = this.database.handle
      .prepare("SELECT * FROM editions WHERE day=?")
      .get(day) as { day: string; cutoff: number; entries: string } | undefined;
    return row ? { ...row, entries: JSON.parse(row.entries) } : null;
  }
  editions(): { day: string; cutoff: number }[] {
    return this.database.handle
      .prepare("SELECT day,cutoff FROM editions ORDER BY day DESC LIMIT 366")
      .all() as { day: string; cutoff: number }[];
  }
}
function processRecently(input: DiscoveryInput, time: number) {
  return (
    !input.historical ||
    (input.publishedAt !== null &&
      time - Date.parse(input.publishedAt) <= 30 * 86_400_000)
  );
}
