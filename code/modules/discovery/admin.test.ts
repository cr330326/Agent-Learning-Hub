import { afterEach, describe, expect, it } from "vitest";
import { openDiscoveryDatabase, type DiscoveryDatabase } from "./database";
import { DiscoveryRepository } from "./repository";
import { discoveryAdminSnapshot, handleDiscoveryAdminRequest } from "./admin";
import type { UserRecord } from "../learning-state/repository";
const databases: DiscoveryDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const user: UserRecord = {
  id: "github-42",
  mode: "cloud",
  githubId: "42",
  displayName: "维护者",
  createdAt: "2026-11-15T00:00:00Z",
  updatedAt: "2026-11-15T00:00:00Z",
};
function setup() {
  const db = openDiscoveryDatabase(":memory:");
  databases.push(db);
  return new DiscoveryRepository(db);
}
function request(body: unknown, csrf = true) {
  return new Request("https://example.com/api/admin/discovery", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "agent-learning-csrf=token",
      ...(csrf ? { "x-csrf-token": "token" } : {}),
    },
    body: JSON.stringify(body),
  });
}
it("can request model review for a version assembled from multiple aggregation sources", async () => {
  const repo = setup();
  const source = repo.saveSource(
    {
      id: "primary",
      name: "主要来源",
      kind: "json",
      url: "https://example.com/feed",
      topics: ["AI 编程"],
      aggregation: true,
      publicationMode: "auto",
      priority: 100,
    },
    "test",
  );
  const fallback = repo.saveSource(
    { ...source, id: "secondary", priority: 10 },
    "test",
  );
  const row = {
    recordId: "one",
    title: "聚合资料",
    url: "https://example.com/item",
  };
  repo.ingestPage(source, [row], "primary");
  repo.ingestPage(
    fallback,
    [{ ...row, title: "补充来源标题", summary: "补充摘要" }],
    "secondary",
  );
  const item = repo.listPublic().items[0];
  expect(
    repo.database.handle
      .prepare("SELECT 1 FROM source_records WHERE version_id=?")
      .get(item.versionId),
  ).toBeUndefined();
  const response = await handleDiscoveryAdminRequest(
    request({ action: "process", versionId: item.versionId }),
    {
      mode: "cloud",
      user,
      repository: () => repo,
      environment: { ADMIN_GITHUB_IDS: "42" },
    },
  );
  expect(response.status).toBe(200);
  expect(JSON.parse(repo.jobs.list()[0].payload).sourceId).toBe(source.id);
});
describe("discovery administration", () => {
  it("enforces mode, stable GitHub admin identity and CSRF before mutations", async () => {
    const repo = setup();
    const common = {
      repository: () => repo,
      environment: { ADMIN_GITHUB_IDS: "42" },
    };
    expect(
      (
        await handleDiscoveryAdminRequest(
          request({ action: "budget", yuan: 9 }),
          { ...common, mode: "local", user },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleDiscoveryAdminRequest(
          request({ action: "budget", yuan: 9 }),
          { ...common, mode: "cloud", user: { ...user, githubId: "43" } },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleDiscoveryAdminRequest(
          request({ action: "budget", yuan: 9 }, false),
          { ...common, mode: "cloud", user },
        )
      ).status,
    ).toBe(403);
    const valid = await handleDiscoveryAdminRequest(
      request({ action: "budget", yuan: 9 }),
      { ...common, mode: "cloud", user },
    );
    expect(valid.status).toBe(200);
    expect(repo.settingNumber("daily_budget_micros", 0)).toBe(9_000_000);
  });
});

it("finds historical items beyond the recent hundred through bounded pages and literal search", () => {
  const repo = setup();
  const source = repo.saveSource(
    {
      id: "history",
      name: "历史",
      topics: ["Harness Engineering"],
      kind: "json",
      url: "https://example.com/feed",
    },
    "admin",
  );
  repo.ingestPage(
    source,
    Array.from({ length: 105 }, (_, index) => ({
      recordId: String(index),
      title: `历史资料 ${index}`,
      url: `https://example.com/history/${index}`,
    })),
    "run",
    { historical: true },
  );
  const seen = new Set<string>();
  for (let page = 1; page <= 5; page++) {
    const result = discoveryAdminSnapshot(repo, { page: String(page) });
    expect(result.itemCount).toBe(105);
    expect(result.items.length).toBeLessThanOrEqual(24);
    for (const item of result.items) seen.add(item.id);
  }
  expect(seen.size).toBe(105);
  expect(
    discoveryAdminSnapshot(repo, { query: "历史资料 104" }).items[0]?.input
      ?.title,
  ).toBe("历史资料 104");
  expect(discoveryAdminSnapshot(repo, { query: "' OR 1=1 --" }).itemCount).toBe(
    0,
  );
  expect(discoveryAdminSnapshot(repo, { page: "-9" }).page).toBe(1);
});

it("loads Feishu fields before a first mapping without reading or publishing records", async () => {
  const repo = setup();
  const urls: string[] = [];
  const response = await handleDiscoveryAdminRequest(
    request({
      action: "source-fields",
      source: {
        id: "first-feishu",
        name: "首次飞书接入",
        kind: "feishu",
        url: "https://my.feishu.cn/base/baseTest",
        appToken: "baseTest",
        tableId: "tblTest",
        tokenEnv: "TEST_FEISHU_TOKEN",
        topics: ["AI 编程"],
        mapping: {},
      },
    }),
    {
      mode: "cloud",
      user,
      repository: () => repo,
      environment: { ADMIN_GITHUB_IDS: "42", TEST_FEISHU_TOKEN: "test-token" },
      fetcher: async (url, options) => {
        urls.push(url);
        expect(options?.headers?.authorization).toBe("Bearer test-token");
        return {
          url,
          status: 200,
          contentType: "application/json",
          text: JSON.stringify({
            code: 0,
            data: {
              items: [
                { field_id: "fldTitle", field_name: "标题", type: 1 },
                { field_id: "fldUrl", field_name: "原文链接", type: 15 },
              ],
              has_more: false,
            },
          }),
        };
      },
    },
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    appToken: "baseTest",
    tableId: "tblTest",
    fields: [{ field_id: "fldTitle" }, { field_id: "fldUrl" }],
  });
  expect(urls).toHaveLength(1);
  expect(urls[0]).toContain("/fields");
  expect(repo.sources()).toHaveLength(0);
  expect(repo.listPublic().count).toBe(0);
});

it("rejects field reads before authorization, CSRF, or Feishu source validation", async () => {
  const repo = setup();
  let calls = 0;
  const options = {
    mode: "cloud" as const,
    user,
    repository: () => repo,
    environment: { ADMIN_GITHUB_IDS: "42" },
    fetcher: async () => {
      calls++;
      throw new Error("must not fetch");
    },
  };
  const body = {
    action: "source-fields",
    source: {
      id: "rss",
      name: "来源",
      kind: "rss",
      url: "https://example.com/feed",
      topics: ["AI 编程"],
    },
  };
  expect(
    (
      await handleDiscoveryAdminRequest(request(body), {
        ...options,
        user: null,
      })
    ).status,
  ).toBe(403);
  expect(
    (await handleDiscoveryAdminRequest(request(body, false), options)).status,
  ).toBe(403);
  expect(
    (await handleDiscoveryAdminRequest(request(body), options)).status,
  ).toBe(400);
  expect(calls).toBe(0);
});
