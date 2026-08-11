import { describe, expect, it } from "vitest";

import { openLearningDatabase } from "../learning-state/database";
import { createPrivacyFirstMonitor, getPageViewScope } from "./privacy-monitor";

describe("privacy-first operational metrics", () => {
  it("aggregates fixed event dimensions without persisting sensitive fields", () => {
    const database = openLearningDatabase({
      filename: ":memory:",
      enableWal: false,
    });
    const logLines: string[] = [];
    const now = new Date("2026-08-11T08:42:00.000Z");
    const monitor = createPrivacyFirstMonitor(database, {
      now: () => now,
      writeLog: (line) => logLines.push(line),
    });

    const unsafeInput = {
      event: "page_view" as const,
      scope: "home" as const,
      outcome: "observed" as const,
      userId: "github-42",
      cookie: "session-secret",
      note: "private note body",
    };
    monitor.record(unsafeInput);
    monitor.record({
      event: "page_view",
      scope: "home",
      outcome: "observed",
    });
    monitor.record({
      event: "health_check",
      scope: "readiness",
      outcome: "failure",
    });

    const snapshot = monitor.snapshot();
    expect(snapshot.pageViews).toEqual([{ scope: "home", count: 2 }]);
    expect(snapshot.alerts).toContainEqual(
      expect.objectContaining({
        id: "health-check-failed",
        severity: "critical",
      }),
    );

    const rows = database.handle
      .prepare(
        "SELECT bucket_started_at, event, scope, outcome, count, last_occurred_at FROM operational_metrics ORDER BY event",
      )
      .all();
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual(
      expect.objectContaining({
        event: "page_view",
        scope: "home",
        outcome: "observed",
        count: 2,
      }),
    );
    const serialized = JSON.stringify({ rows, logLines, snapshot });
    expect(serialized).not.toContain("github-42");
    expect(serialized).not.toContain("session-secret");
    expect(serialized).not.toContain("private note body");

    database.close();
  });

  it("uses only stable page categories and ignores unknown paths", () => {
    expect(getPageViewScope("/")).toBe("home");
    expect(getPageViewScope("/roadmap/stage-01")).toBe("roadmap-stage");
    expect(getPageViewScope("/courses/legacy-course-001")).toBe(
      "course-detail",
    );
    expect(getPageViewScope("/read/legacy-course-001")).toBe("reader");
    expect(getPageViewScope("/api/state")).toBeNull();
    expect(getPageViewScope("/private/github-42")).toBeNull();
  });
});
