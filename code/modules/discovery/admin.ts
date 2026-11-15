import { mergeSuggestions, mergeDiscoveryItems } from "./merging";
import {
  curationSchema,
  proposeLearningItem,
  refreshCuration,
  CurationGitHub,
  githubAppConfig,
} from "./curation";
import {
  loadContentCatalogFromDirectory,
  getDefaultContentRoot,
} from "../catalog/catalog-api";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isAdminUser } from "../admin/admin-health";
import { CSRF_COOKIE, readCookie } from "../auth/request-auth";
import { stateWriteRateLimiter } from "../auth/rate-limit";
import type { UserRecord } from "../learning-state/repository";
import { StateValidationError } from "../learning-state/repository";
import { readJsonBodyWithLimit } from "../learning-state/request-limits";
import { SourceAdapter } from "./adapters";
import { DiscoveryBudget } from "./budget";
import { CollectionError, type PublicFetcher } from "./public-fetch";
import { DiscoveryRepository, type DiscoveryInput } from "./repository";
import { discoveryTopics, sourceSchema, summarySchema } from "./schema";

const id = z.string().min(1).max(200);
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edition-draft"),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ids: z.array(id).max(100).nullable(),
  }),
  z.object({ action: z.literal("merge"), sourceId: id, targetId: id }),
  z.object({ action: z.literal("curate"), proposal: curationSchema }),
  z.object({ action: z.literal("refresh-curation"), proposalId: id }),
  z.object({ action: z.literal("save-source"), source: sourceSchema }),
  z.object({ action: z.literal("preview"), source: sourceSchema }),
  z.object({
    action: z.literal("source-fields"),
    source: sourceSchema.refine((source) => source.kind === "feishu"),
  }),
  z.object({ action: z.literal("sync"), sourceId: id }),
  z.object({ action: z.literal("retry"), jobId: id }),
  z.object({ action: z.literal("cancel"), jobId: id }),
  z.object({ action: z.literal("process"), versionId: id }),
  z.object({ action: z.literal("publish"), versionId: id }),
  z.object({ action: z.literal("withdraw"), itemId: id }),
  z.object({ action: z.literal("restore"), itemId: id }),
  z.object({
    action: z.literal("correct"),
    itemId: id,
    fields: z
      .object({
        title: z.string().min(1).max(300).optional(),
        summary: z.string().max(5000).optional(),
        reason: z.string().max(2000).optional(),
        topics: z.array(z.enum(discoveryTopics)).min(1).max(7).optional(),
      })
      .strict(),
  }),
  z.object({
    action: z.literal("confirm-deletion"),
    sourceId: id,
    recordId: id,
  }),
  z.object({
    action: z.literal("budget"),
    yuan: z.number().finite().min(0).max(10000),
  }),
  z.object({
    action: z.literal("edition-settings"),
    hour: z.number().int().min(0).max(23),
    limit: z.number().int().min(1).max(100),
  }),
  z.object({
    action: z.literal("reconcile-call"),
    key: id,
    actualMicros: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    output: summarySchema,
    providerRequestId: z.string().max(200).optional(),
  }),
]);

export function discoveryAdminSnapshot(
  repo: DiscoveryRepository,
  options: { page?: string; query?: string } = {},
) {
  const query = (options.query ?? "").trim().slice(0, 200);
  const join =
    "FROM items i LEFT JOIN item_versions v ON v.id=COALESCE(i.pending_version,i.published_version) WHERE instr(lower(COALESCE(v.input,'')),lower(?))>0";
  const itemCount = (
    repo.database.handle
      .prepare(`SELECT COUNT(*) AS total ${join}`)
      .get(query) as { total: number }
  ).total;
  const pageCount = Math.max(1, Math.ceil(itemCount / 24));
  const parsedPage = Number(options.page);
  const page = Number.isSafeInteger(parsedPage)
    ? Math.min(pageCount, Math.max(1, parsedPage))
    : 1;
  let editionPreview = repo.previewEdition();
  if (editionPreview.locked)
    editionPreview = repo.previewEdition(
      new Date(editionPreview.cutoff + 86400000).toLocaleDateString("en-CA", {
        timeZone: "Asia/Shanghai",
      }),
    );

  const items = (
    repo.database.handle
      .prepare(
        `SELECT i.* ${join} ORDER BY i.updated_at DESC,i.id LIMIT 24 OFFSET ?`,
      )
      .all(query, (page - 1) * 24) as {
      id: string;
      pending_version: string | null;
      published_version: string | null;
      publication_state: string;
      protected_fields: string;
    }[]
  ).map((item) => {
    const version = repo.version(
      item.pending_version ?? item.published_version ?? "",
    );
    return {
      ...item,
      input: version ? (JSON.parse(version.input) as DiscoveryInput) : null,
      version,
      corrections: JSON.parse(item.protected_fields),
    };
  });
  const missing = repo.database.handle
    .prepare(
      `SELECT r.source_id,r.record_id,r.item_id,r.state FROM source_records r WHERE r.state<>'present' ORDER BY r.source_id LIMIT 100`,
    )
    .all() as {
    source_id: string;
    record_id: string;
    item_id: string;
    state: string;
  }[];
  const workers = repo.database.handle
    .prepare("SELECT * FROM worker_health ORDER BY heartbeat_at DESC LIMIT 10")
    .all() as {
    id: string;
    heartbeat_at: number;
    current_job: string | null;
  }[];
  const unresolved = repo.database.handle
    .prepare(
      "SELECT call_key,budget_day,state,reserved_micros,price_version FROM model_receipts WHERE state IN ('dispatched','unknown') ORDER BY created_at DESC LIMIT 100",
    )
    .all() as {
    call_key: string;
    budget_day: string;
    state: string;
    reserved_micros: number;
    price_version: string;
  }[];
  return {
    generatedAt: Date.now(),
    query,
    page,
    pageCount,
    itemCount,
    editionPreview,
    mergeSuggestions: mergeSuggestions(repo),
    sources: repo.sources(),
    items,
    jobs: repo.jobs.list(),
    missing,
    workers,
    unresolved,
    proposals: repo.database.handle
      .prepare("SELECT * FROM proposals ORDER BY updated_at DESC LIMIT 100")
      .all() as import("./curation").CurationProposal[],
    budget: new DiscoveryBudget(repo.database).snapshot(),
    editionHour: repo.settingNumber("edition_hour", 9),
    editionLimit: repo.settingNumber("edition_limit", 10),
    editions: repo.editions(),
    database: {
      schemaVersion: repo.database.schemaVersion,
      ok: repo.database.handle.pragma("quick_check", { simple: true }) === "ok",
    },
  };
}
export type DiscoveryAdminSnapshot = ReturnType<typeof discoveryAdminSnapshot>;

export async function handleDiscoveryAdminRequest(
  request: Request,
  options: {
    mode: "cloud" | "local";
    user: UserRecord | null;
    repository: () => DiscoveryRepository;
    fetcher?: PublicFetcher;
    environment?: Readonly<Record<string, string | undefined>>;
  },
) {
  const respond = (value: unknown, status = 200) =>
    Response.json(value, {
      status,
      headers: { "cache-control": "private, no-store" },
    });
  if (
    options.mode !== "cloud" ||
    !isAdminUser(options.user, options.environment ?? process.env)
  )
    return respond({ error: "需要管理员身份。" }, 403);
  try {
    const repo = options.repository();
    if (request.method === "GET") {
      const params = new URL(request.url).searchParams;
      return respond(
        discoveryAdminSnapshot(repo, {
          page: params.get("page") ?? undefined,
          query: params.get("q") ?? undefined,
        }),
      );
    }
    if (request.method !== "POST")
      return respond({ error: "请求方法无效。" }, 405);
    const csrf = request.headers.get("x-csrf-token");
    if (!csrf || csrf !== readCookie(request, CSRF_COOKIE))
      return respond({ error: "请求校验失败，请刷新页面。" }, 403);
    const limit = stateWriteRateLimiter.consume(
      `discovery-admin:${options.user!.id}`,
    );
    if (!limit.allowed)
      return respond({ error: "操作频繁，请稍后重试。" }, 429);
    const action = actionSchema.parse(await readJsonBodyWithLimit(request));
    const actor = options.user!.id;
    switch (action.action) {
      case "edition-draft":
        repo.saveEditionDraft(action.day, action.ids, actor);
        break;
      case "merge":
        mergeDiscoveryItems(repo, action.sourceId, action.targetId, actor);
        break;
      case "curate": {
        const proposalId = proposeLearningItem(repo, action.proposal, actor);
        repo.jobs.enqueue({
          key: `curation:${proposalId}`,
          kind: "curation",
          payload: { proposalId },
          priority: 300,
        });
        break;
      }
      case "refresh-curation":
        await refreshCuration(
          repo,
          action.proposalId,
          await loadContentCatalogFromDirectory(getDefaultContentRoot()),
          new CurationGitHub(githubAppConfig()),
        );
        break;
      case "save-source":
        repo.saveSource(action.source, actor);
        break;
      case "source-fields": {
        const adapter = new SourceAdapter(
          action.source,
          options.fetcher,
          options.environment ?? process.env,
        );
        const fields = await adapter.fields();
        repo.audit(actor, "source-fields", action.source.id, {
          count: fields.length,
        });
        return respond({
          fields,
          appToken: action.source.appToken,
          tableId: action.source.tableId,
        });
      }
      case "preview": {
        const adapter = new SourceAdapter(
          action.source,
          options.fetcher,
          options.environment ?? process.env,
        );
        const fields =
          action.source.kind === "feishu" ? await adapter.fields() : undefined;
        const page = await adapter.page(null, fields);
        repo.audit(actor, "source-preview", action.source.id, {
          count: page.records.length,
          rejected: page.rejected,
        });
        return respond({
          fields,
          samples: page.records.slice(0, 5),
          hasMore: Boolean(page.nextCursor),
          rejected: page.rejected,
        });
      }
      case "sync": {
        if (!repo.source(action.sourceId)?.enabled)
          return respond({ error: "请先启用来源。" }, 400);
        repo.jobs.enqueue({
          key: `manual-collect:${action.sourceId}:${Math.floor(Date.now() / 60_000)}`,
          kind: "collect",
          payload: { sourceId: action.sourceId },
          priority: 300,
        });
        break;
      }
      case "retry":
        repo.jobs.retry(action.jobId);
        break;
      case "cancel":
        repo.jobs.cancel(action.jobId);
        break;
      case "process": {
        const version = repo.version(action.versionId);
        const row = repo.database.handle
          .prepare(
            "SELECT source_id FROM source_records WHERE version_id=? LIMIT 1",
          )
          .get(action.versionId) as { source_id: string } | undefined;
        if (!version || !row)
          return respond({ error: "处理版本不存在。" }, 404);
        const reviewId = randomUUID();
        const reviewVersionId = `version-${reviewId.replaceAll("-", "")}`;
        repo.database.handle
          .prepare(
            "INSERT INTO item_versions(id,item_id,content_hash,input,created_at) VALUES (?,?,?,?,?)",
          )
          .run(
            reviewVersionId,
            version.item_id,
            `${version.content_hash}:${reviewId}`,
            version.input,
            Date.now(),
          );
        repo.database.handle
          .prepare("UPDATE items SET pending_version=? WHERE id=?")
          .run(reviewVersionId, version.item_id);
        repo.jobs.enqueue({
          key: `review:${version.id}:${reviewId}`,
          kind: "process",
          payload: {
            versionId: reviewVersionId,
            sourceId: row.source_id,
            reviewId,
          },
          priority: 250,
        });
        break;
      }
      case "publish":
        repo.publishVersion(action.versionId, actor);
        break;
      case "withdraw":
        repo.setPublication(action.itemId, "withdrawn", actor);
        break;
      case "restore":
        repo.setPublication(action.itemId, "published", actor);
        break;
      case "correct":
        repo.correct(action.itemId, action.fields, actor);
        break;
      case "confirm-deletion":
        repo.confirmDeleted(action.sourceId, action.recordId, actor);
        break;
      case "budget":
        new DiscoveryBudget(repo.database).setLimit(
          Math.round(action.yuan * 1_000_000),
        );
        break;
      case "edition-settings":
        repo.database.handle
          .transaction(() => {
            const statement = repo.database.handle.prepare(
              "UPDATE settings SET value=? WHERE key=?",
            );
            statement.run(String(action.hour), "edition_hour");
            statement.run(String(action.limit), "edition_limit");
          })
          .immediate();
        break;
      case "reconcile-call": {
        // Reconciliation is an explicit administrative acknowledgement of the
        // supplier receipt. Re-running processing then consumes the saved result.
        new DiscoveryBudget(repo.database).settle(
          action.key,
          action.actualMicros,
          { output: action.output },
          action.providerRequestId ?? null,
        );
        break;
      }
    }
    repo.audit(actor, action.action, "discovery", { result: "success" });
    return respond({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof StateValidationError)
      return respond({ error: "输入格式无效，请检查字段与长度。" }, 400);
    if (error instanceof CollectionError)
      return respond({ error: "信源连接或解析失败。", code: error.code }, 400);
    return respond({ error: "资讯操作失败，请检查目标状态后重试。" }, 400);
  }
}
