import { describe, expect, it } from "vitest";

import type { UserRecord } from "../learning-state/repository";
import {
  handleAdminHealthRequest,
  isAdminUser,
  type AdminHealthSnapshot,
} from "./admin-health";

const admin: UserRecord = {
  id: "github-42",
  mode: "cloud",
  githubId: "42",
  displayName: "Admin",
  createdAt: "2026-08-09T00:00:00.000Z",
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const learner: UserRecord = { ...admin, id: "github-99", githubId: "99" };

const snapshot: AdminHealthSnapshot = {
  generatedAt: "2026-08-09T00:00:00.000Z",
  mode: "cloud",
  catalog: { status: "ok", errorCount: 0, warningCount: 2 },
  materials: {
    status: "not-mounted",
    repositoriesChecked: 0,
    nonGitReferencesSkipped: 0,
    counts: {
      latest: 0,
      behind: 0,
      ahead: 0,
      diverged: 0,
      dirty: 0,
      "check-failed": 0,
    },
  },
  database: {
    status: "ok",
    schemaVersion: 1,
    sqliteVersion: "3.51.3",
    journalMode: "wal",
  },
  backup: { status: "not-configured" },
  deployment: { version: "test", nodeMajor: 24 },
};

describe("admin health boundary", () => {
  it("uses the stable GitHub ID and never grants local users admin access", () => {
    expect(isAdminUser(admin, { ADMIN_GITHUB_IDS: "42, 100" })).toBe(true);
    expect(isAdminUser(learner, { ADMIN_GITHUB_IDS: "42, 100" })).toBe(false);
    expect(
      isAdminUser(
        { ...admin, mode: "local", githubId: null },
        {
          ADMIN_GITHUB_IDS: "42",
        },
      ),
    ).toBe(false);
  });

  it("rejects anonymous and ordinary users before building a snapshot", async () => {
    let buildCount = 0;
    const buildSnapshot = async () => {
      buildCount += 1;
      return snapshot;
    };

    await expect(
      handleAdminHealthRequest(
        new Request("https://hub.test/api/admin/health"),
        {
          user: null,
          environment: { ADMIN_GITHUB_IDS: "42" },
          buildSnapshot,
        },
      ),
    ).resolves.toMatchObject({ status: 401 });

    await expect(
      handleAdminHealthRequest(
        new Request("https://hub.test/api/admin/health"),
        {
          user: learner,
          environment: { ADMIN_GITHUB_IDS: "42" },
          buildSnapshot,
        },
      ),
    ).resolves.toMatchObject({ status: 403 });

    expect(buildCount).toBe(0);
  });

  it("returns only health summaries to an administrator", async () => {
    const response = await handleAdminHealthRequest(
      new Request("https://hub.test/api/admin/health"),
      {
        user: admin,
        environment: { ADMIN_GITHUB_IDS: "42" },
        buildSnapshot: async () => snapshot,
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(snapshot);
    expect(JSON.stringify(body)).not.toContain("/Users/");
    expect(JSON.stringify(body)).not.toContain("private note");
    expect(JSON.stringify(body)).not.toContain("token");
  });

  it("does not accept health mutations", async () => {
    const response = await handleAdminHealthRequest(
      new Request("https://hub.test/api/admin/health", { method: "POST" }),
      {
        user: admin,
        environment: { ADMIN_GITHUB_IDS: "42" },
        buildSnapshot: async () => snapshot,
      },
    );

    expect(response.status).toBe(405);
  });
});
