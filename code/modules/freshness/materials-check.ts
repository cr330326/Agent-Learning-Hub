import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import type { ContentCatalog } from "../catalog/content-schema";

const execFileAsync = promisify(execFile);

export type GitResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type GitRunner = (cwd: string, args: string[]) => Promise<GitResult>;

export type MaterialStatus =
  "latest" | "behind" | "ahead" | "diverged" | "dirty" | "check-failed";

export type MaterialRepositoryInput = {
  courseId: string;
  repositoryPath: string;
};

export type DiscoveredMaterialRepository = MaterialRepositoryInput & {
  courseIds: string[];
  materialPaths: string[];
};

export type MaterialRepositoryResult = {
  courseId: string;
  repositoryPath: string;
  status: MaterialStatus;
  clean: boolean;
  ahead: number;
  behind: number;
  branch: string | null;
  checkedAt: string;
  error?: string;
};

export type MaterialUpdateResult = MaterialRepositoryResult & {
  updated: boolean;
};

type MaterialPathProbe = {
  isDirectory(path: string): boolean;
  hasGitMarker(path: string): boolean;
};

const defaultMaterialPathProbe: MaterialPathProbe = {
  isDirectory(path) {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
  hasGitMarker(path) {
    return existsSync(join(path, ".git"));
  },
};

function isInside(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

export function findMaterialRepositoryRoot(
  candidatePath: string,
  localRoot: string,
  probe: MaterialPathProbe = defaultMaterialPathProbe,
): string | null {
  const root = resolve(localRoot);
  const candidate = resolve(candidatePath);
  if (!isInside(root, candidate)) return null;

  let cursor = probe.isDirectory(candidate) ? candidate : dirname(candidate);
  while (isInside(root, cursor)) {
    if (probe.hasGitMarker(cursor)) return cursor;
    if (cursor === root) break;
    cursor = dirname(cursor);
  }
  return null;
}

export function discoverMaterialRepositories(
  catalog: Pick<ContentCatalog, "items">,
  localRoot: string,
  probe: MaterialPathProbe = defaultMaterialPathProbe,
): DiscoveredMaterialRepository[] {
  const root = resolve(localRoot);
  const groups = new Map<string, DiscoveredMaterialRepository>();

  for (const item of [...catalog.items].sort((left, right) =>
    left.id.localeCompare(right.id, "en"),
  )) {
    if (!item.localPath) continue;
    const candidatePath = resolve(root, item.localPath);
    const repositoryRoot = findMaterialRepositoryRoot(
      candidatePath,
      root,
      probe,
    );
    const materialDirectory = probe.isDirectory(candidatePath)
      ? candidatePath
      : dirname(candidatePath);
    const groupingKey = repositoryRoot ?? `no-git:${materialDirectory}`;
    const existing = groups.get(groupingKey);
    const materialPath = relative(root, candidatePath) || ".";
    if (existing) {
      existing.courseIds.push(item.id);
      if (!existing.materialPaths.includes(materialPath)) {
        existing.materialPaths.push(materialPath);
      }
      continue;
    }

    groups.set(groupingKey, {
      courseId: item.id,
      courseIds: [item.id],
      materialPaths: [materialPath],
      repositoryPath: repositoryRoot ?? materialDirectory,
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      courseIds: [...group.courseIds].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
      materialPaths: [...group.materialPaths].sort((left, right) =>
        left.localeCompare(right, "en"),
      ),
    }))
    .sort((left, right) =>
      left.repositoryPath.localeCompare(right.repositoryPath, "en"),
    );
}

export function classifyMaterialState(input: {
  clean: boolean;
  ahead: number;
  behind: number;
}): Exclude<MaterialStatus, "check-failed"> {
  if (!input.clean) return "dirty";
  if (input.ahead > 0 && input.behind > 0) return "diverged";
  if (input.behind > 0) return "behind";
  if (input.ahead > 0) return "ahead";
  return "latest";
}

export const defaultGitRunner: GitRunner = async (cwd, args) => {
  try {
    const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? String(error),
    };
  }
};

function failedResult(
  input: MaterialRepositoryInput,
  error: string,
): MaterialRepositoryResult {
  return {
    courseId: input.courseId,
    repositoryPath: input.repositoryPath,
    status: "check-failed",
    clean: false,
    ahead: 0,
    behind: 0,
    branch: null,
    checkedAt: new Date().toISOString(),
    error,
  };
}

export async function checkMaterialRepository(
  input: MaterialRepositoryInput,
  runner: GitRunner = defaultGitRunner,
): Promise<MaterialRepositoryResult> {
  const status = await runner(input.repositoryPath, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (status.code !== 0) {
    return failedResult(input, status.stderr.trim() || "git status failed");
  }
  const branch = await runner(input.repositoryPath, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  if (branch.code !== 0) {
    return failedResult(
      input,
      branch.stderr.trim() || "git branch lookup failed",
    );
  }
  const clean = status.stdout.trim().length === 0;
  const counts = await runner(input.repositoryPath, [
    "rev-list",
    "--left-right",
    "--count",
    "HEAD...@{upstream}",
  ]);
  if (counts.code !== 0) {
    if (!clean) {
      return {
        ...failedResult(
          input,
          counts.stderr.trim() || "git upstream comparison failed",
        ),
        status: "dirty",
        clean: false,
        branch: branch.stdout.trim() || null,
      };
    }
    return failedResult(
      input,
      counts.stderr.trim() || "git upstream comparison failed",
    );
  }
  const [aheadText, behindText] = counts.stdout.trim().split(/\s+/);
  const ahead = Number(aheadText);
  const behind = Number(behindText);
  if (!Number.isFinite(ahead) || !Number.isFinite(behind)) {
    if (!clean) {
      return {
        ...failedResult(input, "git returned an invalid ahead/behind count"),
        status: "dirty",
        clean: false,
        branch: branch.stdout.trim() || null,
      };
    }
    return failedResult(input, "git returned an invalid ahead/behind count");
  }
  return {
    courseId: input.courseId,
    repositoryPath: input.repositoryPath,
    status: classifyMaterialState({ clean, ahead, behind }),
    clean,
    ahead,
    behind,
    branch: branch.stdout.trim() || null,
    checkedAt: new Date().toISOString(),
  };
}

export async function checkMaterialRepositories(
  inputs: readonly MaterialRepositoryInput[],
  runner: GitRunner = defaultGitRunner,
): Promise<MaterialRepositoryResult[]> {
  return Promise.all(
    inputs.map((input) => checkMaterialRepository(input, runner)),
  );
}

export async function updateMaterialRepository(
  input: MaterialRepositoryInput,
  runner: GitRunner = defaultGitRunner,
): Promise<MaterialUpdateResult> {
  const before = await checkMaterialRepository(input, runner);
  if (before.status === "latest") return { ...before, updated: false };
  if (before.status !== "behind") {
    return {
      ...before,
      updated: false,
      error:
        before.error ??
        `Refusing to update a ${before.status} material repository; it must be clean and fast-forwardable.`,
    };
  }

  const pull = await runner(input.repositoryPath, ["pull", "--ff-only"]);
  if (pull.code !== 0) {
    return {
      ...before,
      status: "check-failed",
      updated: false,
      error: pull.stderr.trim() || "fast-forward update failed",
    };
  }

  const after = await checkMaterialRepository(input, runner);
  return {
    ...after,
    updated: true,
    error: after.status === "latest" ? undefined : after.error,
  };
}
