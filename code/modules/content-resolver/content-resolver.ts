import type { LearningItem } from "../catalog/content-schema";
import { listLocalChapters } from "../reader/document-source";
import {
  createLocalFileAccess,
  UnsafeLocalPathError,
} from "./local-file-access";

export type ResolvedContent =
  | {
      kind: "internal-mdx";
      href: string;
      label: string;
    }
  | {
      kind: "local-document";
      href: string;
      label: string;
      chapter?: string;
      sourceUrl: string | null;
    }
  | {
      kind: "external-link";
      href: string;
      label: string;
    }
  | {
      kind: "unavailable";
      reason: string;
      label: string;
    };

export type ContentResolver = {
  resolve(
    item: LearningItem,
    options?: { chapter?: string },
  ): Promise<ResolvedContent>;
};

function internalContent(item: LearningItem): ResolvedContent {
  return {
    kind: "internal-mdx",
    href: `/read/${encodeURIComponent(item.id)}`,
    label: "在站内阅读",
  };
}

function localContent(
  item: LearningItem,
  chapter?: string,
  explicit = false,
): ResolvedContent {
  return {
    kind: "local-document",
    href: `/read/${encodeURIComponent(item.id)}${explicit && chapter ? `?chapter=${encodeURIComponent(chapter)}` : ""}`,
    label: "在站内阅读（本地）",
    ...(chapter ? { chapter } : {}),
    sourceUrl:
      chapter && chapter !== item.localPath
        ? (item.references.find((reference) => reference.localPath === chapter)
            ?.sourceUrl ?? null)
        : item.sourceUrl,
  };
}

function chapterTarget(
  item: LearningItem,
  chapter?: string,
): LearningItem | null {
  if (chapter === undefined || item.accessPolicy === "owned") return item;
  if (item.accessPolicy !== "local-preferred") return null;
  if (chapter === item.localPath) return { ...item, references: [] };
  const reference = item.references.find(
    (value) => value.localPath === chapter,
  );
  if (!reference) return null;
  return {
    ...item,
    localPath: chapter,
    sourceUrl: reference.sourceUrl,
    references: [],
  };
}

function externalContent(item: LearningItem): ResolvedContent | null {
  if (item.sourceUrl === null) {
    return null;
  }

  return {
    kind: "external-link",
    href: item.sourceUrl,
    label: "打开上游",
  };
}

function unavailableContent(
  item: LearningItem,
  fallback: string,
): ResolvedContent {
  return {
    kind: "unavailable",
    reason: item.unavailableReason ?? fallback,
    label: "暂不可用",
  };
}

export function createCloudContentResolver(): ContentResolver {
  return {
    async resolve(original, options) {
      const item = chapterTarget(original, options?.chapter);
      if (!item)
        return unavailableContent(
          original,
          "这个章节不在课程清单允许的本地路径中。",
        );
      if (item.accessPolicy === "owned") {
        return internalContent(item);
      }

      const upstream = externalContent(item);
      if (upstream !== null) {
        return upstream;
      }

      return unavailableContent(item, "云端没有可安全访问的内容目标。");
    },
  };
}

export function createLocalContentResolver(options: {
  localRoot: string;
}): ContentResolver {
  const localRoot = options.localRoot;
  const fileAccess = createLocalFileAccess(localRoot);

  return {
    async resolve(original, options) {
      const item = chapterTarget(original, options?.chapter);
      if (!item)
        return unavailableContent(
          original,
          "这个章节不在课程清单允许的本地路径中。",
        );
      if (item.accessPolicy === "owned") {
        return internalContent(item);
      }

      if (item.accessPolicy === "local-preferred" && item.localPath !== null) {
        try {
          if (await fileAccess.resolve(item.localPath)) {
            return localContent(
              item,
              options?.chapter,
              options?.chapter !== undefined,
            );
          }
        } catch (error) {
          if (error instanceof UnsafeLocalPathError) {
            return unavailableContent(item, "本地素材路径未通过安全校验。");
          }

          return unavailableContent(item, "本地素材暂时不可访问。");
        }

        if (options?.chapter === undefined) {
          const [chapter] = await listLocalChapters(item, { localRoot });
          if (chapter) return localContent(item, chapter.relativePath);
        }
        const upstream = externalContent(item);
        if (upstream !== null) {
          return upstream;
        }

        return unavailableContent(
          item,
          "本地素材不存在，且没有可用的上游链接。",
        );
      }

      const upstream = externalContent(item);
      if (upstream !== null) {
        return upstream;
      }

      return unavailableContent(item, "本地模式没有可安全访问的内容目标。");
    },
  };
}
