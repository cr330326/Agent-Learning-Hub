import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  getDefaultContentRoot,
  loadContentCatalogFromDirectory,
} from "../catalog/catalog-api";
import {
  learningItemSchema,
  parseContentCatalog,
  type ContentCatalog,
} from "../catalog/content-schema";
import {
  fetchPublic,
  CollectionError,
  type PublicFetcher,
} from "./public-fetch";
import { DiscoveryRepository } from "./repository";
import { format, type Options } from "prettier";
import formattingOptions from "../../.prettierrc.json";

export const curationSchema = z.object({
  itemId: z.string().regex(/^news-[a-f0-9]{32}$/),
  learningId: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    .max(150),
  stageIds: z
    .array(z.string().regex(/^stage-[0-8]$/))
    .min(1)
    .max(9),
  track: z.enum(["learning", "aicoding", "agentic", "application"]),
  reason: z.string().min(1).max(2000),
  prerequisites: z.string().max(2000),
});
export type CurationInput = z.infer<typeof curationSchema>;
export type CurationProposal = {
  id: string;
  item_id: string;
  config: string;
  branch: string;
  pr_number: number | null;
  pr_url: string | null;
  state: string;
  updated_at: number;
};

export function proposeLearningItem(
  repo: DiscoveryRepository,
  value: unknown,
  actor: string,
) {
  const input = curationSchema.parse(value);
  const item = repo.publicItem(input.itemId);
  if (!item || item.withdrawn) throw new Error("需要已发布资讯。");
  const id = `curation-${input.itemId}`;
  repo.database.handle
    .transaction(() => {
      const existing = repo.database.handle
        .prepare("SELECT * FROM proposals WHERE id=?")
        .get(id) as CurationProposal | undefined;
      if (existing && existing.state !== "suggested") return;
      repo.database.handle
        .prepare(
          `INSERT INTO proposals(id,item_id,config,branch,state,updated_at) VALUES (?,?,?,?,'suggested',?)
      ON CONFLICT(id) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at`,
        )
        .run(
          id,
          input.itemId,
          JSON.stringify(input),
          `codex/learning-${input.itemId}`,
          Date.now(),
        );
      repo.audit(actor, "curation-proposal", id, {
        stageIds: input.stageIds,
        learningId: input.learningId,
      });
    })
    .immediate();
  return id;
}

export type GitHubAppConfig = {
  appId: string;
  installationId: string;
  privateKey: string;
  owner: string;
  repo: string;
  base: string;
};
export function githubAppConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): GitHubAppConfig {
  const {
    GITHUB_APP_ID: appId,
    GITHUB_APP_INSTALLATION_ID: installationId,
    GITHUB_REPOSITORY: repository,
    GITHUB_APP_PRIVATE_KEY_PATH: keyPath,
  } = environment;
  if (
    !appId ||
    !installationId ||
    !repository ||
    !keyPath ||
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !/^\d+$/.test(appId) ||
    !/^\d+$/.test(installationId)
  )
    throw new CollectionError("github-app-not-configured");
  const [owner, repo] = repository.split("/");
  return {
    appId,
    installationId,
    privateKey: readFileSync(keyPath, "utf8"),
    owner,
    repo,
    base: environment.GITHUB_BASE_BRANCH ?? "main",
  };
}

export class CurationGitHub {
  private token: string | null = null;
  constructor(
    private config: GitHubAppConfig,
    private fetcher: PublicFetcher = fetchPublic,
  ) {}
  async authenticate() {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ iat: now - 30, exp: now + 500, iss: this.config.appId }),
    ).toString("base64url");
    const unsigned = `${header}.${payload}`;
    const jwt = `${unsigned}.${createSign("RSA-SHA256").update(unsigned).sign(this.config.privateKey, "base64url")}`;
    const response = await this.fetcher(
      `https://api.github.com/app/installations/${this.config.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${jwt}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          repositories: [this.config.repo],
          permissions: { contents: "write", pull_requests: "write" },
        }),
        acceptedTypes: ["application/json"],
      },
    );
    const value = z
      .object({ token: z.string().min(1) })
      .parse(JSON.parse(response.text));
    this.token = value.token;
  }
  async request(path: string, body?: unknown): Promise<unknown> {
    if (!this.token) await this.authenticate();
    const response = await this.fetcher(
      `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          accept: "application/vnd.github+json",
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        acceptedTypes: ["application/json"],
        maxBytes: 8_000_000,
      },
    );
    return JSON.parse(response.text);
  }
  async optional(path: string) {
    try {
      return await this.request(path);
    } catch (error) {
      if (
        error instanceof CollectionError &&
        error.code === "upstream-http-404"
      )
        return null;
      throw error;
    }
  }
  async document(path: string, ref: string): Promise<unknown> {
    const data = z
      .object({ encoding: z.literal("base64"), content: z.string() })
      .parse(
        await this.request(`contents/${path}?ref=${encodeURIComponent(ref)}`),
      );
    return JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
  }
}

type StageDocument = {
  stage: ContentCatalog["stages"][number];
  stageTasks: ContentCatalog["stageTasks"];
  projectOutcomes: ContentCatalog["projectOutcomes"];
};
export async function createCurationPullRequest(
  repo: DiscoveryRepository,
  proposalId: string,
  options: {
    client?: CurationGitHub;
    config?: GitHubAppConfig;
    catalog?: ContentCatalog;
  } = {},
) {
  const proposal = repo.database.handle
    .prepare("SELECT * FROM proposals WHERE id=?")
    .get(proposalId) as CurationProposal | undefined;
  if (!proposal) throw new CollectionError("proposal-missing");
  const input = curationSchema.parse(JSON.parse(proposal.config));
  const item = repo.publicItem(input.itemId);
  if (!item || item.withdrawn)
    throw new CollectionError("proposal-source-unavailable");
  const config = options.config ?? githubAppConfig();
  const client = options.client ?? new CurationGitHub(config);
  const catalog =
    options.catalog ??
    (await loadContentCatalogFromDirectory(getDefaultContentRoot()));
  const headQuery = `${encodeURIComponent(config.owner)}:${encodeURIComponent(proposal.branch)}`;
  const existingPRs = z
    .array(
      z.object({ number: z.number(), html_url: z.url(), state: z.string() }),
    )
    .parse(
      await client.request(
        `pulls?state=all&head=${headQuery}&base=${encodeURIComponent(config.base)}&per_page=100`,
      ),
    );
  if (existingPRs.length) {
    const pr = existingPRs[0];
    repo.database.handle
      .prepare(
        "UPDATE proposals SET pr_number=?,pr_url=?,state=?,updated_at=? WHERE id=?",
      )
      .run(
        pr.number,
        pr.html_url,
        pr.state === "closed" ? "closed" : "pr-open",
        Date.now(),
        proposalId,
      );
    return pr;
  }
  const branch = await client.optional(
    `git/ref/heads/${encodeURIComponent(proposal.branch)}`,
  );
  if (!branch) {
    const ref = z
      .object({ object: z.object({ sha: z.string() }) })
      .parse(
        await client.request(
          `git/ref/heads/${encodeURIComponent(config.base)}`,
        ),
      );
    const commit = z
      .object({ tree: z.object({ sha: z.string() }) })
      .parse(await client.request(`git/commits/${ref.object.sha}`));
    const coursesDocument = z
      .array(z.unknown())
      .parse(
        await client.document(
          "code/content/courses/courses.json",
          ref.object.sha,
        ),
      );
    const courses = z.array(learningItemSchema).parse(coursesDocument);
    const stageDocuments = (await client.document(
      "code/content/stages/stages.json",
      ref.object.sha,
    )) as StageDocument[];
    const knownId = catalog.items.find(
      (entry) => entry.id === input.learningId,
    );
    if (
      knownId ||
      courses.some(
        (entry) =>
          entry.id === input.learningId || entry.sourceUrl === item.url,
      )
    )
      throw new CollectionError("catalog-duplicate-target");
    if (
      input.stageIds.some(
        (id) => !stageDocuments.some((document) => document.stage.id === id),
      )
    )
      throw new CollectionError("catalog-stage-missing");
    const learningItem = learningItemSchema.parse({
      id: input.learningId,
      title: item.title,
      track: input.track,
      stageIds: input.stageIds,
      summary: item.summary || input.reason,
      learningGoals: [input.reason],
      sourceUrl: item.url,
      localPath: null,
      accessPolicy: "upstream-only",
      publicationRights: "third-party",
      author: item.author || "Unknown",
      license: "Unknown",
      licenseStatus: "unknown",
      tags: item.topics,
      lastReviewedAt: new Date().toISOString().slice(0, 10),
      references: [],
      unavailableReason: null,
    });
    // Validate through the schema, but retain existing JSON member order and
    // provenance fields rather than serializing Zod's normalized objects.
    const nextCourses = [...coursesDocument, learningItem];
    const nextStages = stageDocuments.map((document) =>
      input.stageIds.includes(document.stage.id)
        ? {
            ...document,
            stage: {
              ...document.stage,
              learningItemIds: [
                ...new Set([
                  ...(document.stage.learningItemIds ?? []),
                  input.learningId,
                ]),
              ],
            },
          }
        : document,
    );
    parseContentCatalog({
      ...catalog,
      items: [
        ...nextCourses,
        ...catalog.items.filter((entry) => entry.accessPolicy === "owned"),
      ],
      stages: nextStages.map((document) => document.stage),
      stageTasks: nextStages.flatMap((document) => document.stageTasks),
    });
    const tree = z.object({ sha: z.string() }).parse(
      await client.request("git/trees", {
        base_tree: commit.tree.sha,
        tree: [
          {
            path: "code/content/courses/courses.json",
            mode: "100644",
            type: "blob",
            content: await format(JSON.stringify(nextCourses, null, 2), {
              ...formattingOptions,
              parser: "json",
            } as Options),
          },
          {
            path: "code/content/stages/stages.json",
            mode: "100644",
            type: "blob",
            content: await format(JSON.stringify(nextStages, null, 2), {
              ...formattingOptions,
              parser: "json",
            } as Options),
          },
        ],
      }),
    );
    const created = z.object({ sha: z.string() }).parse(
      await client.request("git/commits", {
        message: `content: 收录 ${item.title}`,
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    );
    try {
      await client.request("git/refs", {
        ref: `refs/heads/${proposal.branch}`,
        sha: created.sha,
      });
    } catch (error) {
      if (
        !(await client.optional(
          `git/ref/heads/${encodeURIComponent(proposal.branch)}`,
        ))
      )
        throw error;
    }
  }
  let result: unknown;
  const body = `收录来自每日发现的学习资料《${item.title}》。\n\n原始出处 ${item.url}\n\n学习价值\n\n${input.reason}\n\n前置知识\n\n${input.prerequisites || "由维护者复核"}\n\n适用阶段 ${input.stageIds.join("、")}\n\n目录条目标识 ${input.learningId}\n\n请审阅目录变更并通过仓库检查后合并，随后按固定版本发布。`;
  try {
    result = await client.request("pulls", {
      title: `收录学习资料 ${item.title}`,
      head: proposal.branch,
      base: config.base,
      body,
    });
  } catch (error) {
    const matches = z
      .array(z.unknown())
      .parse(
        await client.request(
          `pulls?state=all&head=${headQuery}&base=${encodeURIComponent(config.base)}&per_page=100`,
        ),
      );
    if (!matches.length) throw error;
    result = matches[0];
  }
  const pr = z.object({ number: z.number(), html_url: z.url() }).parse(result);
  repo.database.handle
    .prepare(
      "UPDATE proposals SET pr_number=?,pr_url=?,state='pr-open',updated_at=? WHERE id=?",
    )
    .run(pr.number, pr.html_url, Date.now(), proposalId);
  return pr;
}

export async function refreshCuration(
  repo: DiscoveryRepository,
  proposalId: string,
  catalog: ContentCatalog,
  client: CurationGitHub,
) {
  const proposal = repo.database.handle
    .prepare("SELECT * FROM proposals WHERE id=?")
    .get(proposalId) as CurationProposal | undefined;
  if (!proposal?.pr_number) return;
  const input = curationSchema.parse(JSON.parse(proposal.config));
  const entry = catalog.items.find((item) => item.id === input.learningId);
  const news = repo.publicItem(input.itemId);
  const installed =
    entry &&
    entry.sourceUrl === news?.url &&
    input.stageIds.every((id) => entry.stageIds.includes(id));
  const pr = z
    .object({ merged: z.boolean(), state: z.string() })
    .parse(await client.request(`pulls/${proposal.pr_number}`));
  const state = installed
    ? "live"
    : pr.merged
      ? "merged-unreleased"
      : pr.state === "closed"
        ? "closed"
        : "pr-open";
  repo.database.handle
    .prepare("UPDATE proposals SET state=?,updated_at=? WHERE id=?")
    .run(state, Date.now(), proposalId);
}
