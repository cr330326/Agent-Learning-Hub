"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Item = { id: string; title: string };
type Stage = {
  id: string;
  title: string;
  order: number;
  tasks: Array<{ id: string; title: string }>;
};

type DashboardState = {
  user: { id: string; displayName: string };
  itemProgress: Array<{
    itemId: string;
    status: "not_started" | "in_progress" | "completed";
    position: number;
    updatedAt: string;
  }>;
  stageTaskProgress: Array<{
    taskId: string;
    completed: boolean;
  }>;
  notes: Array<{
    id: string;
    scopeType: "item" | "stage";
    scopeId: string;
    body: string;
    updatedAt: string;
  }>;
  bookmarks: Array<{ itemId: string }>;
  stageOutcomes: Array<{
    id: string;
    stageId: string;
    kind: "repository" | "demo" | "reflection";
    url: string | null;
    summary: string | null;
    confirmedAt: string | null;
  }>;
};

/**
 * `position` is the stored scroll offset. Users care about "where was I", not
 * the pixel value, so report the saved time and only hint that a position exists.
 */
function readingPositionLabel(progress: {
  position: number;
  updatedAt: string;
}) {
  const savedAt = new Date(progress.updatedAt);
  const when = Number.isNaN(savedAt.getTime())
    ? null
    : savedAt.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
  const place = progress.position > 0 ? "可回到上次位置" : "尚未记录位置";
  return when ? `${when} · ${place}` : place;
}

export function LearningDashboard({
  items,
  stages,
}: {
  items: Item[];
  stages: Stage[];
}) {
  const [state, setState] = useState<DashboardState | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [noteScopeType, setNoteScopeType] = useState<"item" | "stage">("item");
  const [noteScopeId, setNoteScopeId] = useState(items[0]?.id ?? "");
  const [noteBody, setNoteBody] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [outcomeStageId, setOutcomeStageId] = useState(stages[0]?.id ?? "");
  const [outcomeKind, setOutcomeKind] = useState<
    "repository" | "demo" | "reflection"
  >("repository");
  const [outcomeUrl, setOutcomeUrl] = useState("");
  const [outcomeSummary, setOutcomeSummary] = useState("");

  const itemTitles = useMemo(
    () => new Map(items.map((item) => [item.id, item.title])),
    [items],
  );
  const stageTitles = useMemo(
    () => new Map(stages.map((stage) => [stage.id, stage.title])),
    [stages],
  );

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const sessionResponse = await fetch("/api/session");
      const session = (await sessionResponse.json()) as {
        authenticated?: boolean;
        csrfToken?: string | null;
      };
      setAuthenticated(session.authenticated === true);
      setCsrfToken(session.csrfToken ?? null);
      if (!session.authenticated) {
        setState(null);
        return;
      }
      const stateResponse = await fetch("/api/state");
      if (!stateResponse.ok) throw new Error("state request failed");
      const payload = (await stateResponse.json()) as {
        state: DashboardState;
      };
      setState(payload.state);
    } catch {
      setMessage("学习状态暂时不可用，请稍后刷新。");
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!csrfToken) {
        setMessage("当前会话还没有可用的安全 token。");
        return false;
      }
      const response = await fetch("/api/state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setMessage(error?.error ?? "保存失败，请稍后再试。");
        return false;
      }
      await loadState();
      setMessage("已保存");
      return true;
    },
    [csrfToken, loadState],
  );

  const deleteAccount = useCallback(async () => {
    if (
      !csrfToken ||
      !window.confirm("确定删除全部个人学习数据吗？此操作不可撤销。")
    ) {
      return;
    }
    const response = await fetch("/api/data", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }),
    });
    if (response.ok) {
      setAuthenticated(false);
      setState(null);
      setMessage("账户和个人学习数据已删除。");
    } else {
      setMessage("删除失败，请稍后再试。");
    }
  }, [csrfToken]);

  useEffect(() => {
    void Promise.resolve().then(() => loadState());
  }, [loadState]);

  if (loading)
    return <div className="dashboard-panel">正在读取你的学习状态…</div>;

  if (!authenticated || !state) {
    return (
      <div className="dashboard-panel dashboard-empty">
        <h2>先建立你的学习状态</h2>
        <p>
          本地模式会自动使用固定单用户；云端模式登录后，这里会显示你的进度和成果。
        </p>
        <div className="dashboard-empty-actions">
          <Link className="button button-primary" href="/roadmap">
            从路线开始
          </Link>
          <Link className="text-link" href="/courses">
            浏览课程目录 →
          </Link>
        </div>
        {message ? (
          <span className="learning-state-message" role="status">
            {message}
          </span>
        ) : null}
      </div>
    );
  }

  const inProgress = state.itemProgress.filter(
    (item) => item.status === "in_progress",
  );
  const completed = state.itemProgress.filter(
    (item) => item.status === "completed",
  );
  const completedTasks = new Set(
    state.stageTaskProgress
      .filter((task) => task.completed)
      .map((task) => task.taskId),
  );

  return (
    <div className="dashboard-stack">
      <section className="dashboard-panel dashboard-overview">
        <div>
          <p className="eyebrow">MY FIELD NOTES</p>
          <h2>{state.user.displayName}，下一步从哪里继续？</h2>
          <p>阅读位置、主动完成的条目、收藏、笔记和阶段成果都只属于你。</p>
        </div>
        <dl className="dashboard-stats">
          <div>
            <dt>进行中</dt>
            <dd>{inProgress.length}</dd>
          </div>
          <div>
            <dt>已完成</dt>
            <dd>{completed.length}</dd>
          </div>
          <div>
            <dt>收藏</dt>
            <dd>{state.bookmarks.length}</dd>
          </div>
          <div>
            <dt>笔记</dt>
            <dd>{state.notes.length}</dd>
          </div>
        </dl>
        <div className="dashboard-export-actions">
          <a href="/api/data" download>
            导出 JSON
          </a>
          <a href="/api/data?format=notes" download>
            导出笔记 Markdown
          </a>
          <button
            className="is-destructive"
            type="button"
            onClick={() => void deleteAccount()}
          >
            删除账户
          </button>
        </div>
      </section>

      <section className="dashboard-panel" aria-labelledby="continue-title">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">CONTINUE READING</p>
            <h2 id="continue-title">继续阅读</h2>
          </div>
          <Link className="text-link" href="/courses">
            全部课程 →
          </Link>
        </div>
        {inProgress.length === 0 ? (
          <p className="empty-state">
            还没有进行中的条目，去路线或课程目录选一个今天能打开的资料。
          </p>
        ) : (
          <div className="dashboard-list">
            {inProgress.slice(0, 3).map((progress) => (
              <div className="dashboard-list-row" key={progress.itemId}>
                <div>
                  <strong>
                    {itemTitles.get(progress.itemId) ?? progress.itemId}
                  </strong>
                  <small>{readingPositionLabel(progress)}</small>
                </div>
                <Link
                  className="button button-small"
                  href={`/read/${progress.itemId}`}
                >
                  继续阅读
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-panel" aria-labelledby="tasks-title">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">PRACTICE CHECKLIST</p>
            <h2 id="tasks-title">阶段任务</h2>
          </div>
          <span className="section-aside">{completedTasks.size} 项已勾选</span>
        </div>
        {stages.map((stage) => (
          <div className="dashboard-task-stage" key={stage.id}>
            <h3>
              <span>Stage {String(stage.order).padStart(2, "0")}</span>
              {stage.title}
            </h3>
            <div className="dashboard-task-grid">
              {stage.tasks.map((task) => (
                <label className="dashboard-task" key={task.id}>
                  <input
                    id={task.id}
                    name={task.id}
                    type="checkbox"
                    checked={completedTasks.has(task.id)}
                    onChange={(event) =>
                      void send({
                        action: "task-progress",
                        taskId: task.id,
                        completed: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>{task.title}</strong>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="dashboard-two-column">
        <section className="dashboard-panel" aria-labelledby="bookmarks-title">
          <p className="eyebrow">SAVED SOURCES</p>
          <h2 id="bookmarks-title">收藏</h2>
          {state.bookmarks.length === 0 ? (
            <p className="empty-state">在课程页按“收藏”，稍后从这里回来。</p>
          ) : (
            <ul className="dashboard-link-list">
              {state.bookmarks.map((bookmark) => (
                <li key={bookmark.itemId}>
                  <Link href={`/courses/${bookmark.itemId}`}>
                    {itemTitles.get(bookmark.itemId) ?? bookmark.itemId}
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      void send({
                        action: "bookmark",
                        itemId: bookmark.itemId,
                        bookmarked: false,
                      })
                    }
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dashboard-panel" aria-labelledby="notes-title">
          <p className="eyebrow">PRIVATE MARKDOWN</p>
          <h2 id="notes-title">私人笔记</h2>
          <form
            className="dashboard-form"
            onSubmit={(event) => {
              event.preventDefault();
              void send({
                action: "note",
                id: editingNoteId ?? undefined,
                scopeType: noteScopeType,
                scopeId: noteScopeId,
                body: noteBody,
              }).then((saved) => {
                if (saved) {
                  setNoteBody("");
                  setEditingNoteId(null);
                }
              });
            }}
          >
            <div className="form-row">
              <label>
                <span>范围</span>
                <select
                  id="note-scope-type"
                  name="note-scope-type"
                  value={noteScopeType}
                  onChange={(event) => {
                    const next = event.target.value as "item" | "stage";
                    setNoteScopeType(next);
                    setNoteScopeId(
                      next === "item"
                        ? (items[0]?.id ?? "")
                        : (stages[0]?.id ?? ""),
                    );
                  }}
                >
                  <option value="item">课程</option>
                  <option value="stage">阶段</option>
                </select>
              </label>
              <label>
                <span>对象</span>
                <select
                  id="note-scope-id"
                  name="note-scope-id"
                  value={noteScopeId}
                  onChange={(event) => setNoteScopeId(event.target.value)}
                >
                  {(noteScopeType === "item" ? items : stages).map((entry) => (
                    <option value={entry.id} key={entry.id}>
                      {entry.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span>Markdown 笔记</span>
              <textarea
                id="note-body"
                name="note-body"
                value={noteBody}
                maxLength={20_000}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="写下下一次实践要验证的假设…"
                rows={5}
              />
            </label>
            <button className="button button-small" type="submit">
              {editingNoteId ? "更新笔记" : "保存笔记"}
            </button>
          </form>
          {state.notes.length > 0 ? (
            <ul className="dashboard-note-list">
              {state.notes.map((note) => (
                <li key={note.id}>
                  <div>
                    <strong>
                      {note.scopeType === "item"
                        ? (itemTitles.get(note.scopeId) ?? note.scopeId)
                        : (stageTitles.get(note.scopeId) ?? note.scopeId)}
                    </strong>
                    <p>{note.body}</p>
                  </div>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNoteId(note.id);
                        setNoteScopeType(note.scopeType);
                        setNoteScopeId(note.scopeId);
                        setNoteBody(note.body);
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void send({ action: "note-delete", noteId: note.id })
                      }
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      <section className="dashboard-panel" aria-labelledby="outcomes-title">
        <div className="dashboard-section-heading">
          <div>
            <p className="eyebrow">PROOF OF WORK</p>
            <h2 id="outcomes-title">阶段成果</h2>
          </div>
          <Link className="text-link" href="/projects">
            查看项目阶梯 →
          </Link>
        </div>
        <form
          className="dashboard-form outcome-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send({
              action: "outcome",
              stageId: outcomeStageId,
              kind: outcomeKind,
              url: outcomeUrl || undefined,
              summary: outcomeSummary || undefined,
            }).then((saved) => {
              if (saved) {
                setOutcomeUrl("");
                setOutcomeSummary("");
              }
            });
          }}
        >
          <label>
            <span>阶段</span>
            <select
              id="outcome-stage-id"
              name="outcome-stage-id"
              value={outcomeStageId}
              onChange={(event) => setOutcomeStageId(event.target.value)}
            >
              {stages.map((stage) => (
                <option value={stage.id} key={stage.id}>
                  {stage.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>类型</span>
            <select
              id="outcome-kind"
              name="outcome-kind"
              value={outcomeKind}
              onChange={(event) =>
                setOutcomeKind(
                  event.target.value as "repository" | "demo" | "reflection",
                )
              }
            >
              <option value="repository">GitHub 仓库</option>
              <option value="demo">演示链接</option>
              <option value="reflection">Markdown 总结</option>
            </select>
          </label>
          {outcomeKind === "reflection" ? (
            <label className="form-wide">
              <span>总结</span>
              <textarea
                id="outcome-summary"
                name="outcome-summary"
                value={outcomeSummary}
                maxLength={20_000}
                onChange={(event) => setOutcomeSummary(event.target.value)}
                rows={4}
              />
            </label>
          ) : (
            <label className="form-wide">
              <span>URL</span>
              <input
                id="outcome-url"
                name="outcome-url"
                value={outcomeUrl}
                onChange={(event) => setOutcomeUrl(event.target.value)}
                placeholder="https://github.com/…"
                type="url"
              />
            </label>
          )}
          <button className="button button-small" type="submit">
            添加成果
          </button>
        </form>
        <div className="dashboard-outcomes">
          {state.stageOutcomes.length === 0 ? (
            <p className="empty-state">
              提交一条仓库、演示或总结，阶段才可以主动确认完成。
            </p>
          ) : (
            state.stageOutcomes.map((outcome) => (
              <article className="dashboard-outcome" key={outcome.id}>
                <div>
                  <strong>
                    {stageTitles.get(outcome.stageId) ?? outcome.stageId}
                  </strong>
                  <span>
                    {outcome.kind} · {outcome.confirmedAt ? "已确认" : "待确认"}
                  </span>
                  {outcome.url ? <a href={outcome.url}>{outcome.url}</a> : null}
                  {outcome.summary ? <p>{outcome.summary}</p> : null}
                </div>
                <div className="dashboard-outcome-actions">
                  {!outcome.confirmedAt ? (
                    <button
                      type="button"
                      onClick={() =>
                        void send({
                          action: "confirm-stage",
                          stageId: outcome.stageId,
                        })
                      }
                    >
                      确认阶段完成
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      void send({
                        action: "outcome-delete",
                        outcomeId: outcome.id,
                      })
                    }
                  >
                    删除
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <span className="learning-state-message" role="status">
          {message}
        </span>
      </section>
    </div>
  );
}
