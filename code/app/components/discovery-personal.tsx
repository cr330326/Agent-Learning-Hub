"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { DiscoveryPersonalState } from "../../modules/learning-state/discovery-state";
type Entry = DiscoveryPersonalState & { title: string; withdrawn: boolean };
export function DiscoveryPersonal({
  itemId,
  withdrawn = false,
}: {
  itemId?: string;
  withdrawn?: boolean;
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [session, setSession] = useState<{
    authenticated: boolean;
    csrfToken: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then(async (value) => {
        setSession(value);
        if (!value.authenticated) return;
        const response = await fetch("/api/state/discovery", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("资讯记录读取失败。");
        const payload = (await response.json()) as { state: Entry[] };
        setEntries(payload.state);
        setNote(
          payload.state.find((entry) => entry.itemId === itemId)?.note ?? "",
        );
      })
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [itemId]);
  async function save(patch: Partial<DiscoveryPersonalState>, target = itemId) {
    if (!target || !session?.csrfToken) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/state/discovery", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": session.csrfToken,
        },
        body: JSON.stringify({ targetType: "news", itemId: target, ...patch }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setEntries((current) => {
        const original = current?.find((entry) => entry.itemId === target);
        const updated = { ...original, ...payload.state };
        return [
          ...(current ?? []).filter((entry) => entry.itemId !== target),
          updated,
        ];
      });
      setMessage("已保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }
  if (!session) return <p role="status">正在读取个人记录…</p>;
  if (!session.authenticated)
    return (
      <p>
        <Link href="/login">使用 GitHub 登录</Link>
        后可保存资讯阅读状态、收藏和私人笔记。
      </p>
    );
  if (!entries) return <p role="status">{message || "正在读取个人记录…"}</p>;
  const entry = entries.find((entry) => entry.itemId === itemId);
  if (itemId)
    return (
      <section className="discovery-personal">
        <h2>我的资讯记录</h2>
        <p role="status">{message}</p>
        <div className="hero-actions">
          <button
            className="button button-outline"
            disabled={busy}
            onClick={() => void save({ bookmarked: !entry?.bookmarked })}
          >
            {entry?.bookmarked ? "取消收藏" : "收藏资讯"}
          </button>
          {!withdrawn && (!entry || entry.status === "not_started") ? (
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => void save({ status: "in_progress" })}
            >
              开始阅读
            </button>
          ) : null}
          {!withdrawn ? (
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() =>
                void save({
                  status:
                    entry?.status === "completed" ? "in_progress" : "completed",
                })
              }
            >
              {entry?.status === "completed" ? "重新阅读" : "确认已完成阅读"}
            </button>
          ) : null}
        </div>
        <p>
          {entry?.status === "completed"
            ? "已主动确认阅读完成"
            : entry?.status === "in_progress"
              ? "阅读中"
              : "尚未开始阅读"}
        </p>
        <label>
          私人笔记
          <textarea
            rows={6}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={20000}
          />
        </label>
        <button
          className="button button-primary"
          disabled={busy}
          onClick={() => void save({ note })}
        >
          保存笔记
        </button>
      </section>
    );
  return (
    <section className="discovery-personal">
      <h2>我的资讯</h2>
      <p role="status">{message}</p>
      {entries.length ? (
        <ul className="dashboard-note-list">
          {entries.map((value) => (
            <li key={value.itemId}>
              <Link href={`/discover/${value.itemId}`}>{value.title}</Link>
              <p>
                {value.withdrawn
                  ? "条目已撤下"
                  : value.status === "completed"
                    ? "已读完"
                    : "待继续阅读"}
                {value.bookmarked ? " · 已收藏" : ""}
              </p>
              {value.note ? (
                <p className="discovery-summary">{value.note}</p>
              ) : null}
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() =>
                  void save({ bookmarked: false, note: "" }, value.itemId)
                }
              >
                清空笔记与收藏
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>在资讯详情页收藏、记录笔记或确认阅读后，可从这里继续。</p>
      )}
    </section>
  );
}
