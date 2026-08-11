import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { openLearningDatabase } from "../learning-state/database";
import { recordOperatorMetric } from "./operator-monitor";
import { createPrivacyFirstMonitor } from "./privacy-monitor";

describe("operator command monitoring", () => {
  it("persists a fixed failure metric and emits a path-free alert signal", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-operator-"));
    const databaseFilename = join(root, "private-state.sqlite");
    const database = openLearningDatabase({
      filename: databaseFilename,
      enableWal: false,
    });
    const logLines: string[] = [];
    const now = new Date("2026-08-11T03:04:05.000Z");

    try {
      expect(
        recordOperatorMetric(
          { event: "backup", scope: "backup", outcome: "failure" },
          {
            databaseFilename,
            now: () => now,
            writeLog: (line) => logLines.push(line),
          },
        ),
      ).toEqual({ persisted: true });

      const snapshot = createPrivacyFirstMonitor(database, {
        now: () => now,
        writeLog: () => undefined,
      }).snapshot();
      expect(snapshot.alerts).toContainEqual({
        id: "backup-or-restore-failed",
        severity: "critical",
        count: 1,
      });
      expect(logLines).toHaveLength(1);
      expect(logLines[0]).toContain('"event":"backup"');
      expect(logLines[0]).not.toContain(root);
      expect(logLines[0]).not.toContain("private-state.sqlite");
    } finally {
      database.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps the command healthy when the structured-log sink fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "agent-learning-operator-"));
    const databaseFilename = join(root, "state.sqlite");
    const database = openLearningDatabase({
      filename: databaseFilename,
      enableWal: false,
    });

    try {
      expect(() =>
        recordOperatorMetric(
          {
            event: "content_audit",
            scope: "content-audit",
            outcome: "success",
          },
          {
            databaseFilename,
            writeLog: () => {
              throw new Error("log collector unavailable");
            },
          },
        ),
      ).not.toThrow();
      expect(
        createPrivacyFirstMonitor(database, {
          writeLog: () => undefined,
        }).snapshot().operations,
      ).toContainEqual({
        event: "content_audit",
        scope: "content-audit",
        outcome: "success",
        count: 1,
      });
    } finally {
      database.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
