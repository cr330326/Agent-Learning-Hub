import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { LearningItem } from "../catalog/content-schema";
import { handleLocalImageRequest } from "../../app/api/local-image/route";

describe("local image route", () => {
  let localRoot: string;

  beforeEach(async () => {
    localRoot = await mkdtemp(join(tmpdir(), "agent-learning-local-image-"));
  });

  afterEach(async () => {
    await rm(localRoot, { recursive: true, force: true });
  });

  it("serves an allowlisted image from the read-only material root", async () => {
    const item = {
      id: "local-course",
      accessPolicy: "local-preferred",
      localPath: "README.md",
      references: [
        { label: "image", sourceUrl: null, localPath: "images/loop.png" },
      ],
    } as unknown as LearningItem;
    await mkdir(join(localRoot, "images"), { recursive: true });
    await writeFile(join(localRoot, "images/loop.png"), Buffer.from([1, 2, 3]));

    const response = await handleLocalImageRequest(
      new Request(
        "http://127.0.0.1/api/local-image?itemId=local-course&path=images%2Floop.png",
      ),
      item,
      localRoot,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it("rejects a path outside the catalog allowlist", async () => {
    const item = {
      id: "local-course",
      accessPolicy: "local-preferred",
      localPath: "README.md",
      references: [],
    } as unknown as LearningItem;
    const response = await handleLocalImageRequest(
      new Request(
        "http://127.0.0.1/api/local-image?itemId=local-course&path=../secret.png",
      ),
      item,
      localRoot,
    );
    expect(response.status).toBe(404);
  });
});
