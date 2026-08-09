import type { LearningItem } from "../catalog/content-schema";
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
  resolve(item: LearningItem): Promise<ResolvedContent>;
};

function internalContent(item: LearningItem): ResolvedContent {
  return {
    kind: "internal-mdx",
    href: `/read/${encodeURIComponent(item.id)}`,
    label: "在站内阅读",
  };
}

function localContent(item: LearningItem): ResolvedContent {
  return {
    kind: "local-document",
    href: `/read/${encodeURIComponent(item.id)}`,
    label: "在站内阅读（本地）",
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
    async resolve(item) {
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
  const fileAccess = createLocalFileAccess(options.localRoot);

  return {
    async resolve(item) {
      if (item.accessPolicy === "owned") {
        return internalContent(item);
      }

      if (item.accessPolicy === "local-preferred" && item.localPath !== null) {
        try {
          if (await fileAccess.resolve(item.localPath)) {
            return localContent(item);
          }
        } catch (error) {
          if (error instanceof UnsafeLocalPathError) {
            return unavailableContent(item, "本地素材路径未通过安全校验。");
          }

          return unavailableContent(item, "本地素材暂时不可访问。");
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
