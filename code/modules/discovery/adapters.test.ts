import { afterEach, describe, expect, it } from "vitest";
import { openDiscoveryDatabase, type DiscoveryDatabase } from "./database";
import { DiscoveryRepository } from "./repository";
import { SourceAdapter, synchronizeSource } from "./adapters";
import { sourceSchema } from "./schema";
import {
  isPublicAddress,
  resolvePublicTarget,
  type PublicFetcher,
} from "./public-fetch";

const databases: DiscoveryDatabase[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});
const json = (url: string, value: unknown) => ({
  url,
  text: JSON.stringify(value),
  status: 200,
  contentType: "application/json",
});
const fields = [
  { field_id: "fldTitle", field_name: "新标题", type: 1 },
  { field_id: "fldUrl", field_name: "链接", type: 15 },
];
function feishu() {
  return sourceSchema.parse({
    id: "feishu",
    name: "飞书",
    kind: "feishu",
    url: "https://my.feishu.cn/base/test",
    appToken: "baseTest",
    tableId: "tblTest",
    tokenEnv: "TEST_FEISHU_TOKEN",
    mapping: { title: "fldTitle", url: "fldUrl" },
    topics: ["Harness Engineering"],
    enabled: true,
  });
}

describe("source adapters", () => {
  it("preserves Feishu checkbox source status independently from publication", async () => {
    const source = {
      ...feishu(),
      mapping: { ...feishu().mapping, sourceStatus: "fldStatus" },
    };
    const adapter = new SourceAdapter(
      source,
      async (url) =>
        json(url, {
          code: 0,
          data: {
            items: [
              {
                record_id: "recA",
                fields: {
                  新标题: "资料",
                  链接: "https://example.com/a",
                  同步状态: true,
                },
              },
            ],
            has_more: false,
          },
        }),
      { TEST_FEISHU_TOKEN: "private-test-token" },
    );
    const page = await adapter.page(null, [
      ...fields,
      { field_id: "fldStatus", field_name: "同步状态", type: 7 },
    ]);
    expect(page.records[0].sourceStatus).toBe("true");
  });
  it("resolves stable Feishu fields and passes cursors to record search", async () => {
    const requested: string[] = [];
    const fetcher: PublicFetcher = async (url, options) => {
      requested.push(url);
      expect(options?.headers?.authorization).toBe("Bearer private-test-token");
      if (url.includes("/fields"))
        return json(url, { code: 0, data: { items: fields, has_more: false } });
      expect(JSON.parse(options!.body!)).toMatchObject({
        field_names: ["新标题", "链接"],
        automatic_fields: true,
      });
      return json(url, {
        code: 0,
        data: {
          items: [
            {
              record_id: "recA",
              fields: {
                新标题: [{ text: "工程实践" }],
                链接: { link: "https://example.com/a" },
              },
              last_modified_time: 100,
            },
          ],
          has_more: true,
          page_token: "page-2",
        },
      });
    };
    const adapter = new SourceAdapter(feishu(), fetcher, {
      TEST_FEISHU_TOKEN: "private-test-token",
    });
    const schema = await adapter.fields();
    const page = await adapter.page("page-1", schema);
    expect(page).toMatchObject({
      records: [
        {
          recordId: "recA",
          title: "工程实践",
          url: "https://example.com/a",
          updatedAt: 100,
        },
      ],
      nextCursor: "page-2",
    });
    expect(requested[1]).toContain("page_token=page-1");
  });
  it("reads RSS, Atom, JSON and HTML fields without executing embedded markup", async () => {
    const base = {
      id: "source",
      name: "来源",
      url: "https://example.com/feed",
      topics: ["Harness Engineering"],
    };
    const rss = new SourceAdapter(
      sourceSchema.parse({ ...base, kind: "rss" }),
      async (url) => ({
        url,
        status: 200,
        contentType: "application/atom+xml",
        text: '<feed><entry><id>a</id><title>Harness</title><link href="/a"/><summary>&lt;p&gt;方法&lt;/p&gt;&lt;script&gt;secret&lt;/script&gt;</summary></entry></feed>',
      }),
    );
    expect((await rss.page(null)).records[0]).toMatchObject({
      url: "https://example.com/a",
      summary: "方法",
    });
    const html = new SourceAdapter(
      sourceSchema.parse({
        ...base,
        kind: "html",
        listPath: "article",
        mapping: { title: "h2" },
      }),
      async (url) => ({
        url,
        status: 200,
        contentType: "text/html",
        text: '<article><a href="/a"><h2>实践</h2></a><time datetime="2026-11-15"></time></article><a rel="next" href="?page=2">下一页</a>',
      }),
    );
    expect(await html.page(null)).toMatchObject({
      records: [{ title: "实践", url: "https://example.com/a" }],
      nextCursor: "https://example.com/feed?page=2",
    });
    const adapter = new SourceAdapter(
      sourceSchema.parse({
        ...base,
        kind: "json",
        listPath: "data.items",
        mapping: { title: "name" },
      }),
      async (url) =>
        json(url, {
          data: { items: [{ id: 1, name: "代码", url: "/a" }] },
          next: "?page=2",
        }),
    );
    expect((await adapter.page(null)).records[0].title).toBe("代码");
  });
  it("resumes a failed page and commits content with the checkpoint exactly once", async () => {
    const database = openDiscoveryDatabase(":memory:");
    databases.push(database);
    const repo = new DiscoveryRepository(database);
    const source = repo.saveSource(
      {
        id: "json",
        name: "分页",
        kind: "json",
        url: "https://example.com/feed",
        listPath: "items",
        topics: ["Harness Engineering"],
        enabled: true,
      },
      "admin",
    );
    repo.jobs.enqueue({
      key: "collect",
      kind: "collect",
      payload: { sourceId: source.id },
      priority: 1000,
    });
    let fail = true;
    const pages: string[] = [];
    const fetcher: PublicFetcher = async (url) => {
      pages.push(url);
      if (url.includes("page=2") && fail) throw new Error("temporary failure");
      return url.includes("page=2")
        ? json(url, { items: [{ id: "b", title: "第二页", url: "/b" }] })
        : json(url, {
            items: [{ id: "a", title: "第一页", url: "/a" }],
            next: "?page=2",
          });
    };
    const leased = repo.jobs.claim()!;
    await expect(synchronizeSource(repo, leased, fetcher)).rejects.toThrow();
    expect(JSON.parse(repo.jobs.get(leased.id)!.checkpoint).cursor).toContain(
      "page=2",
    );
    fail = false;
    await synchronizeSource(repo, repo.jobs.get(leased.id)!, fetcher);
    expect(pages.filter((url) => !url.includes("page=2"))).toHaveLength(1);
    expect(
      database.handle.prepare("SELECT COUNT(*) AS n FROM items").get(),
    ).toEqual({ n: 2 });
    expect(repo.jobs.get(leased.id)?.state).toBe("completed");
    expect(repo.sources()[0].last_success_at).not.toBeNull();
  });
});

describe("public-source network boundaries", () => {
  it("rejects loopback, mapped private IPs, metadata services and non-public DNS answers", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "fe80::1",
      "100.64.0.1",
      "192.0.2.1",
    ])
      expect(isPublicAddress(address), address).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    await expect(
      resolvePublicTarget(new URL("https://127.0.0.1/")),
    ).rejects.toThrow("unsafe-address");
    await expect(
      resolvePublicTarget(new URL("file:///etc/passwd")),
    ).rejects.toThrow("unsafe-url");
    await expect(
      resolvePublicTarget(new URL("https://user:pass@example.com")),
    ).rejects.toThrow("unsafe-url");
  });
});
