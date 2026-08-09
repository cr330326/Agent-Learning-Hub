import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLocalFileAccess,
  UnsafeLocalPathError,
} from "./local-file-access";

describe("local file access", () => {
  let root: string;
  let outsideRoot: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "agent-learning-local-root-"));
    outsideRoot = await mkdtemp(
      join(tmpdir(), "agent-learning-local-outside-"),
    );
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "intro.md"), "# Safe intro\n", "utf8");
    await writeFile(join(outsideRoot, "secret.md"), "do not serve\n", "utf8");
  });

  afterEach(async () => {
    await Promise.all([
      rm(root, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  });

  it("reads a regular file below the configured root", async () => {
    const access = createLocalFileAccess(root);

    await expect(access.resolve("docs/intro.md")).resolves.toMatchObject({
      relativePath: "docs/intro.md",
    });
    await expect(access.readText("docs/intro.md")).resolves.toBe(
      "# Safe intro\n",
    );
  });

  it("treats a missing file as a normal local miss", async () => {
    await expect(
      createLocalFileAccess(root).resolve("docs/missing.md"),
    ).resolves.toBeNull();
  });

  it.each([
    "../secret.md",
    "..%2Fsecret.md",
    "%2e%2e%2fsecret.md",
    "%252e%252e%252fsecret.md",
    "/etc/passwd",
    "%2Fetc/passwd",
    "docs\\intro.md",
    "docs/%00.md",
    "docs/./intro.md",
    "docs/../intro.md",
  ])("rejects unsafe path %s", async (path) => {
    await expect(
      createLocalFileAccess(root).resolve(path),
    ).rejects.toBeInstanceOf(UnsafeLocalPathError);
  });

  it("rejects a symlink that escapes the mounted root", async () => {
    await symlink(
      join(outsideRoot, "secret.md"),
      join(root, "docs", "escape.md"),
    );

    await expect(
      createLocalFileAccess(root).resolve("docs/escape.md"),
    ).rejects.toBeInstanceOf(UnsafeLocalPathError);
  });
});
