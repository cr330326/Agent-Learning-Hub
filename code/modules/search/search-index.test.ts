import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ContentCatalog, LearningItem } from "../catalog/content-schema";
import {
  buildRuntimeSearchIndex,
  buildSearchIndex,
  searchDocuments,
  type SearchDocument,
} from "./search-index";

describe("search index", () => {
  it("indexes public metadata and owned text but never private note text", () => {
    const index = buildSearchIndex(
      {
        tracks: [{ id: "agentic", title: "Agentic", summary: "systems" }],
        stages: [
          {
            id: "stage-01",
            order: 0,
            title: "Agent loop",
            summary: "observe and act",
            learningGoals: ["state transitions"],
            maintainerGuide: "draw a loop",
            trackIds: ["agentic"],
            taskIds: ["task-01"],
            projectOutcomeIds: ["outcome-01"],
            learningItemIds: ["owned-guide"],
          },
        ],
        stageTasks: [
          {
            id: "task-01",
            stageId: "stage-01",
            title: "Draw the loop",
            summary: "make the state explicit",
            acceptanceCriteria: ["diagram"],
          },
        ],
        projectOutcomes: [
          {
            id: "outcome-01",
            stageId: "stage-01",
            title: "Working loop",
            summary: "a runnable proof",
            evidenceTypes: ["repository"],
            level: null,
          },
        ],
        items: [
          {
            id: "owned-guide",
            title: "Owned guide",
            track: "agentic",
            stageIds: ["stage-01"],
            summary: "learn the loop",
            learningGoals: ["observe"],
            sourceUrl: null,
            localPath: null,
            accessPolicy: "owned",
            publicationRights: "project-owned",
            author: "Hub",
            license: "MIT",
            licenseStatus: "known",
            tags: ["loop"],
            lastReviewedAt: null,
            references: [],
            unavailableReason: null,
          },
        ],
      },
      {
        bodyByItemId: new Map([["owned-guide", "runnable proof body"]]),
      },
    );

    expect(
      searchDocuments(index, { query: "runnable" }).map((doc) => doc.id),
    ).toContain("owned-guide");
    expect(searchDocuments(index, { query: "private note" })).toHaveLength(0);
    expect(index.some((document) => document.kind === "stage")).toBe(true);
  });

  it("supports stage, track, and access filters with deterministic ranking", () => {
    const index: SearchDocument[] = [
      {
        id: "b",
        kind: "item",
        title: "Beta",
        text: "agent tools",
        stageIds: ["stage-01"],
        track: "agentic",
        accessPolicy: "upstream-only",
      },
      {
        id: "a",
        kind: "item",
        title: "Alpha",
        text: "agent tools",
        stageIds: ["stage-01"],
        track: "agentic",
        accessPolicy: "owned",
      },
    ];
    expect(
      searchDocuments(index, {
        query: "agent",
        stageId: "stage-01",
        track: "agentic",
        accessPolicy: "owned",
      }).map((document) => document.id),
    ).toEqual(["a"]);
  });
});

describe("local-mode search index", () => {
  let localRoot: string;

  beforeEach(async () => {
    localRoot = await mkdtemp(join(tmpdir(), "agent-learning-search-"));
  });

  afterEach(async () => {
    await rm(localRoot, { recursive: true, force: true });
  });

  async function writeChapter(relativePath: string, body: string) {
    await mkdir(join(localRoot, dirname(relativePath)), { recursive: true });
    await writeFile(join(localRoot, relativePath), body, "utf8");
  }

  function localItem(
    id: string,
    title: string,
    localPath: string,
    references: LearningItem["references"],
  ): LearningItem {
    return {
      id,
      title,
      track: "aicoding",
      stageIds: [],
      summary: "collection",
      learningGoals: [],
      sourceUrl: null,
      localPath,
      accessPolicy: "local-preferred",
      publicationRights: "third-party",
      author: "Unknown",
      license: "Unknown",
      licenseStatus: "unknown",
      tags: [],
      lastReviewedAt: null,
      references,
      unavailableReason: null,
    };
  }

  function catalogOf(items: LearningItem[]): ContentCatalog {
    return {
      tracks: [{ id: "aicoding", title: "AICoding", summary: "agents" }],
      stages: [],
      stageTasks: [],
      projectOutcomes: [],
      items,
    };
  }

  // The legacy import gave every upstream chapter file its own course entry
  // whose single reference repeats that entry's title, so a chapter document
  // per entry produced two identical rows for the same document.
  it("folds a lone chapter into its entry instead of listing it twice", async () => {
    await writeChapter("AICoding/memory.md", "agent memory internals");
    const item = localItem(
      "reading-004",
      "04 Agent 记忆",
      "AICoding/memory.md",
      [
        {
          label: "04 Agent 记忆",
          sourceUrl: null,
          localPath: "AICoding/memory.md",
        },
      ],
    );

    const index = await buildRuntimeSearchIndex(catalogOf([item]), {
      mode: "local",
      localRoot,
    });

    expect(index.filter(({ kind }) => kind === "local-chapter")).toHaveLength(
      0,
    );
    expect(
      searchDocuments(index, { query: "记忆" }).map(({ id }) => id),
    ).toEqual(["reading-004"]);
    // Folding keeps the body searchable from the single remaining row.
    expect(
      searchDocuments(index, { query: "internals" }).map(({ id }) => id),
    ).toEqual(["reading-004"]);
  });

  it("excludes a redirected entry and keeps only the owner's documents", async () => {
    await writeChapter("Learning/course/README.md", "overview text");
    await writeChapter("Learning/course/preface.md", "preface text");
    const owner = localItem(
      "course-001",
      "Hello-Agents",
      "Learning/course/README.md",
      [
        {
          label: "本地 README",
          sourceUrl: null,
          localPath: "Learning/course/README.md",
        },
        {
          label: "前言",
          sourceUrl: null,
          localPath: "Learning/course/preface.md",
        },
      ],
    );
    const retired = localItem(
      "reading-001",
      "第一章",
      "Learning/course/README.md",
      [
        {
          label: "第一章",
          sourceUrl: null,
          localPath: "Learning/course/README.md",
        },
      ],
    );
    retired.redirect = {
      itemId: "course-001",
      chapter: "Learning/course/README.md",
    };

    const index = await buildRuntimeSearchIndex(catalogOf([owner, retired]), {
      mode: "local",
      localRoot,
    });

    expect(index.some(({ id }) => id === "reading-001")).toBe(false);
    expect(
      searchDocuments(index, { query: "overview" }).map(({ id }) => id),
    ).toEqual(["course-001#Learning/course/README.md"]);
  });

  it("keeps per-chapter results for a genuinely multi-chapter entry", async () => {
    await writeChapter("Learning/course/README.md", "overview text");
    await writeChapter("Learning/course/preface.md", "preface text");
    const item = localItem(
      "course-001",
      "Hello-Agents",
      "Learning/course/README.md",
      [
        {
          label: "本地 README",
          sourceUrl: null,
          localPath: "Learning/course/README.md",
        },
        {
          label: "前言",
          sourceUrl: null,
          localPath: "Learning/course/preface.md",
        },
      ],
    );

    const index = await buildRuntimeSearchIndex(catalogOf([item]), {
      mode: "local",
      localRoot,
    });

    expect(
      index
        .filter(({ kind }) => kind === "local-chapter")
        .map(({ title }) => title)
        .sort(),
    ).toEqual(["前言", "本地 README"]);
    expect(
      searchDocuments(index, { query: "preface" }).map(({ href }) => href),
    ).toEqual(["/read/course-001?chapter=Learning%2Fcourse%2Fpreface.md"]);
  });
});
