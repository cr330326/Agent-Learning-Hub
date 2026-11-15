"use client";
import { publicSourcePresets } from "../../modules/discovery/source-presets";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { DiscoveryAdminSnapshot } from "../../modules/discovery/admin";
import {
  discoveryTopics,
  sourceSchema,
  type CollectionSource,
} from "../../modules/discovery/schema";
import { Pagination } from "./pagination";
import { curationSuggestion } from "../../modules/discovery/curation-suggestion";
import { processingLabel } from "./discovery-card";
import type { FeishuField } from "../../modules/discovery/adapters";

const fieldLabels = {
  title: "标题字段（必选）",
  url: "原文链接字段（必选）",
  author: "作者字段",
  summary: "摘要字段",
  publishedAt: "发布时间字段",
  sourceStatus: "来源状态字段",
};

const defaultSource = sourceSchema.parse({
  id: "my-source",
  name: "新信源",
  kind: "rss",
  url: "https://example.com/feed.xml",
  topics: ["Harness Engineering"],
});
const jobLabels: Record<string, string> = {
  queued: "排队中",
  running: "处理中",
  waiting: "等待条件",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};
function failureLabel(code: string | null) {
  if (!code) return "";
  const labels: Record<string, string> = {
    "budget-exhausted": "日预算已用完，等待次日",
    "model-not-configured": "模型或计价尚未配置",
    "receipt-needs-review": "调用结果未知，需核对供应商回执",
    "permission-denied": "来源权限不足或凭据已过期",
    "feishu-credentials-missing": "飞书凭据尚未配置",
    "feishu-auth-failed": "飞书身份验证失败",
    "field-mapping-changed": "字段映射已变化，需重新试抓",
    "field-mapping-incomplete": "请映射标题和原文链接字段",
    "request-timeout": "来源响应超时",
    "connection-failed": "来源连接失败",
    "rate-limited": "触发上游限流，稍后重试",
    "pagination-loop": "分页游标重复，已停止本轮采集",
    "unsafe-address": "来源地址未通过出站校验",
    "unsafe-url": "来源地址格式未通过校验",
    "github-app-not-configured": "仓库 GitHub App 尚未配置",
    "github-read-token-missing": "GitHub 读取凭据尚未配置",
    "historical-import": "正在分批导入历史资料",
    "github-tree-truncated": "仓库文件列表未完整返回，等待复核",
    "model-output-invalid": "模型输出格式不符合要求",
    "lease-exhausted": "任务多次中断，需人工重试",
  };
  if (labels[code]) return labels[code];
  if (code.startsWith("feishu-"))
    return "飞书接口返回错误，请检查权限与表格映射";
  if (code.startsWith("upstream-http-")) return "上游接口请求失败";
  return "处理失败，请试抓来源并检查配置";
}
function progressLabel(value: string) {
  try {
    const progress = JSON.parse(value);
    return `本页发现 ${progress.records ?? 0} 条 · 新增 ${progress.added ?? 0} · 更新 ${progress.updated ?? 0} · 已完成 ${progress.checkpoint?.pages ?? 0} 页`;
  } catch {
    return "等待采集进度";
  }
}
function time(value: number | null) {
  return value
    ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "尚无记录";
}
function yuan(micros: number) {
  return `¥${(micros / 1_000_000).toFixed(3)}`;
}

export function DiscoveryAdmin({
  page,
  query,
}: {
  page?: string;
  query?: string;
}) {
  const apiUrl = `/api/admin/discovery?${new URLSearchParams({ page: page ?? "1", q: query ?? "" })}`;
  const [snapshot, setSnapshot] = useState<DiscoveryAdminSnapshot | null>(null);
  const [source, setSource] = useState<CollectionSource>(defaultSource);
  const [mapping, setMapping] = useState("{}");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("");
  const [fieldPreview, setFieldPreview] = useState<{
    appToken: string;
    tableId: string;
    fields: FeishuField[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  async function reload() {
    const response = await fetch(apiUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("管理信息暂时无法读取。");
    setSnapshot(await response.json());
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("管理信息暂时无法读取。");
        return response.json();
      })
      .then(setSnapshot)
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [apiUrl]);
  async function perform(action: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const session = await fetch("/api/session", { cache: "no-store" }).then(
        (response) => response.json(),
      );
      const response = await fetch("/api/admin/discovery", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": session.csrfToken ?? "",
        },
        body: JSON.stringify(action),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "操作失败。");
      if (result.samples || result.fields)
        setPreview(JSON.stringify(result, null, 2));
      if (result.fields && result.appToken && result.tableId)
        setFieldPreview(result);
      setMessage("操作已完成。");
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy(false);
    }
  }
  function selectSource(value: CollectionSource) {
    setSource(value);
    setMapping(JSON.stringify(value.mapping, null, 2));
    setPreview("");
    setFieldPreview(null);
  }
  function sourceAction(action: "save-source" | "preview" | "source-fields") {
    try {
      void perform({
        action,
        source: {
          ...source,
          mapping: action === "source-fields" ? {} : JSON.parse(mapping),
        },
      });
    } catch {
      setMessage("字段映射需要有效的 JSON 对象。");
    }
  }
  let mappedFields: Record<string, string> = {};
  try {
    const parsed = JSON.parse(mapping);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      mappedFields = parsed;
  } catch {
    /* The advanced editor can contain an unfinished JSON value. */
  }
  function mapField(key: string, value: string) {
    const next = { ...mappedFields };
    if (value) next[key] = value;
    else delete next[key];
    setMapping(JSON.stringify(next, null, 2));
  }
  const visibleFields =
    fieldPreview &&
    fieldPreview.appToken === source.appToken &&
    fieldPreview.tableId === source.tableId
      ? fieldPreview.fields
      : null;
  function settings(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      [...data.entries()].map(([key, value]) => [key, Number(value)]),
    );
    void perform({ action, ...values });
  }
  return (
    <div className="discovery-admin">
      <p>
        <Link href="/admin">运行健康</Link> ·{" "}
        <Link href="/discover">公开发现页</Link>
      </p>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <section>
        <h2>信源</h2>
        <p>先试抓并核对公开字段，再选择发布方式与启用。新信源默认人工审核。</p>
        <div className="admin-source-list">
          {snapshot?.sources.map((status) => (
            <article key={status.source.id}>
              <h3>{status.source.name}</h3>
              <p>
                {status.source.enabled ? "已启用" : "已停用"} ·{" "}
                {status.source.publicationMode === "auto"
                  ? "自动发布"
                  : "人工审核"}{" "}
                · 每 {status.source.intervalMinutes} 分钟
              </p>
              <p>
                最近成功 {time(status.last_success_at)}
                <br />
                上游更新 {time(status.upstream_updated_at)}
              </p>
              <p>{progressLabel(status.progress)}</p>
              {status.last_error ? (
                <p>{failureLabel(status.last_error)}</p>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => selectSource(status.source)}
              >
                编辑
              </button>{" "}
              <button
                type="button"
                disabled={busy || !status.source.enabled}
                onClick={() =>
                  void perform({ action: "sync", sourceId: status.source.id })
                }
              >
                立即采集
              </button>
            </article>
          ))}
        </div>
        <p>
          <button type="button" onClick={() => selectSource(defaultSource)}>
            添加信源
          </button>{" "}
          <button
            type="button"
            onClick={() =>
              selectSource({
                ...publicSourcePresets[0],
              })
            }
          >
            填入 Anthropic Engineering
          </button>{" "}
          <button
            type="button"
            onClick={() =>
              selectSource({
                ...publicSourcePresets[1],
              })
            }
          >
            填入 LangChain Blog
          </button>
        </p>
        <form
          className="admin-source-form"
          onSubmit={(event) => {
            event.preventDefault();
            sourceAction("save-source");
          }}
        >
          <label>
            标识
            <input
              value={source.id}
              onChange={(event) =>
                setSource({ ...source, id: event.target.value })
              }
              required
              maxLength={100}
            />
          </label>
          <label>
            名称
            <input
              value={source.name}
              onChange={(event) =>
                setSource({ ...source, name: event.target.value })
              }
              required
              maxLength={200}
            />
          </label>
          <label>
            类型
            <select
              value={source.kind}
              onChange={(event) =>
                setSource({
                  ...source,
                  kind: event.target.value as CollectionSource["kind"],
                  intervalMinutes: event.target.value === "feishu" ? 30 : 60,
                })
              }
            >
              <option value="feishu">飞书多维表格</option>
              <option value="rss">RSS / Atom</option>
              <option value="json">JSON 接口</option>
              <option value="html">HTML 列表</option>
              <option value="github">GitHub 采集结果</option>
            </select>
          </label>
          <label>
            默认内容类型
            <select
              value={source.contentType}
              onChange={(event) =>
                setSource({
                  ...source,
                  contentType: event.target
                    .value as CollectionSource["contentType"],
                })
              }
            >
              <option value="article">文章</option>
              <option value="video">视频</option>
              <option value="tool">工具</option>
              <option value="update">动态</option>
            </select>
          </label>
          <label>
            地址
            <input
              type="url"
              value={source.url}
              onChange={(event) =>
                setSource({ ...source, url: event.target.value })
              }
              required
              maxLength={2048}
            />
          </label>
          <label>
            间隔（分钟）
            <input
              type="number"
              min={5}
              max={10080}
              value={source.intervalMinutes}
              onChange={(event) =>
                setSource({
                  ...source,
                  intervalMinutes: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            发布方式
            <select
              value={source.publicationMode}
              onChange={(event) =>
                setSource({
                  ...source,
                  publicationMode: event.target
                    .value as CollectionSource["publicationMode"],
                })
              }
            >
              <option value="manual">人工审核</option>
              <option value="auto">自动发布</option>
            </select>
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={source.aggregation}
              onChange={(event) =>
                setSource({ ...source, aggregation: event.target.checked })
              }
            />
            使用来源内容聚合展示
          </label>
          <label>
            展示优先级
            <input
              type="number"
              min={0}
              max={100}
              value={source.priority}
              onChange={(event) =>
                setSource({ ...source, priority: Number(event.target.value) })
              }
            />
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={source.enabled}
              onChange={(event) =>
                setSource({ ...source, enabled: event.target.checked })
              }
            />
            启用来源
          </label>
          <fieldset>
            <legend>主题</legend>
            {discoveryTopics.map((topic) => (
              <label className="admin-checkbox" key={topic}>
                <input
                  type="checkbox"
                  checked={source.topics.includes(topic)}
                  onChange={(event) =>
                    setSource({
                      ...source,
                      topics: event.target.checked
                        ? [...source.topics, topic]
                        : source.topics.filter((value) => value !== topic),
                    })
                  }
                />
                {topic}
              </label>
            ))}
          </fieldset>
          {source.kind === "feishu" ? (
            <>
              <label>
                Base 标识
                <input
                  value={source.appToken ?? ""}
                  onChange={(event) =>
                    setSource({ ...source, appToken: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                子表标识
                <input
                  value={source.tableId ?? ""}
                  onChange={(event) =>
                    setSource({ ...source, tableId: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                视图标识（可选）
                <input
                  value={source.viewId ?? ""}
                  onChange={(event) =>
                    setSource({
                      ...source,
                      viewId: event.target.value || undefined,
                    })
                  }
                />
              </label>
              <label>
                访问令牌环境变量名
                <input
                  value={source.tokenEnv ?? ""}
                  onChange={(event) =>
                    setSource({
                      ...source,
                      tokenEnv: event.target.value || undefined,
                    })
                  }
                  placeholder="FEISHU_ACCESS_TOKEN"
                />
              </label>
              <label>
                应用标识环境变量名
                <input
                  value={source.appIdEnv ?? ""}
                  onChange={(event) =>
                    setSource({
                      ...source,
                      appIdEnv: event.target.value || undefined,
                    })
                  }
                  placeholder="FEISHU_APP_ID"
                />
              </label>
              <label>
                应用密钥环境变量名
                <input
                  value={source.appSecretEnv ?? ""}
                  onChange={(event) =>
                    setSource({
                      ...source,
                      appSecretEnv: event.target.value || undefined,
                    })
                  }
                  placeholder="FEISHU_APP_SECRET"
                />
              </label>
              <p>
                服务端通过环境变量读取凭据。字段映射使用稳定字段
                ID，视图限制本次导入范围。
              </p>
              <div className="admin-wide">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => sourceAction("source-fields")}
                >
                  读取字段
                </button>
                <p>
                  先填写
                  Base、子表和凭据环境变量名，再读取字段并选择标题与原文链接；无需手工查找字段
                  ID。
                </p>
              </div>
              {visibleFields ? (
                <fieldset aria-label="飞书字段映射">
                  <legend>飞书字段映射</legend>
                  <div className="admin-source-form">
                    {Object.entries(fieldLabels).map(([key, label]) => (
                      <label key={key}>
                        {label}
                        <select
                          disabled={busy}
                          required={key === "title" || key === "url"}
                          value={mappedFields[key] ?? ""}
                          onChange={(event) =>
                            mapField(key, event.target.value)
                          }
                        >
                          <option value="">不映射</option>
                          {visibleFields.map((field) => (
                            <option key={field.field_id} value={field.field_id}>
                              {field.field_name}
                            </option>
                          ))}
                          {mappedFields[key] &&
                          !visibleFields.some(
                            (field) => field.field_id === mappedFields[key],
                          ) ? (
                            <option value={mappedFields[key]}>
                              原字段已不存在，请重新选择
                            </option>
                          ) : null}
                        </select>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </>
          ) : null}
          {source.kind === "html" || source.kind === "json" ? (
            <>
              <label>
                {source.kind === "html" ? "列表 CSS 选择器" : "列表 JSON 路径"}
                <input
                  value={source.listPath}
                  onChange={(event) =>
                    setSource({ ...source, listPath: event.target.value })
                  }
                />
              </label>
              {source.kind === "html" ? (
                <label>
                  文章路径前缀
                  <input
                    value={source.linkPattern}
                    onChange={(event) =>
                      setSource({ ...source, linkPattern: event.target.value })
                    }
                  />
                </label>
              ) : null}
            </>
          ) : null}
          {source.kind === "github" ? (
            <label>
              读取令牌环境变量名
              <input
                value={source.tokenEnv ?? ""}
                onChange={(event) =>
                  setSource({
                    ...source,
                    tokenEnv: event.target.value || undefined,
                  })
                }
                placeholder="OPENSPACE_GITHUB_TOKEN"
              />
            </label>
          ) : null}
          <label className="admin-wide">
            字段映射
            <textarea
              aria-label="字段映射"
              value={mapping}
              onChange={(event) => setMapping(event.target.value)}
              rows={7}
              spellCheck={false}
            />
            <small>
              映射键可用
              title、url、author、summary、publishedAt、sourceStatus。JSON
              来源使用字段路径，HTML 来源使用 CSS 选择器，飞书来源使用字段
              ID。指标键形如 metric.views。
            </small>
          </label>
          <div className="admin-wide">
            <button
              className="button button-primary"
              disabled={busy}
              type="submit"
            >
              保存信源
            </button>{" "}
            <button
              disabled={busy}
              type="button"
              onClick={() => sourceAction("preview")}
            >
              试抓与预览
            </button>
          </div>
        </form>
        {preview ? <pre className="admin-preview">{preview}</pre> : null}
      </section>
      <section>
        <h2>预算与日报</h2>
        {snapshot ? (
          <p>
            今日已用 {yuan(snapshot.budget.spent)} · 在途预留{" "}
            {yuan(snapshot.budget.reserved)} · 剩余{" "}
            {yuan(snapshot.budget.remaining)} · 计日时区为北京时间
          </p>
        ) : null}
        <form onSubmit={(event) => settings(event, "budget")}>
          <label>
            每日上限（元）
            <input
              type="number"
              name="yuan"
              min={0}
              max={10000}
              step="0.01"
              defaultValue={5}
            />
          </label>{" "}
          <button disabled={busy}>调整预算</button>
        </form>
        <form onSubmit={(event) => settings(event, "edition-settings")}>
          <label>
            出刊小时（北京时间）
            <input
              type="number"
              name="hour"
              min={0}
              max={23}
              defaultValue={9}
            />
          </label>{" "}
          <label>
            最多条数
            <input
              type="number"
              name="limit"
              min={1}
              max={100}
              defaultValue={10}
            />
          </label>{" "}
          <button disabled={busy}>保存出刊设置</button>
        </form>
        {snapshot ? (
          <EditionDraft
            key={snapshot.generatedAt}
            value={snapshot.editionPreview}
            busy={busy}
            perform={perform}
          />
        ) : null}
      </section>
      <section>
        <h2>任务与运行状态</h2>
        {snapshot ? (
          <p>
            资讯库 {snapshot.database.ok ? "正常" : "需检查"} ·{" "}
            {snapshot.workers.some(
              (worker) => snapshot.generatedAt - worker.heartbeat_at < 90_000,
            )
              ? "后台任务在线"
              : "等待后台任务心跳"}
          </p>
        ) : null}
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>尝试次数</th>
                <th>下次运行</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {snapshot?.jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    {job.kind === "collect"
                      ? "采集"
                      : job.kind === "process"
                        ? "摘要处理"
                        : "出刊"}
                  </td>
                  <td>
                    {jobLabels[job.state]}
                    {job.error_code ? ` · ${failureLabel(job.error_code)}` : ""}
                  </td>
                  <td>{job.attempts}</td>
                  <td>{time(job.available_at)}</td>
                  <td>
                    <button
                      disabled={
                        busy || !["failed", "cancelled"].includes(job.state)
                      }
                      onClick={() =>
                        void perform({ action: "retry", jobId: job.id })
                      }
                    >
                      重试
                    </button>{" "}
                    <button
                      disabled={
                        busy ||
                        !["queued", "waiting", "running"].includes(job.state)
                      }
                      onClick={() =>
                        void perform({ action: "cancel", jobId: job.id })
                      }
                    >
                      取消
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>相似内容合并建议</h2>
        {snapshot?.mergeSuggestions.map((suggestion) => (
          <article
            className="admin-item"
            key={suggestion.leftId + suggestion.rightId}
          >
            <p>{suggestion.leftTitle}</p>
            <p>{suggestion.rightTitle}</p>
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "确认属于同一事件？第一条保留为主条目，第二条保留关联入口与原文出处。",
                  )
                )
                  void perform({
                    action: "merge",
                    sourceId: suggestion.rightId,
                    targetId: suggestion.leftId,
                  });
              }}
            >
              确认合并至第一条
            </button>
          </article>
        ))}
      </section>
      <section>
        <h2>来源记录待核对</h2>
        {snapshot?.missing.map((record) => (
          <p key={`${record.source_id}:${record.record_id}`}>
            {record.source_id} · {record.record_id} ·{" "}
            {record.state === "confirmed-deleted"
              ? "已确认删除，摘要保留"
              : "来源暂时不可见，需核对权限或视图"}
            {record.state !== "confirmed-deleted" ? (
              <>
                {" "}
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "已从原始表确认该记录被删除？视图筛选和连接失败须继续核对。",
                      )
                    )
                      void perform({
                        action: "confirm-deletion",
                        sourceId: record.source_id,
                        recordId: record.record_id,
                      });
                  }}
                >
                  确认原始记录已删除
                </button>
              </>
            ) : null}
          </p>
        ))}
      </section>
      <section>
        <h2>付费回执核对</h2>
        <p>
          发送后结果未知的调用保留预算预留。查阅供应商回执后填写实际金额与结构化摘要结果，再继续处理。
        </p>
        {snapshot?.unresolved.map((receipt) => (
          <ReceiptReview
            key={receipt.call_key}
            receipt={receipt}
            busy={busy}
            perform={perform}
          />
        ))}
      </section>
      <section>
        <h2>学习收录 PR</h2>
        {snapshot?.proposals.map((proposal) => (
          <article key={proposal.id}>
            <p>
              {(
                {
                  suggested: "建议中",
                  "pr-open": "PR 待审",
                  "merged-unreleased": "已合并待发布",
                  live: "已上线",
                  closed: "已关闭",
                } as Record<string, string>
              )[proposal.state] ?? "处理中"}
            </p>
            {proposal.pr_url ? (
              <a href={proposal.pr_url} target="_blank" rel="noreferrer">
                查看 GitHub PR
              </a>
            ) : (
              <p>等待后台生成 PR</p>
            )}{" "}
            <button
              disabled={busy || !proposal.pr_number}
              onClick={() =>
                void perform({
                  action: "refresh-curation",
                  proposalId: proposal.id,
                })
              }
            >
              刷新合并与上线状态
            </button>
          </article>
        ))}
      </section>
      <section>
        <h2>内容审核与更正</h2>
        <form action="/admin/discovery">
          <label>
            查找历史内容
            <input
              name="q"
              defaultValue={query ?? ""}
              key={query ?? ""}
              maxLength={200}
            />
          </label>
          <button>搜索内容</button>
        </form>
        {snapshot ? (
          <p>
            共 {snapshot.itemCount} 条 · 第 {snapshot.page}/{snapshot.pageCount}{" "}
            页
          </p>
        ) : null}
        {snapshot?.items.map((item) => (
          <AdminItem key={item.id} item={item} busy={busy} perform={perform} />
        ))}
        {snapshot ? (
          <Pagination
            basePath="/admin/discovery"
            params={{ q: snapshot.query }}
            page={snapshot.page}
            pageCount={snapshot.pageCount}
          />
        ) : null}
      </section>
    </div>
  );
}
function AdminItem({
  item,
  busy,
  perform,
}: {
  item: DiscoveryAdminSnapshot["items"][number];
  busy: boolean;
  perform: (action: unknown) => Promise<void>;
}) {
  const output = item.version?.output ? JSON.parse(item.version.output) : null;
  const suggestion = curationSuggestion(
    output?.topics ?? item.input?.topics ?? [],
    output?.reason ?? "",
  );
  const [stageId, setStageId] = useState(suggestion.stageId);
  const [reason, setReason] = useState(suggestion.reason);
  const [prerequisites, setPrerequisites] = useState(suggestion.prerequisites);
  const [summary, setSummary] = useState<string>(
    item.corrections.summary ??
      (item.version?.output
        ? JSON.parse(item.version.output).summary
        : (item.input?.sourceSummary ?? "")),
  );
  return (
    <details className="admin-item">
      <summary>
        {item.input?.title ?? "待处理条目"} ·{" "}
        {item.publication_state === "published"
          ? "已发布"
          : item.publication_state === "withdrawn"
            ? "已撤下"
            : "待审核"}
      </summary>
      <p>
        {processingLabel(item.version?.processing_state ?? "pending", "admin")}
      </p>
      <p>{item.input?.url}</p>
      {item.version ? (
        <>
          <button
            disabled={busy}
            onClick={() =>
              void perform({ action: "publish", versionId: item.version!.id })
            }
          >
            审核发布
          </button>{" "}
          <button
            disabled={busy}
            onClick={() =>
              void perform({ action: "process", versionId: item.version!.id })
            }
          >
            补充处理 / 复核
          </button>
        </>
      ) : null}
      {item.published_version ? (
        <>
          {" "}
          <button
            disabled={busy}
            onClick={() =>
              void perform({
                action:
                  item.publication_state === "withdrawn"
                    ? "restore"
                    : "withdraw",
                itemId: item.id,
              })
            }
          >
            {item.publication_state === "withdrawn" ? "恢复" : "下架"}
          </button>{" "}
          <Link href={`/discover/${item.id}`}>查看页面</Link>
        </>
      ) : null}
      <label>
        维护者摘要
        <textarea
          rows={5}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          maxLength={5000}
        />
      </label>
      <button
        disabled={busy}
        onClick={() =>
          void perform({
            action: "correct",
            itemId: item.id,
            fields: { summary },
          })
        }
      >
        保存更正并保护字段
      </button>
      {item.publication_state === "published" ? (
        <fieldset>
          <legend>收录为公共学习资料</legend>
          <p>系统按内容主题预填阶段、前置知识与收录理由，请核对后确认。</p>
          <label>
            适用阶段
            <select
              value={stageId}
              onChange={(event) => setStageId(event.target.value)}
            >
              {Array.from({ length: 9 }, (_, i) => (
                <option key={i} value={`stage-${i}`}>
                  阶段 {i}
                </option>
              ))}
            </select>
          </label>
          <label>
            收录理由
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
            />
          </label>
          <label>
            前置知识
            <input
              value={prerequisites}
              onChange={(event) => setPrerequisites(event.target.value)}
              maxLength={2000}
            />
          </label>
          <button
            disabled={busy || !reason.trim()}
            onClick={() =>
              void perform({
                action: "curate",
                proposal: {
                  itemId: item.id,
                  learningId: `discovery-${item.id.slice(5)}`,
                  stageIds: [stageId],
                  track: "aicoding",
                  reason,
                  prerequisites,
                },
              })
            }
          >
            确认推荐并生成 GitHub PR
          </button>
        </fieldset>
      ) : null}
    </details>
  );
}

function ReceiptReview({
  receipt,
  busy,
  perform,
}: {
  receipt: DiscoveryAdminSnapshot["unresolved"][number];
  busy: boolean;
  perform: (action: unknown) => Promise<void>;
}) {
  const [output, setOutput] = useState("");
  const [actual, setActual] = useState("");
  const [provider, setProvider] = useState("");
  return (
    <details className="admin-item">
      <summary>
        待核对调用 · {receipt.budget_day} · 预留 {yuan(receipt.reserved_micros)}
      </summary>
      <p>{receipt.call_key}</p>
      <label>
        实际人民币费用
        <input
          type="number"
          min={0}
          step="0.000001"
          value={actual}
          onChange={(event) => setActual(event.target.value)}
        />
      </label>
      <label>
        供应商回执标识
        <input
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
        />
      </label>
      <label>
        摘要结构化结果
        <textarea
          rows={8}
          value={output}
          onChange={(event) => setOutput(event.target.value)}
          maxLength={20000}
        />
      </label>
      <button
        disabled={busy || !output || actual === ""}
        onClick={() => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(output);
          } catch {
            return;
          }
          void perform({
            action: "reconcile-call",
            key: receipt.call_key,
            actualMicros: Math.round(Number(actual) * 1000000),
            output: parsed,
            providerRequestId: provider,
          });
        }}
      >
        记录核对结果
      </button>
    </details>
  );
}

function EditionDraft({
  value,
  busy,
  perform,
}: {
  value: DiscoveryAdminSnapshot["editionPreview"];
  busy: boolean;
  perform: (action: unknown) => Promise<void>;
}) {
  const [ids, setIds] = useState(value.selectedIds);
  function move(index: number, direction: number) {
    const next = [...ids];
    const destination = index + direction;
    if (destination < 0 || destination >= next.length) return;
    [next[index], next[destination]] = [next[destination], next[index]];
    setIds(next);
  }
  return (
    <section>
      <h3>{value.day} 待发布精选</h3>
      <p>
        截止 {time(value.cutoff)} ·{" "}
        {value.custom ? "人工选排" : "按工程价值排序"} · 已选 {ids.length}{" "}
        条。新增合格内容会在自动排序模式下加入候选。
      </p>
      <ol>
        {ids.map((id, index) => (
          <li key={id}>
            {value.candidates.find((item) => item.id === id)?.title}{" "}
            <button
              type="button"
              disabled={busy || index === 0}
              onClick={() => move(index, -1)}
            >
              上移
            </button>{" "}
            <button
              type="button"
              disabled={busy || index === ids.length - 1}
              onClick={() => move(index, 1)}
            >
              下移
            </button>{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => setIds(ids.filter((value) => value !== id))}
            >
              移出精选
            </button>
          </li>
        ))}
      </ol>
      <details>
        <summary>查看合格候选（{value.candidates.length} 条）</summary>
        {value.candidates
          .filter((item) => !ids.includes(item.id))
          .map((item) => (
            <p key={item.id}>
              {item.title}{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => setIds([...ids, item.id])}
              >
                加入精选
              </button>
            </p>
          ))}
      </details>
      <button
        type="button"
        disabled={busy || value.locked}
        onClick={() =>
          void perform({ action: "edition-draft", day: value.day, ids })
        }
      >
        保存选排
      </button>{" "}
      <button
        type="button"
        disabled={busy || value.locked}
        onClick={() =>
          void perform({ action: "edition-draft", day: value.day, ids: null })
        }
      >
        恢复自动排序
      </button>
    </section>
  );
}
