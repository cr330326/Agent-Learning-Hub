import { describe, expect, it } from "vitest";

import type { LearningItem } from "./content-schema";
import { itemRedirectHref } from "./item-redirect";

function itemWith(redirect: LearningItem["redirect"]): LearningItem {
  return {
    id: "legacy-reading-02-001",
    title: "本地课程总览",
    track: "learning",
    stageIds: [],
    summary: "项目导览",
    learningGoals: [],
    sourceUrl: null,
    localPath: "Learning/hello-agents/README.md",
    accessPolicy: "local-preferred",
    publicationRights: "third-party",
    author: "Unknown",
    license: "Unknown",
    licenseStatus: "unknown",
    tags: ["legacy-reading"],
    lastReviewedAt: null,
    references: [],
    unavailableReason: null,
    redirect,
  };
}

describe("item redirect", () => {
  it("is null for an active content owner", () => {
    expect(itemRedirectHref(itemWith(undefined))).toBeNull();
  });

  it("forwards a chapter to the owner's reader so the course context is kept", () => {
    expect(
      itemRedirectHref(
        itemWith({
          itemId: "legacy-course-001",
          chapter: "Learning/hello-agents/README.md",
        }),
      ),
    ).toBe(
      "/read/legacy-course-001?chapter=Learning%2Fhello-agents%2FREADME.md",
    );
  });

  it("forwards a bare redirect to the owner's course guide", () => {
    expect(itemRedirectHref(itemWith({ itemId: "legacy-course-001" }))).toBe(
      "/courses/legacy-course-001",
    );
  });
});
