import { z } from "zod";

export const learningTrackIds = [
  "learning",
  "aicoding",
  "agentic",
  "application",
] as const;

export const accessPolicies = [
  "owned",
  "upstream-only",
  "local-preferred",
  "unavailable",
] as const;

export const publicationRights = [
  "project-owned",
  "republication-authorized",
  "third-party",
] as const;

export const projectEvidenceTypes = [
  "repository",
  "demo",
  "reflection",
] as const;

const stableIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
    "Use a stable lowercase kebab-case ID.",
  );

const requiredTextSchema = z.string().trim().min(1, "A value is required.");

const httpUrlSchema = z.url("Use an absolute URL.").refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}, "Use an HTTP(S) URL.");

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const dateOnlySchema = z
  .string()
  .regex(dateOnlyPattern, "Use an ISO calendar date (YYYY-MM-DD).")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Use a real calendar date.");

const localPathSchema = z
  .string()
  .trim()
  .min(1, "A local path cannot be empty.")
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes("\u0000") &&
      value.split("/").every((segment) => segment !== "." && segment !== ".."),
    "Use a relative, traversal-free POSIX path.",
  );

function containsOnlyUniqueValues(values: readonly string[]) {
  return new Set(values).size === values.length;
}

function isUnknownLicense(value: string) {
  return value.trim().toLowerCase() === "unknown";
}

export const contentReferenceSchema = z
  .object({
    label: requiredTextSchema,
    sourceUrl: httpUrlSchema.nullable(),
    localPath: localPathSchema.nullable(),
  })
  .superRefine((reference, context) => {
    if (reference.sourceUrl === null && reference.localPath === null) {
      context.addIssue({
        code: "custom",
        message: "A reference requires an upstream URL or a local path.",
        path: ["sourceUrl"],
      });
    }
  });

export const legacyImportSchema = z.object({
  source: z.literal("learning-site/data.js"),
  kind: z.enum(["stage", "course-card", "reading-chapter", "project"]),
  order: z.number().int().nonnegative(),
  raw: z.record(z.string(), z.unknown()),
});

export const trackSchema = z.object({
  id: z.enum(learningTrackIds),
  title: requiredTextSchema,
  summary: requiredTextSchema,
});

export const stageTaskSchema = z.object({
  id: stableIdSchema,
  stageId: stableIdSchema,
  title: requiredTextSchema,
  summary: requiredTextSchema,
  acceptanceCriteria: z.array(requiredTextSchema),
  legacyImport: legacyImportSchema.optional(),
});

export const projectOutcomeSchema = z.object({
  id: stableIdSchema,
  stageId: stableIdSchema.nullable(),
  title: requiredTextSchema,
  summary: requiredTextSchema,
  evidenceTypes: z.array(z.enum(projectEvidenceTypes)),
  level: z.number().int().positive().nullable().optional().default(null),
  legacyImport: legacyImportSchema.optional(),
});

export const stageSchema = z.object({
  id: stableIdSchema,
  order: z.number().int().nonnegative(),
  title: requiredTextSchema,
  summary: requiredTextSchema,
  learningGoals: z.array(requiredTextSchema),
  maintainerGuide: requiredTextSchema,
  trackIds: z.array(z.enum(learningTrackIds)).min(1),
  taskIds: z.array(stableIdSchema).min(1),
  projectOutcomeIds: z.array(stableIdSchema).min(1),
  learningItemIds: z.array(stableIdSchema).optional().default([]),
  legacyImport: legacyImportSchema.optional(),
});

export const learningItemSchema = z
  .object({
    id: stableIdSchema,
    title: requiredTextSchema,
    track: z.enum(learningTrackIds),
    stageIds: z.array(stableIdSchema),
    summary: requiredTextSchema,
    learningGoals: z.array(requiredTextSchema),
    sourceUrl: httpUrlSchema.nullable(),
    localPath: localPathSchema.nullable().optional().default(null),
    accessPolicy: z.enum(accessPolicies),
    publicationRights: z.enum(publicationRights),
    author: requiredTextSchema,
    license: requiredTextSchema,
    licenseStatus: z.enum(["known", "unknown"]),
    tags: z.array(requiredTextSchema).min(1),
    lastReviewedAt: dateOnlySchema.nullable(),
    references: z.array(contentReferenceSchema).optional().default([]),
    unavailableReason: requiredTextSchema.nullable().optional().default(null),
    legacyImport: legacyImportSchema.optional(),
  })
  .superRefine((item, context) => {
    const isThirdParty = item.publicationRights === "third-party";

    const sourceUrlIsRequired =
      item.accessPolicy === "upstream-only" ||
      (isThirdParty &&
        item.accessPolicy !== "local-preferred" &&
        item.accessPolicy !== "unavailable");

    if (sourceUrlIsRequired && item.sourceUrl === null) {
      context.addIssue({
        code: "custom",
        message: "This item requires an upstream source URL.",
        path: ["sourceUrl"],
      });
    }

    if (item.accessPolicy === "owned") {
      if (isThirdParty) {
        context.addIssue({
          code: "custom",
          message: "Third-party material cannot use the owned access policy.",
          path: ["accessPolicy"],
        });
      }

      if (item.licenseStatus !== "known") {
        context.addIssue({
          code: "custom",
          message: "Owned content requires a known license status.",
          path: ["licenseStatus"],
        });
      }

      if (item.localPath !== null) {
        context.addIssue({
          code: "custom",
          message: "Owned content cannot point at Local Material.",
          path: ["localPath"],
        });
      }
    }

    if (item.accessPolicy === "upstream-only") {
      if (item.localPath !== null) {
        context.addIssue({
          code: "custom",
          message: "Upstream-only content cannot include a local path.",
          path: ["localPath"],
        });
      }
    }

    if (item.accessPolicy === "local-preferred") {
      if (item.localPath === null) {
        context.addIssue({
          code: "custom",
          message: "Local-preferred content requires a local path.",
          path: ["localPath"],
        });
      }
    }

    if (item.accessPolicy === "unavailable") {
      if (item.sourceUrl !== null) {
        context.addIssue({
          code: "custom",
          message: "Unavailable content cannot expose an upstream URL.",
          path: ["sourceUrl"],
        });
      }

      if (item.localPath !== null) {
        context.addIssue({
          code: "custom",
          message: "Unavailable content cannot include a local path.",
          path: ["localPath"],
        });
      }

      if (item.unavailableReason === null) {
        context.addIssue({
          code: "custom",
          message: "Unavailable content requires an explanation.",
          path: ["unavailableReason"],
        });
      }
    }

    if (
      item.accessPolicy !== "unavailable" &&
      item.unavailableReason !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Only unavailable content can include an unavailable reason.",
        path: ["unavailableReason"],
      });
    }

    if (item.licenseStatus === "known" && isUnknownLicense(item.license)) {
      context.addIssue({
        code: "custom",
        message: "A known license status cannot use the Unknown license value.",
        path: ["license"],
      });
    }

    if (item.licenseStatus === "unknown" && !isUnknownLicense(item.license)) {
      context.addIssue({
        code: "custom",
        message:
          "An unknown license status must use the explicit Unknown license value.",
        path: ["license"],
      });
    }
  });

export const contentCatalogSchema = z
  .object({
    tracks: z.array(trackSchema).length(learningTrackIds.length),
    stages: z.array(stageSchema).min(1),
    stageTasks: z.array(stageTaskSchema),
    projectOutcomes: z.array(projectOutcomeSchema),
    items: z.array(learningItemSchema),
  })
  .superRefine((catalog, context) => {
    const knownTrackIds = new Set(catalog.tracks.map((track) => track.id));
    const knownStageIds = new Set(catalog.stages.map((stage) => stage.id));
    const knownTaskIds = new Set(catalog.stageTasks.map((task) => task.id));
    const knownOutcomeIds = new Set(
      catalog.projectOutcomes.map((outcome) => outcome.id),
    );
    const knownItemIds = new Set(catalog.items.map((item) => item.id));
    const seenIds = new Set<string>();

    for (const [index, trackId] of learningTrackIds.entries()) {
      if (!knownTrackIds.has(trackId)) {
        context.addIssue({
          code: "custom",
          message: `The required ${trackId} track is missing.`,
          path: ["tracks", index, "id"],
        });
      }
    }

    const collections = [
      ["tracks", catalog.tracks],
      ["stages", catalog.stages],
      ["stageTasks", catalog.stageTasks],
      ["projectOutcomes", catalog.projectOutcomes],
      ["items", catalog.items],
    ] as const;

    for (const [collectionName, entries] of collections) {
      entries.forEach((entry, index) => {
        if (seenIds.has(entry.id)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate stable ID: ${entry.id}.`,
            path: [collectionName, index, "id"],
          });
        }

        seenIds.add(entry.id);
      });
    }

    catalog.stages.forEach((stage, stageIndex) => {
      const referenceGroups: Array<
        [string, readonly string[], ReadonlySet<string>]
      > = [
        ["trackIds", stage.trackIds, knownTrackIds],
        ["taskIds", stage.taskIds, knownTaskIds],
        ["projectOutcomeIds", stage.projectOutcomeIds, knownOutcomeIds],
        ["learningItemIds", stage.learningItemIds, knownItemIds],
      ];

      for (const [fieldName, ids, knownIds] of referenceGroups) {
        if (!containsOnlyUniqueValues(ids)) {
          context.addIssue({
            code: "custom",
            message: `${fieldName} cannot contain duplicate references.`,
            path: ["stages", stageIndex, fieldName],
          });
        }

        ids.forEach((id, referenceIndex) => {
          if (!knownIds.has(id)) {
            context.addIssue({
              code: "custom",
              message: `Unknown ${fieldName} reference: ${id}.`,
              path: ["stages", stageIndex, fieldName, referenceIndex],
            });
          }
        });
      }
    });

    catalog.stageTasks.forEach((task, taskIndex) => {
      if (!knownStageIds.has(task.stageId)) {
        context.addIssue({
          code: "custom",
          message: `Unknown stage reference: ${task.stageId}.`,
          path: ["stageTasks", taskIndex, "stageId"],
        });
        return;
      }

      const stage = catalog.stages.find(({ id }) => id === task.stageId);
      if (!stage?.taskIds.includes(task.id)) {
        context.addIssue({
          code: "custom",
          message: "A Stage Task must be listed by its Learning Stage.",
          path: ["stageTasks", taskIndex, "stageId"],
        });
      }
    });

    catalog.projectOutcomes.forEach((outcome, outcomeIndex) => {
      if (outcome.stageId === null) {
        return;
      }

      if (!knownStageIds.has(outcome.stageId)) {
        context.addIssue({
          code: "custom",
          message: `Unknown stage reference: ${outcome.stageId}.`,
          path: ["projectOutcomes", outcomeIndex, "stageId"],
        });
        return;
      }

      const stage = catalog.stages.find(({ id }) => id === outcome.stageId);
      if (!stage?.projectOutcomeIds.includes(outcome.id)) {
        context.addIssue({
          code: "custom",
          message: "A Project Outcome must be listed by its Learning Stage.",
          path: ["projectOutcomes", outcomeIndex, "stageId"],
        });
      }
    });

    catalog.items.forEach((item, itemIndex) => {
      if (!containsOnlyUniqueValues(item.stageIds)) {
        context.addIssue({
          code: "custom",
          message: "stageIds cannot contain duplicate references.",
          path: ["items", itemIndex, "stageIds"],
        });
      }

      item.stageIds.forEach((stageId, stageIndex) => {
        if (!knownStageIds.has(stageId)) {
          context.addIssue({
            code: "custom",
            message: `Unknown stage reference: ${stageId}.`,
            path: ["items", itemIndex, "stageIds", stageIndex],
          });
        }
      });
    });

    catalog.stages.forEach((stage, stageIndex) => {
      stage.learningItemIds.forEach((itemId, itemIndex) => {
        const item = catalog.items.find(({ id }) => id === itemId);
        if (item && !item.stageIds.includes(stage.id)) {
          context.addIssue({
            code: "custom",
            message:
              "A Stage reading item must reference the same Learning Stage.",
            path: ["stages", stageIndex, "learningItemIds", itemIndex],
          });
        }
      });
    });
  });

export type Track = z.output<typeof trackSchema>;
export type Stage = z.output<typeof stageSchema>;
export type StageTask = z.output<typeof stageTaskSchema>;
export type ProjectOutcome = z.output<typeof projectOutcomeSchema>;
export type LearningItem = z.output<typeof learningItemSchema>;
export type ContentCatalog = z.output<typeof contentCatalogSchema>;
export type ContentCatalogInput = z.input<typeof contentCatalogSchema>;

export type ContentSchemaIssue = {
  path: Array<string | number>;
  message: string;
};

export type ContentCatalogValidationResult =
  | { success: true; data: ContentCatalog }
  | { success: false; issues: ContentSchemaIssue[] };

export class ContentCatalogValidationError extends Error {
  readonly issues: ContentSchemaIssue[];

  constructor(issues: ContentSchemaIssue[]) {
    super("Content catalog validation failed.");
    this.name = "ContentCatalogValidationError";
    this.issues = issues;
  }
}

export function validateContentCatalog(
  input: unknown,
): ContentCatalogValidationResult {
  const parsed = contentCatalogSchema.safeParse(input);

  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return {
    success: false,
    issues: parsed.error.issues.map((issue) => ({
      path: [...issue.path] as Array<string | number>,
      message: issue.message,
    })),
  };
}

export function parseContentCatalog(input: unknown): ContentCatalog {
  const result = validateContentCatalog(input);

  if (!result.success) {
    throw new ContentCatalogValidationError(result.issues);
  }

  return result.data;
}
