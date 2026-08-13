"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * PAGE-002 asks the roadmap to show completion, and the stage page is where a
 * reader actually works through the practice tasks. Both need the same private
 * state, and the roadmap renders nine rows at once — so the fetch lives in one
 * provider and every badge and checkbox reads from it, rather than each row
 * asking the API for the same snapshot.
 *
 * The provider wraps server-rendered children; only the badges and the
 * checklist are client components.
 */

type StageProgressValue = {
  ready: boolean;
  authenticated: boolean;
  completedTaskIds: ReadonlySet<string>;
  outcomeStageIds: ReadonlySet<string>;
  message: string;
  toggleTask: (taskId: string, completed: boolean) => Promise<void>;
};

const StageProgressContext = createContext<StageProgressValue | null>(null);

type Snapshot = {
  state?: {
    stageTaskProgress: Array<{ taskId: string; completed: boolean }>;
    stageOutcomes: Array<{ stageId: string }>;
  };
};

export function StageProgressProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [completedTaskIds, setCompletedTaskIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [outcomeStageIds, setOutcomeStageIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [message, setMessage] = useState("");

  const applySnapshot = useCallback((payload: Snapshot) => {
    setCompletedTaskIds(
      new Set(
        (payload.state?.stageTaskProgress ?? [])
          .filter((task) => task.completed)
          .map((task) => task.taskId),
      ),
    );
    setOutcomeStageIds(
      new Set(
        (payload.state?.stageOutcomes ?? []).map((outcome) => outcome.stageId),
      ),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sessionResponse = await fetch("/api/session");
      if (!sessionResponse.ok || cancelled) return;
      const session = (await sessionResponse.json()) as {
        authenticated?: boolean;
        csrfToken?: string | null;
      };
      if (cancelled) return;
      setAuthenticated(session.authenticated === true);
      setCsrfToken(session.csrfToken ?? null);
      if (session.authenticated !== true) {
        setReady(true);
        return;
      }
      const stateResponse = await fetch("/api/state");
      if (!stateResponse.ok || cancelled) return;
      applySnapshot((await stateResponse.json()) as Snapshot);
      if (!cancelled) setReady(true);
    })().catch(() => {
      if (!cancelled) {
        setMessage("学习状态暂时不可用。");
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  const toggleTask = useCallback(
    async (taskId: string, completed: boolean) => {
      if (!csrfToken) {
        setMessage("当前会话还没有可用的安全 token。");
        return;
      }
      // Reflect the click straight away; the response replaces this with the
      // stored snapshot, so a rejected write corrects itself.
      setCompletedTaskIds((current) => {
        const next = new Set(current);
        if (completed) next.add(taskId);
        else next.delete(taskId);
        return next;
      });
      const response = await fetch("/api/state", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ action: "task-progress", taskId, completed }),
      });
      if (!response.ok) {
        setMessage("保存失败，请稍后再试。");
        const stateResponse = await fetch("/api/state");
        if (stateResponse.ok) {
          applySnapshot((await stateResponse.json()) as Snapshot);
        }
        return;
      }
      applySnapshot((await response.json()) as Snapshot);
      setMessage("已保存");
    },
    [applySnapshot, csrfToken],
  );

  const value = useMemo(
    () => ({
      ready,
      authenticated,
      completedTaskIds,
      outcomeStageIds,
      message,
      toggleTask,
    }),
    [
      ready,
      authenticated,
      completedTaskIds,
      outcomeStageIds,
      message,
      toggleTask,
    ],
  );

  return (
    <StageProgressContext.Provider value={value}>
      {children}
    </StageProgressContext.Provider>
  );
}

function useStageProgress(): StageProgressValue | null {
  return useContext(StageProgressContext);
}

/**
 * Per-stage completion on the roadmap list. Renders nothing until the snapshot
 * arrives so a signed-out reader never sees a flash of "0/3".
 */
export function StageProgressBadge({
  stageId,
  taskIds,
}: {
  stageId: string;
  taskIds: readonly string[];
}) {
  const progress = useStageProgress();
  if (!progress?.ready || !progress.authenticated || taskIds.length === 0) {
    return null;
  }

  const done = taskIds.filter((taskId) =>
    progress.completedTaskIds.has(taskId),
  ).length;
  const hasOutcome = progress.outcomeStageIds.has(stageId);
  // Ticking every task is not completion — STATE-004 reserves that for a
  // recorded outcome the reader submits deliberately.
  const stageState = hasOutcome
    ? "confirmed"
    : done === taskIds.length
      ? "tasks-done"
      : done > 0
        ? "started"
        : "untouched";

  return (
    <span className={`stage-progress stage-progress-${stageState}`}>
      <span
        className="stage-progress-bar"
        style={
          {
            "--stage-progress-fill": `${Math.round((done / taskIds.length) * 100)}%`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      />
      <small>
        {stageState === "confirmed"
          ? "已交成果"
          : stageState === "tasks-done"
            ? `动作已做完 · 待交成果`
            : `动作 ${done}/${taskIds.length}`}
      </small>
    </span>
  );
}

/**
 * The stage page lists the practice tasks a reader is meant to work through,
 * so it is also where ticking them belongs; sending them to the dashboard to
 * record what they just did on this page was the long way round.
 */
export function StageTaskChecklist({
  tasks,
}: {
  tasks: ReadonlyArray<{
    id: string;
    title: string;
    summary: string;
    acceptanceCriteria: readonly string[];
  }>;
}) {
  const progress = useStageProgress();
  const interactive = progress?.ready === true && progress.authenticated;

  return (
    <>
      <ol className="task-list">
        {tasks.map((task, index) => {
          const completed = progress?.completedTaskIds.has(task.id) === true;
          const body = (
            <div>
              <strong>{task.title}</strong>
              {task.summary.trim() !== "" &&
              task.summary.trim() !== task.title.trim() ? (
                <p>{task.summary}</p>
              ) : null}
              {task.acceptanceCriteria.length > 0 ? (
                <ul className="task-criteria">
                  {task.acceptanceCriteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );

          return (
            <li
              className={completed ? "task-item-done" : undefined}
              key={task.id}
            >
              {interactive ? (
                <label className="task-check">
                  <input
                    checked={completed}
                    onChange={(event) =>
                      void progress?.toggleTask(task.id, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span className="task-check-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </label>
              ) : (
                <span>{String(index + 1).padStart(2, "0")}</span>
              )}
              {body}
            </li>
          );
        })}
      </ol>
      {progress?.ready && !progress.authenticated ? (
        <p className="task-list-note">登录后可以在这里直接勾选动作。</p>
      ) : null}
      {progress?.message ? (
        <span className="learning-state-message" role="status">
          {progress.message}
        </span>
      ) : null}
    </>
  );
}
