import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import {
  type ContentCatalog,
  type ContentSchemaIssue,
  type LearningItem,
  type Stage,
  learningItemSchema,
  parseContentCatalog,
  projectOutcomeSchema,
  stageSchema,
  stageTaskSchema,
  trackSchema,
} from "./content-schema";

const stageDocumentSchema = z.object({
  stage: stageSchema,
  stageTasks: z.array(stageTaskSchema),
  projectOutcomes: z.array(projectOutcomeSchema),
});

const trackCollectionSchema = z.array(trackSchema);
const projectOutcomeCollectionSchema = z.array(projectOutcomeSchema);

export type ListItemsQuery = {
  stageId?: string;
  track?: LearningItem["track"];
  tags?: readonly string[];
  accessPolicy?: LearningItem["accessPolicy"];
};

export type CatalogApi = {
  listItems(query?: ListItemsQuery): LearningItem[];
  getItem(id: string): LearningItem | undefined;
  getStage(id: string): Stage | undefined;
};

export class ContentDocumentParseError extends Error {
  readonly filePath: string;

  constructor(filePath: string, cause: unknown) {
    super(`Could not parse JSON content document: ${filePath}`, { cause });
    this.name = "ContentDocumentParseError";
    this.filePath = filePath;
  }
}

export class ContentDocumentValidationError extends Error {
  readonly filePath: string;
  readonly issues: ContentSchemaIssue[];

  constructor(filePath: string, issues: ContentSchemaIssue[]) {
    super(`Content document validation failed: ${filePath}`);
    this.name = "ContentDocumentValidationError";
    this.filePath = filePath;
    this.issues = issues;
  }
}

function toSchemaIssues(issues: z.core.$ZodIssue[]): ContentSchemaIssue[] {
  return issues.map((issue) => ({
    path: [...issue.path] as Array<string | number>,
    message: issue.message,
  }));
}

function parseDocument<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  filePath: string,
): z.output<Schema> {
  const parsed = schema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  throw new ContentDocumentValidationError(
    filePath,
    toSchemaIssues(parsed.error.issues),
  );
}

function parseDocumentCollection<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
  filePath: string,
): Array<z.output<Schema>> {
  if (!Array.isArray(input)) {
    return [parseDocument(schema, input, filePath)];
  }

  return input.map((entry, index) => {
    try {
      return parseDocument(schema, entry, filePath);
    } catch (error) {
      if (error instanceof ContentDocumentValidationError) {
        throw new ContentDocumentValidationError(
          filePath,
          error.issues.map((issue) => ({
            ...issue,
            path: [index, ...issue.path],
          })),
        );
      }

      throw error;
    }
  });
}

async function readJsonDocument(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new ContentDocumentParseError(filePath, error);
  }
}

async function readJsonDocuments(
  directory: string,
): Promise<Array<{ filePath: string; value: unknown }>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const fileNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));

  return Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = resolve(directory, fileName);
      return { filePath, value: await readJsonDocument(filePath) };
    }),
  );
}

export function createCatalogApi(catalog: ContentCatalog): CatalogApi {
  const items = [...catalog.items].sort((left, right) =>
    left.id.localeCompare(right.id, "en"),
  );
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const stagesById = new Map(catalog.stages.map((stage) => [stage.id, stage]));

  return {
    listItems(query = {}) {
      return items.filter((item) => {
        if (
          query.stageId !== undefined &&
          !item.stageIds.includes(query.stageId)
        ) {
          return false;
        }

        if (query.track !== undefined && item.track !== query.track) {
          return false;
        }

        if (
          query.tags !== undefined &&
          !query.tags.every((tag) => item.tags.includes(tag))
        ) {
          return false;
        }

        return (
          query.accessPolicy === undefined ||
          item.accessPolicy === query.accessPolicy
        );
      });
    },
    getItem(id) {
      return itemsById.get(id);
    },
    getStage(id) {
      return stagesById.get(id);
    },
  };
}

export async function loadContentCatalogFromDirectory(
  contentRoot: string,
): Promise<ContentCatalog> {
  const root = resolve(contentRoot);
  const tracksPath = resolve(root, "catalog", "tracks.json");
  const projectOutcomesPath = resolve(root, "catalog", "project-outcomes.json");
  const tracks = parseDocument(
    trackCollectionSchema,
    await readJsonDocument(tracksPath),
    tracksPath,
  );
  const stageDocuments = await readJsonDocuments(resolve(root, "stages"));
  const courseDocuments = await readJsonDocuments(resolve(root, "courses"));
  const articleDocuments = await readJsonDocuments(resolve(root, "articles"));
  const parsedStageDocuments = stageDocuments.flatMap(({ filePath, value }) =>
    parseDocumentCollection(stageDocumentSchema, value, filePath),
  );
  const courseItems = courseDocuments.flatMap(({ filePath, value }) =>
    parseDocumentCollection(learningItemSchema, value, filePath),
  );
  const articleItems = articleDocuments.flatMap(({ filePath, value }) =>
    parseDocumentCollection(learningItemSchema, value, filePath),
  );
  const projectOutcomes = parseDocument(
    projectOutcomeCollectionSchema,
    await readJsonDocument(projectOutcomesPath),
    projectOutcomesPath,
  );

  return parseContentCatalog({
    tracks,
    stages: parsedStageDocuments.map(({ stage }) => stage),
    stageTasks: parsedStageDocuments.flatMap(({ stageTasks }) => stageTasks),
    projectOutcomes: [
      ...parsedStageDocuments.flatMap(({ projectOutcomes }) => projectOutcomes),
      ...projectOutcomes,
    ],
    items: [...courseItems, ...articleItems],
  });
}

export async function loadCatalogApiFromDirectory(
  contentRoot: string,
): Promise<CatalogApi> {
  return createCatalogApi(await loadContentCatalogFromDirectory(contentRoot));
}

export function getDefaultContentRoot(environment = process.env): string {
  return resolve(
    environment.CONTENT_ROOT ?? resolve(process.cwd(), "..", "content"),
  );
}

export async function loadCatalogApi(): Promise<CatalogApi> {
  return loadCatalogApiFromDirectory(getDefaultContentRoot());
}
