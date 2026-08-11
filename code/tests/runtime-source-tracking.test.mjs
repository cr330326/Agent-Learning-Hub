import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");

test("runtime helper sources are not hidden by Git ignore rules", () => {
  for (const path of ["code/lib/catalog.ts", "code/lib/learning-state.ts"]) {
    const result = spawnSync(
      "git",
      ["-C", repositoryRoot, "check-ignore", "-q", path],
      { encoding: "utf8" },
    );

    assert.equal(
      result.status,
      1,
      `Runtime source file must not be ignored: ${path}. ${result.stderr}`,
    );
  }
});
