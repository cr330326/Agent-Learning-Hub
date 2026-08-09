import { realpath, readFile, stat } from "node:fs/promises";
import { isAbsolute, join, relative, win32 } from "node:path";

export type LocalFile = {
  relativePath: string;
  absolutePath: string;
};

export class UnsafeLocalPathError extends Error {
  constructor() {
    super("The local path is outside the allowed content root.");
    this.name = "UnsafeLocalPathError";
  }
}

export class LocalFileNotFoundError extends Error {
  constructor(relativePath: string) {
    super(`The local file is not available: ${relativePath}`);
    this.name = "LocalFileNotFoundError";
  }
}

export type LocalFileAccess = {
  resolve(relativePath: string): Promise<LocalFile | null>;
  readText(relativePath: string): Promise<string>;
};

function decodeLocalPath(value: string): string {
  let decoded = value;

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        return decoded;
      }
      decoded = next;
    }

    return decoded;
  } catch {
    throw new UnsafeLocalPathError();
  }
}

function assertSafeRelativePath(value: string): string {
  const decoded = decodeLocalPath(value);
  const segments = decoded.split("/");

  if (
    decoded.trim() === "" ||
    decoded.includes("\u0000") ||
    decoded.includes("\\") ||
    isAbsolute(decoded) ||
    win32.isAbsolute(decoded) ||
    /^[a-zA-Z]:/.test(decoded) ||
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new UnsafeLocalPathError();
  }

  return decoded;
}

function isWithinRoot(rootPath: string, candidatePath: string): boolean {
  const relativePath = relative(rootPath, candidatePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

export function createLocalFileAccess(root: string): LocalFileAccess {
  return {
    async resolve(inputPath) {
      const safePath = assertSafeRelativePath(inputPath);
      let rootPath: string;

      try {
        rootPath = await realpath(root);
      } catch (error) {
        if (isMissingFileError(error)) {
          return null;
        }
        throw error;
      }

      const candidatePath = join(rootPath, safePath);
      let realCandidatePath: string;

      try {
        realCandidatePath = await realpath(candidatePath);
      } catch (error) {
        if (isMissingFileError(error)) {
          return null;
        }
        throw new UnsafeLocalPathError();
      }

      if (!isWithinRoot(rootPath, realCandidatePath)) {
        throw new UnsafeLocalPathError();
      }

      const candidateStats = await stat(realCandidatePath);
      if (!candidateStats.isFile()) {
        return null;
      }

      return {
        relativePath: safePath,
        absolutePath: realCandidatePath,
      };
    },

    async readText(inputPath) {
      const file = await this.resolve(inputPath);
      if (file === null) {
        throw new LocalFileNotFoundError(inputPath);
      }

      return readFile(file.absolutePath, "utf8");
    },
  };
}
