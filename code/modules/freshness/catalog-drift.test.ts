import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { LearningItem } from "../catalog/content-schema";
import {
  applyMovedPaths,
  buildBlobUrl,
  buildCatalogDriftReport,
  classifyMissingPaths,
  findCandidates,
  findUncataloguedRepositories,
  indexLocalMaterial,
  toWebBaseUrl,
} from "./catalog-drift";
import type { GitRunner } from "./materials-check";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createLibrary(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-learning-hub-drift-"));
  temporaryRoots.push(root);
  for (const file of files) {
    const absolute = join(root, file);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, "# fixture\n");
  }

  return root;
}

function item(overrides: Partial<LearningItem>): LearningItem {
  return {
    id: "item",
    title: "Item",
    track: "agentic",
    stageIds: [],
    summary: "Summary",
    learningGoals: [],
    sourceUrl: null,
    localPath: null,
    accessPolicy: "local-preferred",
    publicationRights: "third-party",
    author: "Unknown",
    license: "Unknown",
    licenseStatus: "unknown",
    tags: [],
    lastReviewedAt: null,
    references: [],
    unavailableReason: null,
    ...overrides,
  } as LearningItem;
}

const noGit: GitRunner = async () => ({
  code: 1,
  stdout: "",
  stderr: "not a repository",
});

describe("catalog drift", () => {
  it("narrows same-named files down to the longest shared path tail", async () => {
    const root = await createLibrary([
      "Agentic/Harness/deepagents/README.md",
      "Agentic/Harness/smolagents/README.md",
      "Learning/other/README.md",
    ]);
    const index = await indexLocalMaterial(root);

    expect(findCandidates("Agentic/Old/deepagents/README.md", index)).toEqual([
      "Agentic/Harness/deepagents/README.md",
    ]);
  });

  it("treats a directory move as moved once several paths agree on it", async () => {
    const root = await createLibrary([
      "Agentic/Harness/books/chapter-01.md",
      "Agentic/Harness/books/chapter-02.md",
    ]);
    const index = await indexLocalMaterial(root);

    const findings = classifyMissingPaths(
      new Map([
        ["Agentic/Document/books/chapter-01.md", ["a"]],
        ["Agentic/Document/books/chapter-02.md", ["b"]],
      ]),
      index,
    );

    expect(findings.map(({ kind }) => kind)).toEqual(["moved", "moved"]);
    expect(findings.map(({ proposedPath }) => proposedPath)).toEqual([
      "Agentic/Harness/books/chapter-01.md",
      "Agentic/Harness/books/chapter-02.md",
    ]);
  });

  it("refuses a lone confident match that no other path corroborates", async () => {
    // The real case this guard exists for: langchain was deleted, and its
    // libs/README.md matched DeepAgents' libs/README.md uniquely. Applying that
    // would point a LangChain entry at another project's file with no error
    // anywhere — worse than leaving the entry broken.
    const root = await createLibrary([
      "Agentic/Harness/deepagents/libs/README.md",
      "Agentic/Harness/deepagents/AGENTS.md",
      "Agentic/Harness/deepagents/README.md",
    ]);
    const index = await indexLocalMaterial(root);

    const findings = classifyMissingPaths(
      new Map([["Agentic/Old/langchain/libs/README.md", ["a"]]]),
      index,
    );

    expect(findings[0]).toMatchObject({
      kind: "uncertain",
      proposedPath: null,
      candidateCount: 1,
    });
  });

  it("does not let a path with many candidates vouch for a rewrite", async () => {
    // A path matching every AGENTS.md in the library knows nothing about where
    // it went; letting it vote lets volume corroborate any rewrite at all.
    const root = await createLibrary([
      "Agentic/Harness/deepagents/libs/README.md",
      "Agentic/Harness/deepagents/AGENTS.md",
      "Agentic/Harness/other/AGENTS.md",
      "Learning/third/AGENTS.md",
    ]);
    const index = await indexLocalMaterial(root);

    const findings = classifyMissingPaths(
      new Map([
        ["Agentic/Old/langchain/libs/README.md", ["a"]],
        ["Agentic/Old/langchain/AGENTS.md", ["b"]],
      ]),
      index,
    );

    expect(findings.every(({ kind }) => kind === "uncertain")).toBe(true);
  });

  it("reports a path as gone when nothing on disk carries the name", async () => {
    const root = await createLibrary(["Agentic/Harness/keep.md"]);
    const index = await indexLocalMaterial(root);

    const findings = classifyMissingPaths(
      new Map([["Agentic/Old/vanished.md", ["a"]]]),
      index,
    );

    expect(findings[0]).toMatchObject({
      kind: "gone",
      candidateCount: 0,
      proposedPath: null,
    });
  });

  it("rewrites only corroborated moves, across items and their chapters", () => {
    const items = [
      {
        id: "one",
        localPath: "Agentic/Document/a.md",
        references: [
          { label: "chapter", localPath: "Agentic/Document/b.md" },
          { label: "kept", localPath: "Agentic/Old/uncertain.md" },
        ],
      },
      { id: "two", localPath: "Learning/untouched.md", references: [] },
    ];

    const applied = applyMovedPaths(items, {
      missingPaths: [
        {
          localPath: "Agentic/Document/a.md",
          itemIds: ["one"],
          kind: "moved",
          proposedPath: "Agentic/Harness/a.md",
          candidateCount: 1,
          candidateSample: [],
        },
        {
          localPath: "Agentic/Document/b.md",
          itemIds: ["one"],
          kind: "moved",
          proposedPath: "Agentic/Harness/b.md",
          candidateCount: 1,
          candidateSample: [],
        },
        {
          localPath: "Agentic/Old/uncertain.md",
          itemIds: ["one"],
          kind: "uncertain",
          proposedPath: null,
          candidateCount: 3,
          candidateSample: [],
        },
      ],
    });

    expect(applied).toMatchObject({ rewrittenPaths: 2, rewrittenItems: 1 });
    expect(applied.items[0]).toMatchObject({
      localPath: "Agentic/Harness/a.md",
      references: [
        { label: "chapter", localPath: "Agentic/Harness/b.md" },
        { label: "kept", localPath: "Agentic/Old/uncertain.md" },
      ],
    });
    expect(applied.items[1]).toBe(items[1]);
  });

  it("reports repositories no catalog entry points into, ignoring vendored ones", async () => {
    const root = await createLibrary([
      "Agentic/known/.git/HEAD",
      "Agentic/known/README.md",
      "Agentic/known/vendor/nested/.git/HEAD",
      "Agentic/known/vendor/nested/README.md",
      "Agentic/fresh/.git/HEAD",
      "Agentic/fresh/README.md",
      "Agentic/fresh/docs/guide.md",
    ]);
    const index = await indexLocalMaterial(root);

    const uncatalogued = await findUncataloguedRepositories(
      { items: [item({ localPath: "Agentic/known/README.md" })] },
      index,
      root,
      noGit,
    );

    expect(uncatalogued.map(({ repositoryPath }) => repositoryPath)).toEqual([
      "Agentic/fresh",
    ]);
    expect(uncatalogued[0].markdownCount).toBe(2);
  });

  it("skips the comparison entirely when the library holds no material", async () => {
    // A clean checkout still ships local-courses/README.md. Comparing against
    // that would report every declared path as drift.
    const root = await createLibrary(["README.md"]);

    const report = await buildCatalogDriftReport({
      catalog: { items: [item({ localPath: "Agentic/anything/README.md" })] },
      localMaterialRoot: root,
      runner: noGit,
    });

    expect(report.mounted).toBe(false);
    expect(report.missingPaths).toEqual([]);
    expect(report.summary.declaredPaths).toBe(1);
  });

  it("builds browsable upstream URLs from SSH remotes, including SSO users", () => {
    expect(toWebBaseUrl("git@github.com:owner/repo.git")).toBe(
      "https://github.com/owner/repo",
    );
    expect(toWebBaseUrl("org-14957082@github.com:openai/codex.git")).toBe(
      "https://github.com/openai/codex",
    );
    expect(toWebBaseUrl("https://github.com/owner/repo.git")).toBe(
      "https://github.com/owner/repo",
    );
    expect(toWebBaseUrl(null)).toBeNull();
  });

  it("pins upstream links to HEAD so a local-only branch cannot break them", () => {
    expect(buildBlobUrl("https://github.com/owner/repo", "docs/前言.md")).toBe(
      "https://github.com/owner/repo/blob/HEAD/docs/%E5%89%8D%E8%A8%80.md",
    );
    expect(buildBlobUrl(null, "README.md")).toBeNull();
  });
});
