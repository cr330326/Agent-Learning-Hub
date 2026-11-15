import { afterEach, describe, expect, it } from "vitest";
import { openDiscoveryDatabase, type DiscoveryDatabase } from "./database";
import { DiscoveryRepository, canonicalUrl } from "./repository";
import { type SourceRecord, type SummaryOutput } from "./schema";

const stores: DiscoveryDatabase[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
function setup() {
  const database = openDiscoveryDatabase(":memory:");
  stores.push(database);
  let time = Date.parse("2026-11-15T00:30:00Z");
  const repo = new DiscoveryRepository(database, () => time);
  const source = repo.saveSource(
    {
      id: "test",
      name: "工程信源",
      kind: "json",
      url: "https://example.com/feed",
      topics: ["Harness Engineering"],
      publicationMode: "auto",
    },
    "admin",
  );
  return {
    repo,
    source,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
const record: SourceRecord = {
  recordId: "one",
  title: "Harness 工程实践",
  url: "https://example.com/a?utm_source=feed#part",
  publishedAt: "2026-11-15T00:00:00Z",
  summary: "包含代码及可复现评测的工程实践。",
};
const output: SummaryOutput = {
  title: "Harness 工程实践",
  summary: "使用隔离工作区与评测验证 Agent 的执行结果。",
  reason: "提供可复现代码与评测方法。",
  topics: ["Harness Engineering"],
  scores: { actionability: 5, verifiability: 5, relevance: 5, impact: 3 },
  scoreReasons: {
    actionability: "有实现步骤",
    verifiability: "有代码与评测",
    relevance: "聚焦 Harness",
    impact: "工程应用",
  },
};
function firstItem(repo: DiscoveryRepository) {
  return repo.database.handle
    .prepare(
      "SELECT id,pending_version FROM items ORDER BY first_seen_at LIMIT 1",
    )
    .get() as { id: string; pending_version: string };
}

describe("discovery ingestion and publication", () => {
  it("normalizes platform identities while preserving document selectors", () => {
    expect(canonicalUrl(record.url)).toBe("https://example.com/a#part");
    expect(canonicalUrl("https://example.com/a?chapter=2#part")).toBe(
      "https://example.com/a?chapter=2#part",
    );
    expect(canonicalUrl("https://youtu.be/abcdefghijk?t=30")).toBe(
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
    expect(() => canonicalUrl("javascript:alert(1)")).toThrow();
  });
  it("deduplicates pages and multi-source URLs, isolates metric changes and preserves manual corrections", () => {
    const { repo, source, advance } = setup();
    expect(repo.ingestPage(source, [record], "run-1")).toEqual({
      added: 1,
      updated: 0,
    });
    const item = firstItem(repo);
    repo.saveOutput(item.pending_version, "ready", output, "test-v1");
    repo.publishVersion(item.pending_version, "worker");
    const second = repo.saveSource(
      { ...source, id: "second", name: "另一信源" },
      "admin",
    );
    expect(
      repo.ingestPage(
        second,
        [{ ...record, url: "https://example.com/a#part" }],
        "run-2",
      ),
    ).toEqual({ added: 0, updated: 0 });
    advance(1);
    expect(
      repo.ingestPage(source, [{ ...record, metrics: { views: 12 } }], "run-3"),
    ).toEqual({ added: 0, updated: 0 });
    expect(repo.publicItem(item.id)?.sources).toHaveLength(2);
    expect(repo.publicItem(item.id)?.metrics[0].values).toEqual({ views: 12 });
    repo.correct(item.id, { summary: "维护者更正摘要" }, "admin");
    repo.ingestPage(source, [{ ...record, title: "原文更新" }], "run-4");
    expect(repo.item(item.id)?.pending_version).not.toBe(item.pending_version);
    expect(repo.publicItem(item.id)?.summary).toBe("维护者更正摘要");
    expect(repo.publicItem(item.id)?.title).toBe(output.title);
  });
  it("rolls back an entire page when its cursor cannot commit under a live lease", () => {
    const { repo, source, advance } = setup();
    repo.jobs.enqueue({
      key: "sync",
      kind: "collect",
      payload: { sourceId: source.id },
      priority: 1000,
    });
    const job = repo.jobs.claim(10)!;
    advance(11);
    expect(() =>
      repo.ingestPage(source, [record], "run", {
        job,
        checkpoint: { page: 2 },
      }),
    ).toThrow();
    expect(
      repo.database.handle.prepare("SELECT COUNT(*) AS n FROM items").get(),
    ).toEqual({ n: 0 });
    expect(repo.jobs.get(job.id)?.checkpoint).toBe("{}");
  });
  it("retains a published item across missing or confirmed-deleted source records", () => {
    const { repo, source } = setup();
    repo.ingestPage(source, [record], "run");
    const item = firstItem(repo);
    repo.publishVersion(item.pending_version, "admin");
    repo.finishSync(source, "next-run", true);
    expect(
      repo.database.handle.prepare("SELECT state FROM source_records").get(),
    ).toEqual({ state: "unverified-missing" });
    repo.confirmDeleted(source.id, record.recordId, "admin");
    expect(repo.publicItem(item.id)?.title).toBe(record.title);
    repo.setPublication(item.id, "withdrawn", "admin");
    expect(repo.listPublic().count).toBe(0);
    expect(repo.publicItem(item.id)).toMatchObject({
      withdrawn: true,
      summary: "",
      title: "该资讯已撤下",
    });
  });
  it("imports older metadata for search, excludes it from new daily editions and uses bounded pages", () => {
    const { repo, source } = setup();
    const records = Array.from({ length: 26 }, (_, index) => ({
      ...record,
      recordId: `old-${index}`,
      url: `https://example.com/${index}`,
      publishedAt: "2025-01-01T00:00:00Z",
    }));
    repo.ingestPage(source, records, "history", { historical: true });
    expect(repo.jobs.list()).toHaveLength(0);
    expect(repo.listPublic({ query: "Harness" })).toMatchObject({
      count: 26,
      page: 1,
    });
    expect(repo.listPublic().items).toHaveLength(24);
    expect(repo.listPublic({ page: 2 }).items).toHaveLength(2);
    expect(repo.listPublic({ topic: "<script>" }).count).toBe(26);
    expect(repo.createEdition("2026-11-15")).toBeNull();
  });
  it("freezes the effective editorial fields before publication and isolates later changes", () => {
    const { repo, source, advance } = setup();
    repo.ingestPage(source, [record], "run");
    const item = firstItem(repo);
    repo.saveOutput(item.pending_version, "ready", output, "test");
    repo.publishVersion(item.pending_version, "worker");
    const corrected = {
      title: "冻结前更正标题",
      summary: "冻结前已核实的摘要",
      reason: "冻结前已核实的推荐理由",
      topics: ["Agent 架构"],
    };
    repo.correct(item.id, corrected, "admin");
    advance(30 * 60_000);
    const edition = repo.createEdition("2026-11-15")!;
    expect(
      repo.publicItem(item.id, edition.entries[0].versionId),
    ).toMatchObject(corrected);
    repo.correct(
      item.id,
      { title: "出刊后的新标题", summary: "出刊后的新摘要" },
      "admin",
    );
    repo.saveOutput(
      item.pending_version,
      "ready",
      {
        ...output,
        summary: "模型重算摘要",
        scores: { ...output.scores, impact: 5 },
      },
      "test-next",
    );
    expect(repo.publicItem(item.id)?.summary).toBe("出刊后的新摘要");
    expect(
      repo.publicItem(item.id, edition.entries[0].versionId),
    ).toMatchObject({ ...corrected, score: 43 });
    repo.saveOutput(
      item.pending_version,
      "model-not-configured",
      null,
      "test-failure",
    );
    expect(
      repo.publicItem(item.id, edition.entries[0].versionId),
    ).toMatchObject({ ...corrected, score: 43, processingState: "ready" });
    expect(repo.createEdition("2026-11-15")).toEqual(edition);
    repo.setPublication(item.id, "withdrawn", "admin");
    expect(
      repo.publicItem(item.id, edition.entries[0].versionId),
    ).toMatchObject({
      title: "该资讯已撤下",
      summary: "",
      reason: "",
      topics: [],
    });
  });
  it("allows updated editions but does not reissue an already frozen source version", () => {
    const { repo, source, advance } = setup();
    repo.ingestPage(source, [record], "first");
    const item = firstItem(repo);
    repo.saveOutput(item.pending_version, "ready", output, "test");
    repo.publishVersion(item.pending_version, "worker");
    advance(30 * 60_000);
    expect(repo.createEdition("2026-11-15")?.entries).toHaveLength(1);
    advance(86_400_000);
    repo.ingestPage(
      source,
      [{ ...record, summary: "新增可复现评测和实现代码" }],
      "updated",
    );
    const updated = repo.item(item.id)!.pending_version!;
    repo.saveOutput(
      updated,
      "ready",
      {
        ...output,
        summary: "新增可复现评测和实现代码",
        reason: "新增的可复现评测支持重新推荐",
      },
      "test",
    );
    repo.publishVersion(updated, "worker");
    expect(repo.createEdition("2026-11-16")?.entries).toHaveLength(1);
    advance(86_400_000);
    repo.publishVersion(item.pending_version, "admin");
    expect(repo.previewEdition("2026-11-17").candidates).toHaveLength(0);
    expect(repo.createEdition("2026-11-17")?.entries).toEqual([]);
  });
  it("reads legacy edition entries without applying current editorial corrections", () => {
    const { repo, source } = setup();
    repo.ingestPage(source, [record], "run");
    const item = firstItem(repo);
    repo.saveOutput(item.pending_version, "ready", output, "test");
    repo.publishVersion(item.pending_version, "worker");
    repo.database.handle
      .prepare("INSERT INTO editions VALUES (?,?,?,?)")
      .run(
        "2026-11-14",
        1,
        JSON.stringify([{ id: item.id, versionId: item.pending_version }]),
        1,
      );
    repo.correct(item.id, { summary: "当前更正不回填旧期" }, "admin");
    expect(repo.publicItem(item.id, item.pending_version)?.summary).toBe(
      output.summary,
    );
    expect(repo.isEditionVersion(item.id, item.pending_version)).toBe(true);
  });
  it("freezes editions and resolves withdrawn references without leaking their summary", () => {
    const { repo, source, advance } = setup();
    repo.ingestPage(source, [record], "run");
    const item = firstItem(repo);
    repo.saveOutput(item.pending_version, "ready", output, "test");
    repo.publishVersion(item.pending_version, "worker");
    advance(30 * 60_000);
    const edition = repo.createEdition("2026-11-15")!;
    expect(edition.entries).toEqual([
      {
        id: item.id,
        versionId: item.pending_version,
        snapshot: {
          title: output.title,
          summary: output.summary,
          reason: output.reason,
          topics: output.topics,
          score: 43,
          processingState: "ready",
        },
      },
    ]);
    repo.correct(item.id, { summary: "更正后摘要" }, "admin");
    expect(repo.publicItem(item.id)?.summary).toBe("更正后摘要");
    expect(
      repo.publicItem(item.id, edition.entries[0].versionId)?.summary,
    ).toBe(output.summary);
    expect(repo.createEdition("2026-11-15")).toEqual(edition);
    repo.setPublication(item.id, "withdrawn", "admin");
    expect(
      repo.publicItem(item.id, edition.entries[0].versionId)?.summary,
    ).toBe("");
  });
});

it("previews, orders and freezes an eligible daily selection, with a cutoff and limit", () => {
  const { repo, source, advance } = setup();
  repo.ingestPage(
    source,
    [
      record,
      {
        ...record,
        recordId: "two",
        url: "https://example.com/two",
        title: "第二份工程实践",
      },
    ],
    "run",
  );
  const items = repo.database.handle
    .prepare("SELECT id,pending_version FROM items")
    .all() as { id: string; pending_version: string }[];
  for (const item of items) {
    repo.saveOutput(item.pending_version, "ready", output, "test");
    repo.publishVersion(item.pending_version, "admin");
  }
  const preview = repo.previewEdition("2026-11-15");
  expect(preview.locked).toBe(false);
  expect(preview.candidates).toHaveLength(2);
  expect(() =>
    repo.saveEditionDraft(preview.day, ["unknown"], "admin"),
  ).toThrow();
  expect(() =>
    repo.saveEditionDraft(preview.day, [items[0].id, items[0].id], "admin"),
  ).toThrow();
  const selected = [...preview.selectedIds].reverse();
  repo.saveEditionDraft(preview.day, selected, "admin");
  expect(repo.previewEdition(preview.day)).toMatchObject({
    selectedIds: selected,
    custom: true,
  });
  repo.saveEditionDraft(preview.day, null, "admin");
  expect(repo.previewEdition(preview.day).custom).toBe(false);
  repo.saveEditionDraft(preview.day, selected, "admin");
  advance(30 * 60000);
  expect(
    repo.createEdition(preview.day)?.entries.map((entry) => entry.id),
  ).toEqual(selected);
  expect(() => repo.saveEditionDraft(preview.day, [], "admin")).toThrow("截止");
  expect(
    repo.createEdition(preview.day)?.entries.map((entry) => entry.id),
  ).toEqual(selected);
});

it("does not reenter a later edition when only model output changes", () => {
  const { repo, source, advance } = setup();
  repo.ingestPage(source, [record], "run");
  const item = firstItem(repo);
  repo.saveOutput(item.pending_version, "ready", output, "prompt-1");
  repo.publishVersion(item.pending_version, "worker");
  const publishedAt = repo.item(item.id)!.published_at;
  advance(30 * 60000);
  expect(repo.createEdition("2026-11-15")?.entries).toHaveLength(1);
  advance(23 * 3600000);
  const original = repo.version(item.pending_version)!;
  repo.database.handle
    .prepare(
      "INSERT INTO item_versions(id,item_id,content_hash,input,created_at) VALUES (?,?,?,?,?)",
    )
    .run(
      "review-output-only",
      item.id,
      original.content_hash + ":review",
      original.input,
      Date.now(),
    );
  repo.saveOutput(
    "review-output-only",
    "ready",
    { ...output, reason: "重新评估后的工程价值理由。" },
    "prompt-2",
  );
  repo.publishVersion("review-output-only", "admin");
  expect(repo.item(item.id)!.published_at).toBe(publishedAt);
  advance(3600000);
  expect(repo.createEdition("2026-11-16")?.entries).toHaveLength(0);
});

it("keeps low-evidence material out of daily selections even when the edition is not full", () => {
  const { repo, source } = setup();
  const profiles = [
    {
      id: "harness",
      scores: { actionability: 5, verifiability: 4, relevance: 5, impact: 5 },
      eligible: true,
    },
    {
      id: "patterns",
      scores: { actionability: 5, verifiability: 3, relevance: 5, impact: 5 },
      eligible: true,
    },
    {
      id: "context",
      scores: { actionability: 4, verifiability: 4, relevance: 5, impact: 4 },
      eligible: true,
    },
    {
      id: "unevidenced",
      scores: { actionability: 3, verifiability: 1, relevance: 5, impact: 2 },
      eligible: false,
    },
    {
      id: "marketing",
      scores: { actionability: 1, verifiability: 0, relevance: 4, impact: 1 },
      eligible: false,
    },
    {
      id: "important-update",
      scores: { actionability: 1, verifiability: 3, relevance: 5, impact: 4 },
      eligible: true,
    },
    {
      id: "off-topic",
      scores: { actionability: 5, verifiability: 5, relevance: 0, impact: 5 },
      eligible: false,
    },
    {
      id: "practice-boundary",
      scores: { actionability: 3, verifiability: 3, relevance: 3, impact: 3 },
      eligible: true,
    },
    {
      id: "below-boundary",
      scores: { actionability: 3, verifiability: 3, relevance: 3, impact: 2 },
      eligible: false,
    },
  ];
  const ids: { id: string; eligible: boolean }[] = [];
  for (const profile of profiles) {
    repo.ingestPage(
      source,
      [
        {
          ...record,
          recordId: profile.id,
          url: `https://example.com/${profile.id}`,
        },
      ],
      "run",
    );
    const item = repo.database.handle
      .prepare("SELECT id,pending_version FROM items WHERE canonical_url=?")
      .get(`https://example.com/${profile.id}`) as {
      id: string;
      pending_version: string;
    };
    repo.saveOutput(
      item.pending_version,
      "ready",
      { ...output, scores: profile.scores },
      "calibration-fixture",
    );
    repo.publishVersion(item.pending_version, "admin");
    ids.push({ id: item.id, eligible: profile.eligible });
  }
  const preview = repo.previewEdition("2026-11-15");
  expect(new Set(preview.selectedIds)).toEqual(
    new Set(ids.filter((x) => x.eligible).map((x) => x.id)),
  );
  expect(repo.listPublic().count).toBe(profiles.length);
  expect(() =>
    repo.saveEditionDraft(
      preview.day,
      [ids.find((x) => !x.eligible)!.id],
      "admin",
    ),
  ).toThrow();
});
