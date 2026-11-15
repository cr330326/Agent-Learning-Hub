import { z } from "zod";

export const discoveryTopics = [
  "Harness Engineering",
  "AI Native 应用",
  "AI 编程",
  "Agent 架构",
  "上下文与记忆",
  "工具与 Skills",
  "评测与生产实践",
] as const;

const secretReference = z.string().regex(/^[A-Z][A-Z0-9_]{0,99}$/);
const mapping = z.record(z.string().max(100), z.string().max(200)).default({});

export const sourceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/),
    name: z.string().trim().min(1).max(200),
    kind: z.enum(["feishu", "rss", "json", "html", "github"]),
    contentType: z
      .enum(["article", "video", "tool", "update"])
      .default("article"),
    url: z
      .url()
      .max(2048)
      .refine((value) => ["https:", "http:"].includes(new URL(value).protocol)),
    enabled: z.boolean().default(false),
    publicationMode: z.enum(["manual", "auto"]).default("manual"),
    aggregation: z.boolean().default(false),
    priority: z.number().int().min(0).max(100).default(0),
    intervalMinutes: z.number().int().min(5).max(10080).default(60),
    topics: z.array(z.enum(discoveryTopics)).min(1).max(7),
    mapping,
    // Feishu mapping values are stable field IDs, resolved to names before reads.
    appToken: z
      .string()
      .regex(/^[a-zA-Z0-9]+$/)
      .max(100)
      .optional(),
    tableId: z
      .string()
      .regex(/^tbl[a-zA-Z0-9]+$/)
      .max(100)
      .optional(),
    viewId: z
      .string()
      .regex(/^vew[a-zA-Z0-9]+$/)
      .max(100)
      .optional(),
    tokenEnv: secretReference.optional(),
    appIdEnv: secretReference.optional(),
    appSecretEnv: secretReference.optional(),
    listPath: z.string().max(200).default(""),
    linkPattern: z.string().max(200).default(""),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "feishu" && (!value.appToken || !value.tableId)) {
      ctx.addIssue({
        code: "custom",
        message: "飞书来源需要 Base 与子表 ID。",
      });
    }
  });
export type CollectionSource = z.infer<typeof sourceSchema>;

export type SourceRecord = {
  recordId: string;
  title: string;
  url: string;
  author?: string;
  summary?: string;
  publishedAt?: string;
  updatedAt?: number;
  contentType?: "article" | "video" | "tool" | "update";
  metrics?: Record<string, string | number>;
  sourceStatus?: string;
  provenance?: { path: string; commit: string };
  topics?: (typeof discoveryTopics)[number][];
};

export const summarySchema = z
  .object({
    title: z.string().min(1).max(300),
    summary: z.string().min(1).max(5000),
    reason: z.string().min(1).max(2000),
    topics: z.array(z.enum(discoveryTopics)).max(7),
    scores: z
      .object({
        actionability: z.number().min(0).max(5),
        verifiability: z.number().min(0).max(5),
        relevance: z.number().min(0).max(5),
        impact: z.number().min(0).max(5),
      })
      .strict(),
    scoreReasons: z
      .object({
        actionability: z.string().max(500),
        verifiability: z.string().max(500),
        relevance: z.string().max(500),
        impact: z.string().max(500),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scores.relevance > 0 && value.topics.length === 0) {
      context.addIssue({
        code: "custom",
        message: "相关资讯至少需要一个主题。",
        path: ["topics"],
      });
    }
  });
export type SummaryOutput = z.infer<typeof summarySchema>;
