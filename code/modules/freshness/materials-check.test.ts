import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  checkMaterialRepository,
  classifyMaterialState,
  discoverMaterialRepositories,
  updateMaterialRepository,
  type GitRunner,
} from "./materials-check";

describe("materials freshness check", () => {
  it("classifies clean repositories by ahead/behind relationship", () => {
    expect(classifyMaterialState({ clean: true, ahead: 0, behind: 0 })).toBe(
      "latest",
    );
    expect(classifyMaterialState({ clean: true, ahead: 0, behind: 2 })).toBe(
      "behind",
    );
    expect(classifyMaterialState({ clean: true, ahead: 2, behind: 0 })).toBe(
      "ahead",
    );
    expect(classifyMaterialState({ clean: true, ahead: 2, behind: 1 })).toBe(
      "diverged",
    );
    expect(classifyMaterialState({ clean: false, ahead: 0, behind: 0 })).toBe(
      "dirty",
    );
  });

  it("reads only git status and returns a machine-readable result", async () => {
    const calls: string[][] = [];
    const runner: GitRunner = async (_cwd, args) => {
      calls.push(args);
      if (args[0] === "status") return { code: 0, stdout: "", stderr: "" };
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
        return { code: 0, stdout: "main\n", stderr: "" };
      }
      return { code: 0, stdout: "1 0\n", stderr: "" };
    };

    await expect(
      checkMaterialRepository(
        { courseId: "hello-agents", repositoryPath: "/materials/hello-agents" },
        runner,
      ),
    ).resolves.toMatchObject({
      courseId: "hello-agents",
      status: "ahead",
      clean: true,
      ahead: 1,
      behind: 0,
      branch: "main",
    });
    expect(calls.some((args) => args.includes("pull"))).toBe(false);
  });

  it("distinguishes dirty and failed checks without throwing away the course ID", async () => {
    const dirtyRunner: GitRunner = async (_cwd, args) => {
      if (args[0] === "status")
        return { code: 0, stdout: " M README.md\n", stderr: "" };
      return { code: 0, stdout: "main\n", stderr: "" };
    };
    await expect(
      checkMaterialRepository(
        { courseId: "dirty", repositoryPath: "/dirty" },
        dirtyRunner,
      ),
    ).resolves.toMatchObject({ courseId: "dirty", status: "dirty" });

    const failedRunner: GitRunner = async () => ({
      code: 128,
      stdout: "",
      stderr: "not a git repository",
    });
    await expect(
      checkMaterialRepository(
        { courseId: "broken", repositoryPath: "/broken" },
        failedRunner,
      ),
    ).resolves.toMatchObject({ courseId: "broken", status: "check-failed" });
  });

  it("discovers the nearest nested git repository and groups references", async () => {
    const fixtureRoot = await mkdtemp("/tmp/materials-discovery-");
    try {
      await mkdir(join(fixtureRoot, "repo", ".git"), { recursive: true });
      await mkdir(join(fixtureRoot, "repo", "docs"), { recursive: true });
      await mkdir(join(fixtureRoot, "loose"), { recursive: true });
      await writeFile(join(fixtureRoot, "repo", "docs", "one.md"), "one");
      await writeFile(join(fixtureRoot, "repo", "docs", "two.md"), "two");
      await writeFile(join(fixtureRoot, "loose", "readme.md"), "loose");

      const repositories = discoverMaterialRepositories(
        {
          items: [
            {
              id: "course-b",
              title: "B",
              track: "learning",
              stageIds: [],
              summary: "B",
              learningGoals: ["B"],
              sourceUrl: null,
              localPath: "repo/docs/two.md",
              accessPolicy: "local-preferred",
              publicationRights: "third-party",
              author: "Author",
              license: "Unknown",
              licenseStatus: "unknown",
              tags: ["b"],
              lastReviewedAt: null,
              references: [],
              unavailableReason: null,
            },
            {
              id: "course-a",
              title: "A",
              track: "learning",
              stageIds: [],
              summary: "A",
              learningGoals: ["A"],
              sourceUrl: null,
              localPath: "repo/docs/one.md",
              accessPolicy: "local-preferred",
              publicationRights: "third-party",
              author: "Author",
              license: "Unknown",
              licenseStatus: "unknown",
              tags: ["a"],
              lastReviewedAt: null,
              references: [],
              unavailableReason: null,
            },
            {
              id: "course-loose",
              title: "Loose",
              track: "learning",
              stageIds: [],
              summary: "Loose",
              learningGoals: ["Loose"],
              sourceUrl: null,
              localPath: "loose/readme.md",
              accessPolicy: "local-preferred",
              publicationRights: "third-party",
              author: "Author",
              license: "Unknown",
              licenseStatus: "unknown",
              tags: ["loose"],
              lastReviewedAt: null,
              references: [],
              unavailableReason: null,
            },
          ],
        },
        fixtureRoot,
      );

      expect(repositories).toHaveLength(2);
      expect(repositories).toContainEqual(
        expect.objectContaining({
          courseId: "course-a",
          courseIds: ["course-a", "course-b"],
          repositoryPath: join(fixtureRoot, "repo"),
          materialPaths: ["repo/docs/one.md", "repo/docs/two.md"],
        }),
      );
      expect(repositories).toContainEqual(
        expect.objectContaining({
          courseId: "course-loose",
          courseIds: ["course-loose"],
          repositoryPath: join(fixtureRoot, "loose"),
        }),
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("updates only a clean fast-forward repository and never pulls rejected states", async () => {
    let revision = 0;
    const calls: string[][] = [];
    const runner: GitRunner = async (_cwd, args) => {
      calls.push(args);
      if (args[0] === "status") return { code: 0, stdout: "", stderr: "" };
      if (args[0] === "rev-parse") {
        return { code: 0, stdout: "main\n", stderr: "" };
      }
      if (args[0] === "rev-list") {
        return {
          code: 0,
          stdout: revision === 0 ? "0 2\n" : "0 0\n",
          stderr: "",
        };
      }
      if (args[0] === "pull") {
        revision = 1;
        return { code: 0, stdout: "fast-forward\n", stderr: "" };
      }
      throw new Error(`Unexpected git call: ${args.join(" ")}`);
    };

    await expect(
      updateMaterialRepository(
        { courseId: "behind", repositoryPath: "/materials/behind" },
        runner,
      ),
    ).resolves.toMatchObject({ status: "latest", updated: true });
    expect(calls).toContainEqual(["pull", "--ff-only"]);

    const rejectedCalls: string[][] = [];
    const rejectedRunner: GitRunner = async (_cwd, args) => {
      rejectedCalls.push(args);
      if (args[0] === "status") {
        return { code: 0, stdout: " M local.md\n", stderr: "" };
      }
      if (args[0] === "rev-parse") {
        return { code: 0, stdout: "main\n", stderr: "" };
      }
      return { code: 0, stdout: "0 1\n", stderr: "" };
    };
    await expect(
      updateMaterialRepository(
        { courseId: "dirty", repositoryPath: "/materials/dirty" },
        rejectedRunner,
      ),
    ).resolves.toMatchObject({ status: "dirty", updated: false });
    expect(rejectedCalls.some((args) => args[0] === "pull")).toBe(false);
  });
});
