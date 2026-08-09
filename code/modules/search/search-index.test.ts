import { describe, expect, it } from "vitest";

import {
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
