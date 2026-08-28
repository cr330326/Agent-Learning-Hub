import { describe, expect, it } from "vitest";

import {
  validateContentCatalog,
  type LearningItem,
  type Stage,
} from "./content-schema";

function createValidCatalog() {
  return {
    tracks: [
      {
        id: "learning",
        title: "Learning",
        summary: "Build the foundations of agent engineering.",
      },
      {
        id: "aicoding",
        title: "AICoding",
        summary: "Study coding agents and harnesses.",
      },
      {
        id: "agentic",
        title: "Agentic",
        summary: "Study agent frameworks and theory.",
      },
      {
        id: "application",
        title: "Application",
        summary: "Apply agent engineering in products.",
      },
    ],
    stages: [
      {
        id: "stage-0",
        order: 0,
        title: "Understand agents",
        summary: "Establish an agent mental model.",
        learningGoals: ["Explain an agent loop."],
        maintainerGuide: "Start with the loop before comparing frameworks.",
        trackIds: ["learning"],
        taskIds: ["stage-0-map-agent-loop"],
        projectOutcomeIds: ["stage-0-agent-note"],
      },
    ],
    stageTasks: [
      {
        id: "stage-0-map-agent-loop",
        stageId: "stage-0",
        title: "Map an agent loop",
        summary: "Draw the observe-think-act-observe loop.",
        acceptanceCriteria: ["The loop identifies a stopping condition."],
      },
    ],
    projectOutcomes: [
      {
        id: "stage-0-agent-note",
        stageId: "stage-0",
        title: "Agent rationale note",
        summary: "Explain why a real problem needs an agent.",
        evidenceTypes: ["reflection"],
      },
    ],
    items: [
      {
        id: "anthropic-effective-agents",
        title: "Building effective agents",
        track: "learning",
        stageIds: ["stage-0"],
        summary: "An upstream article about practical agent design.",
        learningGoals: ["Compare workflows and agents."],
        sourceUrl:
          "https://www.anthropic.com/research/building-effective-agents",
        localPath: null as string | null,
        accessPolicy: "upstream-only",
        publicationRights: "third-party",
        author: "Anthropic",
        license: "Unknown",
        licenseStatus: "unknown",
        tags: ["agent-loop"],
        lastReviewedAt: "2026-08-09",
      },
      {
        id: "agent-loop-maintainer-guide",
        title: "Agent loop maintainer guide",
        track: "learning",
        stageIds: ["stage-0"],
        summary: "A curated explanation written for this Learning Hub.",
        learningGoals: ["Recognize the basic loop."],
        sourceUrl: null,
        localPath: null,
        accessPolicy: "owned",
        publicationRights: "project-owned",
        author: "Agent Learning Hub maintainers",
        license: "CC BY 4.0",
        licenseStatus: "known",
        tags: ["agent-loop"],
        lastReviewedAt: "2026-08-09",
      },
    ],
  };
}

describe("content catalog schema", () => {
  it("accepts a complete catalog and preserves its inferred content model", () => {
    const result = validateContentCatalog(createValidCatalog());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items[0]).toMatchObject({
        accessPolicy: "upstream-only",
        publicationRights: "third-party",
      });
      expect(result.data.stages[0].taskIds).toEqual(["stage-0-map-agent-loop"]);
    }
  });

  it("reports a locatable issue when a required field is missing", () => {
    const catalog = createValidCatalog();
    delete (catalog.items[0] as Partial<(typeof catalog.items)[number]>).title;

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 0, "title"] }),
      );
    }
  });

  it("rejects duplicate stable IDs across the catalog", () => {
    const catalog = createValidCatalog();
    catalog.items[1].id = catalog.items[0].id;

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 1, "id"] }),
      );
    }
  });

  it("rejects an item that references a nonexistent stage", () => {
    const catalog = createValidCatalog();
    catalog.items[0].stageIds = ["stage-missing"];

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 0, "stageIds", 0] }),
      );
    }
  });

  it("rejects a local path paired with an upstream-only access policy", () => {
    const catalog = createValidCatalog();
    catalog.items[0].localPath = "Learning/effective-agents.md";

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 0, "localPath"] }),
      );
    }
  });

  it("rejects third-party material without an upstream source", () => {
    const catalog = createValidCatalog();
    catalog.items[0].sourceUrl = null;

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 0, "sourceUrl"] }),
      );
    }
  });

  it("accepts local-only legacy material while its upstream attribution is pending", () => {
    const catalog = createValidCatalog();
    catalog.items[0].accessPolicy = "local-preferred";
    catalog.items[0].sourceUrl = null;
    catalog.items[0].localPath = "Learning/legacy-agent-guide.md";

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: true });
  });

  it("rejects malformed source URLs and review dates at their field paths", () => {
    const catalog = createValidCatalog();
    catalog.items[0].sourceUrl = "not-a-url";
    catalog.items[0].lastReviewedAt = "2026-02-31";

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["items", 0, "sourceUrl"] }),
          expect.objectContaining({ path: ["items", 0, "lastReviewedAt"] }),
        ]),
      );
    }
  });

  it("rejects an empty author attribution", () => {
    const catalog = createValidCatalog();
    catalog.items[0].author = "";

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 0, "author"] }),
      );
    }
  });

  it("rejects a Stage reference to a task that does not exist", () => {
    const catalog = createValidCatalog();
    catalog.stages[0].taskIds = ["stage-0-missing-task"];

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["stages", 0, "taskIds", 0] }),
      );
    }
  });

  it("rejects unknown-license content declared as owned", () => {
    const catalog = createValidCatalog();
    catalog.items[1].licenseStatus = "unknown";

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 1, "licenseStatus"] }),
      );
    }
  });
});

describe("chapter content ownership", () => {
  it("accepts a retired entry that redirects to the entry which owns its content", () => {
    const catalog = createValidCatalog();
    catalog.items[0].localPath = "Learning/effective-agents.md";
    (catalog.items[0] as LearningItem).references = [
      {
        label: "本地正文",
        sourceUrl: null,
        localPath: "Learning/effective-agents.md",
      },
    ];
    catalog.items[0].accessPolicy = "local-preferred";
    (catalog.items[1] as LearningItem).redirect = {
      itemId: "anthropic-effective-agents",
      chapter: "Learning/effective-agents.md",
    };

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: true });
    if (result.success) {
      expect(result.data.items[1].redirect).toEqual({
        itemId: "anthropic-effective-agents",
        chapter: "Learning/effective-agents.md",
      });
    }
  });

  it("rejects a redirect whose target entry does not exist", () => {
    const catalog = createValidCatalog();
    (catalog.items[1] as LearningItem).redirect = { itemId: "missing-owner" };

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 1, "redirect", "itemId"] }),
      );
    }
  });

  it("rejects a redirect chapter that the target does not declare", () => {
    const catalog = createValidCatalog();
    (catalog.items[1] as LearningItem).redirect = {
      itemId: "anthropic-effective-agents",
      chapter: "Learning/undeclared-chapter.md",
    };

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: ["items", 1, "redirect", "chapter"],
        }),
      );
    }
  });

  it("rejects an entry redirecting to itself", () => {
    const catalog = createValidCatalog();
    (catalog.items[1] as LearningItem).redirect = {
      itemId: "agent-loop-maintainer-guide",
    };

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({ path: ["items", 1, "redirect", "itemId"] }),
      );
    }
  });

  it("rejects one Local Material path declared by two active entries", () => {
    const catalog = createValidCatalog();
    catalog.items[0].localPath = "Learning/effective-agents.md";
    (catalog.items[0] as LearningItem).references = [
      {
        label: "本地正文",
        sourceUrl: null,
        localPath: "Learning/effective-agents.md",
      },
    ];
    catalog.items[0].accessPolicy = "local-preferred";
    catalog.items[1].localPath = "Learning/effective-agents.md";
    (catalog.items[1] as LearningItem).references = [
      {
        label: "本地正文",
        sourceUrl: null,
        localPath: "Learning/effective-agents.md",
      },
    ];

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(
        result.issues.some((issue) =>
          issue.message.includes("declared by multiple entries"),
        ),
      ).toBe(true);
    }
  });

  it("lets a retired entry share its owner's path without a duplicate-owner error", () => {
    const catalog = createValidCatalog();
    catalog.items[0].localPath = "Learning/effective-agents.md";
    (catalog.items[0] as LearningItem).references = [
      {
        label: "本地正文",
        sourceUrl: null,
        localPath: "Learning/effective-agents.md",
      },
    ];
    catalog.items[0].accessPolicy = "local-preferred";
    catalog.items[1].localPath = "Learning/effective-agents.md";
    catalog.items[1].accessPolicy = "local-preferred";
    (catalog.items[1] as LearningItem).redirect = {
      itemId: "anthropic-effective-agents",
      chapter: "Learning/effective-agents.md",
    };

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: true });
  });

  it("rejects a Stage reading list that references a redirected entry", () => {
    const catalog = createValidCatalog();
    (catalog.stages[0] as Stage).learningItemIds = [
      "agent-loop-maintainer-guide",
    ];
    (catalog.items[1] as LearningItem).redirect = {
      itemId: "anthropic-effective-agents",
    };

    const result = validateContentCatalog(catalog);

    expect(result).toMatchObject({ success: false });
    if (!result.success) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          path: ["stages", 0, "learningItemIds", 0],
        }),
      );
    }
  });
});
