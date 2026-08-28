import type { ContentCatalog, LearningItem } from "../catalog/content-schema";
import {
  readOwnedDocument,
  readLocalDocument,
  listLocalChapters,
} from "../reader/document-source";
import { type DeploymentMode } from "../runtime/runtime-config";
import {
  createCloudContentResolver,
  createLocalContentResolver,
} from "../content-resolver/content-resolver";

export type SearchDocumentKind = "stage" | "item" | "project" | "local-chapter";

export type SearchDocument = {
  id: string;
  kind: SearchDocumentKind;
  title: string;
  text: string;
  /** One line of context for the result list; never the matched body text. */
  summary?: string;
  stageIds?: string[];
  track?: LearningItem["track"];
  accessPolicy?: LearningItem["accessPolicy"] | "local-document";
  href?: string;
  itemId?: string;
};

export type LocalChapterDocument = {
  itemId: string;
  title: string;
  relativePath: string;
  text: string;
  stageIds?: string[];
  track?: LearningItem["track"];
  /** The course entry this chapter belongs to, shown as result context. */
  itemTitle?: string;
};

export type SearchIndexOptions = {
  bodyByItemId?: ReadonlyMap<string, string>;
  localChapterDocuments?: ReadonlyArray<LocalChapterDocument>;
};

export type RuntimeSearchIndexOptions = {
  mode: DeploymentMode;
  contentRoot?: string;
  localRoot?: string;
};

export type SearchQuery = {
  query?: string;
  stageId?: string;
  track?: LearningItem["track"];
  accessPolicy?: SearchDocument["accessPolicy"];
};

function publicItemText(item: LearningItem): string {
  return [
    item.title,
    item.summary,
    ...item.learningGoals,
    ...item.tags,
    item.author,
    item.license,
  ].join(" ");
}

export function buildSearchIndex(
  catalog: ContentCatalog,
  options: SearchIndexOptions = {},
): SearchDocument[] {
  const taskById = new Map(catalog.stageTasks.map((task) => [task.id, task]));
  const documents: SearchDocument[] = [];

  for (const stage of catalog.stages) {
    const tasks = stage.taskIds
      .map((taskId) => taskById.get(taskId))
      .filter((task): task is NonNullable<typeof task> => task !== undefined);
    documents.push({
      id: stage.id,
      kind: "stage",
      title: stage.title,
      text: [
        stage.title,
        stage.summary,
        ...stage.learningGoals,
        stage.maintainerGuide,
        ...tasks.flatMap((task) => [
          task.title,
          task.summary,
          ...task.acceptanceCriteria,
        ]),
      ].join(" "),
      summary: stage.summary,
      stageIds: [stage.id],
      href: `/roadmap/${stage.id}`,
    });
  }

  const bodyByItemId = options.bodyByItemId ?? new Map<string, string>();
  for (const item of catalog.items) {
    // A redirected entry forwards to its owner; the owner's document already
    // carries the content, so the retired entry never produces a second row.
    if (item.redirect) {
      continue;
    }
    documents.push({
      id: item.id,
      kind: "item",
      title: item.title,
      text: `${publicItemText(item)} ${bodyByItemId.get(item.id) ?? ""}`,
      summary: item.summary,
      stageIds: item.stageIds,
      track: item.track,
      accessPolicy: item.accessPolicy,
      href: `/courses/${item.id}`,
    });
  }

  for (const outcome of catalog.projectOutcomes) {
    documents.push({
      id: outcome.id,
      kind: "project",
      title: outcome.title,
      text: [outcome.title, outcome.summary, ...outcome.evidenceTypes].join(
        " ",
      ),
      summary: outcome.summary,
      stageIds: outcome.stageId ? [outcome.stageId] : [],
      href: outcome.stageId ? `/roadmap/${outcome.stageId}` : "/projects",
    });
  }

  for (const chapter of options.localChapterDocuments ?? []) {
    documents.push({
      id: `${chapter.itemId}#${chapter.relativePath}`,
      kind: "local-chapter",
      title: chapter.title,
      text: `${chapter.title} ${chapter.text}`,
      summary: chapter.itemTitle,
      stageIds: chapter.stageIds,
      track: chapter.track,
      accessPolicy: "local-document",
      itemId: chapter.itemId,
      href: `/read/${chapter.itemId}?chapter=${encodeURIComponent(chapter.relativePath)}`,
    });
  }

  return documents;
}

export async function buildRuntimeSearchIndex(
  catalog: ContentCatalog,
  options: RuntimeSearchIndexOptions,
): Promise<SearchDocument[]> {
  const resolver =
    options.mode === "local"
      ? createLocalContentResolver({ localRoot: options.localRoot ?? "" })
      : createCloudContentResolver();
  const bodyByItemId = new Map<string, string>();
  const resolvedAccessByItemId = new Map<
    string,
    SearchDocument["accessPolicy"]
  >();
  const localChapterDocuments: LocalChapterDocument[] = [];

  await Promise.all(
    catalog.items.map(async (item) => {
      if (item.redirect) {
        return;
      }
      const resolved = await resolver.resolve(item);
      resolvedAccessByItemId.set(
        item.id,
        resolved.kind === "internal-mdx"
          ? "owned"
          : resolved.kind === "local-document"
            ? "local-document"
            : resolved.kind === "external-link"
              ? "upstream-only"
              : "unavailable",
      );
      if (item.accessPolicy === "owned") {
        try {
          bodyByItemId.set(
            item.id,
            (
              await readOwnedDocument(item, {
                contentRoot: options.contentRoot,
              })
            ).markdown,
          );
        } catch {
          // Keep searchable metadata when an owned body is unavailable.
        }
      }
      if (options.mode === "local" && options.localRoot) {
        const localRoot = options.localRoot;
        const chapters = await listLocalChapters(item, {
          localRoot,
        });
        // The legacy import turned each upstream chapter file into its own
        // course entry whose single reference repeats the entry's own title.
        // Emitting a chapter document for those produced a second result row
        // per entry, identical to the first. A lone chapter is therefore folded
        // into its entry's searchable body instead of standing on its own; only
        // genuinely multi-chapter entries keep per-chapter results.
        const standalone = chapters.length > 1;
        const chapterBodies = await Promise.all(
          chapters.map(async (chapter) => {
            try {
              const document = await readLocalDocument(item, {
                localRoot,
                relativePath: chapter.relativePath,
              });
              if (standalone) {
                localChapterDocuments.push({
                  itemId: item.id,
                  title: chapter.label,
                  relativePath: chapter.relativePath,
                  text: document.markdown,
                  stageIds: item.stageIds,
                  track: item.track,
                  itemTitle: item.title,
                });
              }
              return document.markdown;
            } catch {
              // A missing or unsupported chapter remains visible as metadata only.
              return "";
            }
          }),
        );
        if (!standalone && chapterBodies.length > 0) {
          bodyByItemId.set(item.id, chapterBodies.join(" "));
        }
      }
    }),
  );

  return buildSearchIndex(catalog, {
    bodyByItemId,
    localChapterDocuments,
  }).map((document) =>
    document.kind === "item"
      ? {
          ...document,
          accessPolicy:
            resolvedAccessByItemId.get(document.id) ?? document.accessPolicy,
        }
      : document,
  );
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export function searchDocuments(
  index: readonly SearchDocument[],
  query: SearchQuery = {},
): SearchDocument[] {
  const terms = normalize(query.query ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const matches = index.flatMap((document) => {
    if (query.stageId && !document.stageIds?.includes(query.stageId)) return [];
    if (query.track && document.track !== query.track) return [];
    if (query.accessPolicy && document.accessPolicy !== query.accessPolicy)
      return [];
    const title = normalize(document.title);
    const text = normalize(`${document.title} ${document.text}`);
    if (!terms.every((term) => text.includes(term))) return [];
    const score = terms.reduce(
      (total, term) => total + (title.includes(term) ? 4 : 1),
      0,
    );
    return [{ document, score }];
  });
  return matches
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.document.title.localeCompare(right.document.title, "zh-CN") ||
        left.document.id.localeCompare(right.document.id, "en"),
    )
    .map(({ document }) => document);
}
