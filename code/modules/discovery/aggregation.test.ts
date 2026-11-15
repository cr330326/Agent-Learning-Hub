import { afterEach, expect, it } from "vitest";
import { openDiscoveryDatabase, type DiscoveryDatabase } from "./database";
import { DiscoveryRepository } from "./repository";
import { GitHubResults, parseGitHubResults } from "./github-results";

const stores: DiscoveryDatabase[] = [];
afterEach(() => stores.splice(0).forEach((store) => store.close()));
function setup() {
  const database = openDiscoveryDatabase(":memory:");
  stores.push(database);
  const repo = new DiscoveryRepository(database);
  const source = repo.saveSource(
    {
      id: "primary",
      name: "Primary",
      kind: "json",
      url: "https://example.com/feed",
      topics: ["AI 编程"],
      publicationMode: "auto",
      aggregation: true,
      priority: 100,
    },
    "test",
  );
  return { repo, source };
}
const record = {
  recordId: "stable",
  title: "Primary title",
  summary: "Source summary",
  url: "https://example.com/a",
};

it("publishes source metadata immediately and preserves identity across URL revisions", () => {
  const { repo, source } = setup();
  repo.ingestPage(source, [record], "one");
  const item = repo.listPublic().items[0];
  expect(item.summary).toBe(record.summary);
  expect(repo.jobs.list()).toHaveLength(0);
  repo.ingestPage(
    source,
    [{ ...record, metrics: { views: 10 } }],
    "metrics-one",
  );
  repo.ingestPage(
    source,
    [{ ...record, metrics: { views: 10 } }],
    "metrics-two",
  );
  expect(
    repo.database.handle
      .prepare("SELECT COUNT(*) n FROM metric_observations")
      .get(),
  ).toEqual({ n: 1 });
  repo.ingestPage(
    source,
    [{ ...record, url: "https://example.com/corrected" }],
    "two",
  );
  expect(repo.listPublic().items).toHaveLength(1);
  expect(repo.publicItem(item.id)?.url).toBe("https://example.com/corrected");
  const second = repo.saveSource(
    { ...source, id: "secondary", priority: 10 },
    "test",
  );
  repo.ingestPage(
    second,
    [
      {
        ...record,
        recordId: "other",
        url: "https://example.com/corrected",
        title: "Secondary title",
      },
    ],
    "three",
  );
  expect(repo.listPublic().count).toBe(1);
  expect(repo.publicItem(item.id)?.title).toBe(record.title);
  expect(repo.publicItem(item.id)?.sources).toHaveLength(2);
  expect(repo.item(item.id)?.pending_version).toBeNull();
  repo.setPublication(item.id, "withdrawn", "test");
  repo.ingestPage(source, [{ ...record, title: "Updated" }], "four");
  expect(repo.publicItem(item.id)?.withdrawn).toBe(true);
});

it("keeps the newest GitHub observation when importing older result files", () => {
  const { repo, source } = setup();
  const github = repo.saveSource(
    {
      ...source,
      id: "github",
      kind: "github",
      url: "https://github.com/owner/repo",
    },
    "test",
  );
  repo.ingestPage(github, [{ ...record, updatedAt: 200 }], "new");
  repo.ingestPage(github, [{ ...record, title: "Old", updatedAt: 100 }], "old");
  expect(repo.listPublic().items[0].title).toBe(record.title);
});

it("aggregates result groups and counts malformed external links", () => {
  const page = parseGitHubResults(
    {
      videos: [
        {
          title: "Video",
          url: "https://youtube.com/watch?v=abc",
          channel: "Author",
          views: 20,
        },
        { title: "Invalid", url: "javascript:alert(1)" },
      ],
      all_candidates: [
        { title: "Intermediate", url: "https://example.com/ignored" },
      ],
    },
    "memory/daily/youtube-skill-videos-2026-11-15.json",
    "a".repeat(40),
  );
  expect(page.records).toHaveLength(2);
  expect(page.rejected).toBe(1);
  expect(page.records[0].provenance?.path).toContain("youtube-skill-videos");
  expect(
    parseGitHubResults(
      {
        ranked_top10: [
          {
            视频标题: "旧格式视频",
            YouTube链接: "https://youtube.com/watch?v=old",
            频道: "作者",
          },
        ],
      },
      "youtube-skill-videos",
      "a".repeat(40),
    ).records[0],
  ).toMatchObject({ title: "旧格式视频", author: "作者" });
  expect(
    parseGitHubResults(
      { repos: [{ repo: "owner/repo", url: "https://github.com/owner/repo" }] },
      "github-skill-repos",
      "a".repeat(40),
    ).records,
  ).toHaveLength(1);
  expect(
    parseGitHubResults(
      {
        skills: [
          {
            name: "Skill",
            skill_link: "https://clawhub.ai/owner/skills/skill",
          },
        ],
      },
      "clawhub-skills",
      "a".repeat(40),
    ).records,
  ).toHaveLength(1);
  expect(
    parseGitHubResults(
      [{ title: "旧格式视频", bvid: "BV1234567890" }],
      "bilibili-harness-engineering",
      "a".repeat(40),
    ).records[0].url,
  ).toBe("https://www.bilibili.com/video/BV1234567890");
  expect(
    parseGitHubResults(
      {
        repos: [
          {
            repo_name: "owner/repo",
            github_url: "https://github.com/owner/repo",
          },
        ],
      },
      "github-skill-repos",
      "a".repeat(40),
    ).records,
  ).toHaveLength(1);
  expect(
    parseGitHubResults(
      {
        records: [
          {
            skill_name: "旧格式 Skill",
            skill_url: "https://clawhub.ai/skills/skill",
          },
        ],
      },
      "clawhub-skills",
      "a".repeat(40),
    ).records,
  ).toHaveLength(1);
  expect(
    parseGitHubResults(
      {
        skills: {
          highlighted: [
            { name: "Skill", link: "https://clawhub.ai/skills/skill" },
          ],
        },
      },
      "clawhub-skills",
      "a".repeat(40),
    ).records,
  ).toHaveLength(1);
});

it("records a malformed historical file and continues importing valid files", async () => {
  const { repo, source } = setup();
  const github = repo.saveSource(
    {
      ...source,
      id: "github-invalid",
      kind: "github",
      url: "https://github.com/owner/repo",
      tokenEnv: "TEST_TOKEN",
    },
    "test",
  );
  const commit = "a".repeat(40);
  const invalid = "b".repeat(40);
  const adapter = new GitHubResults(
    github,
    async (url) => {
      const value = url.endsWith("commits/HEAD")
        ? { sha: commit }
        : url.includes("git/trees")
          ? {
              sha: commit,
              truncated: false,
              tree: [
                {
                  path: "harness_engineering_youtube_results.json",
                  type: "blob",
                  sha: commit,
                },
                {
                  path: "harness_engineering_youtube_videos.json",
                  type: "blob",
                  sha: invalid,
                },
              ],
            }
          : {
              encoding: "base64",
              content: Buffer.from(
                url.endsWith(invalid)
                  ? "# Empty collection report"
                  : JSON.stringify([record]),
              ).toString("base64"),
            };
      return {
        url,
        status: 200,
        text: JSON.stringify(value),
        contentType: "application/json",
      };
    },
    { TEST_TOKEN: "token" },
  );
  const page = await adapter.page(null, repo);
  expect(page.records).toHaveLength(1);
  expect(page.rejected).toBe(1);
  repo.ingestPage(github, page.records, "run");
  adapter.savePage(repo);
  expect(
    repo.database.handle
      .prepare("SELECT error_code FROM github_result_files WHERE sha=?")
      .get(invalid),
  ).toEqual({ error_code: "invalid-result-json" });
});

it("reads allowlisted result blobs and skips successfully imported unchanged files", async () => {
  const { repo, source } = setup();
  const github = repo.saveSource(
    {
      ...source,
      id: "github",
      kind: "github",
      url: "https://github.com/owner/repo",
      tokenEnv: "TEST_TOKEN",
    },
    "test",
  );
  const sha = "a".repeat(40);
  const calls: string[] = [];
  const adapter = () =>
    new GitHubResults(
      github,
      async (url, options) => {
        expect(options?.headers?.authorization).toBe("Bearer token");
        calls.push(url);
        const data = url.endsWith("commits/HEAD")
          ? { sha }
          : url.includes("git/trees")
            ? {
                sha,
                truncated: false,
                tree: [
                  {
                    path: "harness_engineering_youtube_results.json",
                    type: "blob",
                    sha,
                  },
                  { path: "memory/private.json", type: "blob", sha },
                ],
              }
            : {
                encoding: "base64",
                content: Buffer.from(JSON.stringify([record])).toString(
                  "base64",
                ),
              };
        return {
          url,
          status: 200,
          contentType: "application/json",
          text: JSON.stringify(data),
        };
      },
      { TEST_TOKEN: "token" },
    );
  const first = adapter();
  const page = await first.page(null, repo);
  repo.ingestPage(github, page.records, "first");
  first.savePage(repo);
  expect((await adapter().page(null, repo)).records).toHaveLength(0);
  expect(calls.filter((url) => url.includes("git/blobs"))).toHaveLength(1);
});
