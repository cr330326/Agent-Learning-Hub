import { readFile } from "node:fs/promises";
import { check, format, resolveConfig } from "prettier";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadContentCatalogFromDirectory,
  getDefaultContentRoot,
} from "../catalog/catalog-api";
import { openDiscoveryDatabase, type DiscoveryDatabase } from "./database";
import { DiscoveryRepository } from "./repository";
import {
  CurationGitHub,
  createCurationPullRequest,
  proposeLearningItem,
  refreshCuration,
  type GitHubAppConfig,
} from "./curation";

const databases: DiscoveryDatabase[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});
const config: GitHubAppConfig = {
  appId: "1",
  installationId: "1",
  privateKey: "unused-test-key",
  owner: "owner",
  repo: "hub",
  base: "main",
};
describe("curated learning intake", () => {
  it("validates current catalog, makes one atomic tree, reuses a PR and derives live status from the runtime catalog", async () => {
    const db = openDiscoveryDatabase(":memory:");
    databases.push(db);
    const repo = new DiscoveryRepository(db);
    const source = repo.saveSource(
      {
        id: "test",
        name: "测试",
        kind: "json",
        url: "https://example.com/feed",
        topics: ["Harness Engineering"],
      },
      "admin",
    );
    repo.ingestPage(
      source,
      [
        {
          recordId: "a",
          title: "工程教程",
          url: "https://example.com/unique-engineering-guide",
          summary: "工程实践",
        },
      ],
      "run",
    );
    const item = db.handle
      .prepare("SELECT id,pending_version FROM items")
      .get() as { id: string; pending_version: string };
    repo.publishVersion(item.pending_version, "admin");
    const input = {
      itemId: item.id,
      learningId: "new-engineering-guide",
      stageIds: ["stage-3"],
      track: "aicoding" as const,
      reason: "具备可复现评测",
      prerequisites: "Agent 基础",
    };
    const proposalId = proposeLearningItem(repo, input, "admin");
    const client = new CurationGitHub(config);
    const catalog = await loadContentCatalogFromDirectory(
      getDefaultContentRoot(),
    );
    const courses = JSON.parse(
      await readFile("content/courses/courses.json", "utf8"),
    );
    const stages = JSON.parse(
      await readFile("content/stages/stages.json", "utf8"),
    );
    vi.spyOn(client, "document").mockImplementation(async (path) =>
      path.includes("courses") ? courses : stages,
    );
    vi.spyOn(client, "optional").mockResolvedValue(null);
    let created = false;
    let merged = false;
    let treeBody: unknown;
    const pr = {
      number: 1,
      html_url: "https://github.com/owner/hub/pull/1",
      state: "open",
    };
    const api = vi
      .spyOn(client, "request")
      .mockImplementation(async (path, body) => {
        if (path.startsWith("pulls?")) return created ? [pr] : [];
        if (path.startsWith("git/ref/")) return { object: { sha: "base-sha" } };
        if (path === "git/commits/base-sha")
          return { tree: { sha: "base-tree" } };
        if (path === "git/trees") {
          treeBody = body;
          return { sha: "new-tree" };
        }
        if (path === "git/commits") return { sha: "new-commit" };
        if (path === "git/refs") return { ref: "created" };
        if (path === "pulls") {
          created = true;
          return pr;
        }
        if (path === "pulls/1")
          return { merged, state: merged ? "closed" : "open" };
        throw new Error(`Unexpected endpoint ${path}`);
      });
    await createCurationPullRequest(repo, proposalId, {
      client,
      config,
      catalog,
    });
    await createCurationPullRequest(repo, proposalId, {
      client,
      config,
      catalog,
    });
    expect(api.mock.calls.filter(([path]) => path === "pulls")).toHaveLength(1);
    const tree = treeBody as {
      base_tree: string;
      tree: { path: string; content: string }[];
    };
    expect(tree.base_tree).toBe("base-tree");
    expect(tree.tree).toHaveLength(2);
    const baseCourses = await format(JSON.stringify(courses, null, 2), {
      ...(await resolveConfig("content/courses/courses.json")),
      parser: "json",
    });
    expect(
      tree.tree[0].content.startsWith(
        baseCourses.slice(0, baseCourses.lastIndexOf("\n]")),
      ),
    ).toBe(true);
    for (const file of tree.tree) {
      expect(
        await check(file.content, {
          ...(await resolveConfig("content/courses/courses.json")),
          filepath: file.path,
        }),
        file.path,
      ).toBe(true);
    }
    const nextCourses = JSON.parse(tree.tree[0].content);
    expect(nextCourses.at(-1)).toMatchObject({
      id: input.learningId,
      sourceUrl: "https://example.com/unique-engineering-guide",
      stageIds: ["stage-3"],
    });
    expect(
      JSON.parse(tree.tree[1].content).find(
        (doc: { stage: { id: string } }) => doc.stage.id === "stage-3",
      ).stage.learningItemIds,
    ).toContain(input.learningId);
    merged = true;
    await refreshCuration(repo, proposalId, catalog, client);
    expect(db.handle.prepare("SELECT state FROM proposals").get()).toEqual({
      state: "merged-unreleased",
    });
    await refreshCuration(
      repo,
      proposalId,
      { ...catalog, items: [...catalog.items, nextCourses.at(-1)] },
      client,
    );
    expect(db.handle.prepare("SELECT state FROM proposals").get()).toEqual({
      state: "live",
    });
  });
});
