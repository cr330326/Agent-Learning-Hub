"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ItemProgressStatus = "not_started" | "in_progress" | "completed";

type Props = {
  itemId: string;
  autoStart?: boolean;
};

type StatePayload = {
  authenticated?: boolean;
  user?: { id: string };
  csrfToken?: string | null;
  state?: {
    itemProgress: Array<{
      itemId: string;
      status: ItemProgressStatus;
      position: number;
    }>;
    bookmarks: Array<{ itemId: string }>;
  };
};

const statusLabels: Record<ItemProgressStatus, string> = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
};

export function LearningStateControls({ itemId, autoStart = false }: Props) {
  const [status, setStatus] = useState<ItemProgressStatus>("not_started");
  const [position, setPosition] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const saveTimer = useRef<number | null>(null);

  const saveProgress = useCallback(async (
    nextStatus: ItemProgressStatus,
    nextPosition = window.scrollY,
    tokenOverride = csrfToken,
  ) => {
    if (!tokenOverride) return;
    const response = await fetch("/api/state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": tokenOverride,
      },
      body: JSON.stringify({
        action: "item-progress",
        itemId,
        status: nextStatus,
        position: Math.max(0, Math.round(nextPosition)),
      }),
    });
    if (!response.ok) {
      setMessage("状态保存失败，请稍后再试。");
      return;
    }
    const payload = (await response.json()) as {
      itemProgress?: { status: ItemProgressStatus; position: number };
    };
    if (payload.itemProgress) {
      setStatus(payload.itemProgress.status);
      setPosition(payload.itemProgress.position);
    }
    setMessage("已保存");
  }, [csrfToken, itemId]);

  const toggleBookmark = useCallback(async () => {
    if (!csrfToken) return;
    const nextBookmarked = !bookmarked;
    const response = await fetch("/api/state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({
        action: "bookmark",
        itemId,
        bookmarked: nextBookmarked,
      }),
    });
    if (response.ok) {
      setBookmarked(nextBookmarked);
      setMessage(nextBookmarked ? "已加入收藏" : "已取消收藏");
    }
  }, [bookmarked, csrfToken, itemId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sessionResponse = await fetch("/api/session");
      if (!sessionResponse.ok || cancelled) return;
      const session = (await sessionResponse.json()) as StatePayload;
      if (cancelled) return;
      setCsrfToken(session.csrfToken ?? null);
      setAuthenticated(session.authenticated === true);
      if (!session.authenticated) {
        setReady(true);
        return;
      }
      const stateResponse = await fetch("/api/state");
      if (!stateResponse.ok || cancelled) return;
      const payload = (await stateResponse.json()) as StatePayload;
      const itemProgress = payload.state?.itemProgress.find(
        (progress) => progress.itemId === itemId,
      );
      if (itemProgress) {
        setStatus(itemProgress.status);
        setPosition(itemProgress.position);
      }
      setBookmarked(
        payload.state?.bookmarks.some((bookmark) => bookmark.itemId === itemId) ??
          false,
      );
      setReady(true);
      if (autoStart && itemProgress?.status !== "completed") {
        await saveProgress(
          "in_progress",
          itemProgress?.position ?? 0,
          session.csrfToken ?? undefined,
        );
      }
      if (autoStart && itemProgress && itemProgress.position > 0) {
        window.scrollTo({ top: itemProgress.position, behavior: "instant" });
      }
    })().catch(() => {
      if (!cancelled) setMessage("学习状态暂时不可用。");
    });
    return () => {
      cancelled = true;
    };
  }, [autoStart, itemId, saveProgress]);

  useEffect(() => {
    if (!autoStart || !ready || !authenticated || !csrfToken) return;
    const onScroll = () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        if (status !== "completed") void saveProgress("in_progress");
      }, 700);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [authenticated, autoStart, csrfToken, ready, saveProgress, status]);

  if (!ready) {
    return <section className="learning-state-panel">正在读取学习状态…</section>;
  }

  if (!authenticated) {
    return (
      <section className="learning-state-panel">
        <strong>登录后保存学习状态</strong>
        <span>进度、阅读位置和收藏会跟随你的账户。</span>
      </section>
    );
  }

  return (
    <section className="learning-state-panel" aria-label="学习状态">
      <div className="learning-state-status">
        <span className="eyebrow">MY LEARNING STATE</span>
        <strong>{statusLabels[status]}</strong>
        {position > 0 ? <small>已保存阅读位置</small> : null}
      </div>
      <div className="learning-state-actions">
        {status !== "in_progress" ? (
          <button
            className="button button-small"
            type="button"
            onClick={() => void saveProgress("in_progress", window.scrollY)}
          >
            开始学习
          </button>
        ) : null}
        {status !== "completed" ? (
          <button
            className="button button-small button-outline"
            type="button"
            onClick={() => void saveProgress("completed", window.scrollY)}
          >
            标记完成
          </button>
        ) : (
          <button
            className="button button-small button-outline"
            type="button"
            onClick={() => void saveProgress("in_progress", window.scrollY)}
          >
            撤销完成
          </button>
        )}
        <button
          className="state-bookmark"
          type="button"
          aria-pressed={bookmarked}
          onClick={() => void toggleBookmark()}
        >
          {bookmarked ? "★ 已收藏" : "☆ 收藏"}
        </button>
      </div>
      <span className="learning-state-message" role="status">
        {message}
      </span>
    </section>
  );
}
