import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { openDiscoveryDatabase, type DiscoveryDatabase } from "./database";
import { DiscoveryRepository } from "./repository";
import { DiscoveryBudget } from "./budget";
import {
  processDiscoveryVersion,
  TemporaryContent,
  type ModelConfig,
  modelConfig,
} from "./processing";
import type { PublicFetcher } from "./public-fetch";

const databases: DiscoveryDatabase[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const database of databases.splice(0)) database.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function setup() {
  const database = openDiscoveryDatabase(":memory:");
  databases.push(database);
  let time = Date.parse("2026-11-15T00:00:00Z");
  const now = () => time;
  const repo = new DiscoveryRepository(database, now);
  const source = repo.saveSource(
    {
      id: "engineering",
      name: "工程来源",
      kind: "json",
      url: "https://example.com/feed",
      topics: ["Harness Engineering"],
      publicationMode: "auto",
      enabled: true,
    },
    "admin",
  );
  repo.ingestPage(
    source,
    [
      {
        recordId: "a",
        title: "工程实践",
        url: "https://example.com/a",
        summary: "说明 Agent 工程的实际方法、代码样例与可复现评测。".repeat(8),
        publishedAt: "2026-11-14T23:00:00Z",
      },
    ],
    "run",
  );
  const job = repo.jobs.claim()!;
  const { versionId } = JSON.parse(job.payload) as { versionId: string };
  const directory = mkdtempSync(join(tmpdir(), "discovery-content-"));
  directories.push(directory);
  const temporary = new TemporaryContent(repo, directory, now);
  return {
    repo,
    job,
    versionId,
    temporary,
    directory,
    now,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
const config: ModelConfig = {
  url: "https://model.example.com/v1/chat/completions",
  key: "test-secret",
  model: "test-model",
  inputPrice: 1,
  outputPrice: 2,
  currency: "CNY",
  exchangeRate: 1,
};
const output = {
  title: "工程实践",
  summary: "通过代码与评测复现 Agent 的执行过程。",
  reason: "具备明确步骤和验证方式。",
  topics: ["Harness Engineering"],
  scores: { actionability: 5, verifiability: 5, relevance: 5, impact: 3 },
  scoreReasons: {
    actionability: "方法明确",
    verifiability: "代码可复现",
    relevance: "工程主题",
    impact: "实践应用",
  },
};
function modelResponse(url: string, content = JSON.stringify(output)) {
  return {
    url,
    status: 200,
    contentType: "application/json",
    text: JSON.stringify({
      id: "request-1",
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    }),
  };
}

describe("summary processing", () => {
  it("generates and reuses a grounded summary, charges once and publishes by source policy", async () => {
    const { repo, job, temporary, now, versionId } = setup();
    let calls = 0;
    const fetcher: PublicFetcher = async (url, options) => {
      calls++;
      const body = JSON.parse(options!.body!);
      expect(body.messages[1].content).toContain("可复现评测");
      expect(body.max_tokens).toBe(2048);
      return modelResponse(url);
    };
    await processDiscoveryVersion(repo, job, {
      fetcher,
      config,
      temporary,
      now,
    });
    const itemId = repo.version(versionId)!.item_id;
    expect(repo.publicItem(itemId)).toMatchObject({
      summary: output.summary,
      processingState: "ready",
    });
    expect(new DiscoveryBudget(repo.database, now).snapshot().spent).toBe(500);
    const retry = repo.jobs.enqueue({
      key: "manual-review",
      kind: "process",
      payload: { versionId, sourceId: "engineering" },
    });
    await processDiscoveryVersion(repo, repo.jobs.claim()!, {
      fetcher,
      config,
      temporary,
      now,
    });
    expect(calls).toBe(1);
    expect(repo.jobs.get(retry.id)?.state).toBe("completed");
  });
  it("queues budget-exhausted work without calling a model", async () => {
    const { repo, job, temporary, now } = setup();
    new DiscoveryBudget(repo.database, now).setLimit(0);
    await processDiscoveryVersion(repo, job, {
      config,
      temporary,
      now,
      fetcher: async () => {
        throw new Error("must not call");
      },
    });
    expect(repo.jobs.get(job.id)).toMatchObject({
      state: "waiting",
      error_code: "budget-exhausted",
      attempts: 0,
    });
  });
  it("keeps uncertain paid calls for reconciliation instead of charging a retry", async () => {
    const { repo, job, temporary, now, advance } = setup();
    let calls = 0;
    const fetcher: PublicFetcher = async () => {
      calls++;
      throw new Error("connection lost after send");
    };
    await processDiscoveryVersion(repo, job, {
      config,
      temporary,
      now,
      fetcher,
    });
    advance(3_600_000);
    await processDiscoveryVersion(repo, repo.jobs.claim()!, {
      config,
      temporary,
      now,
      fetcher,
    });
    expect(calls).toBe(1);
    expect(repo.jobs.get(job.id)?.error_code).toBe("receipt-needs-review");
  });
  it("records charged invalid JSON without retrying the same paid response", async () => {
    const { repo, job, temporary, now, versionId } = setup();
    await processDiscoveryVersion(repo, job, {
      config,
      temporary,
      now,
      fetcher: async (url) => modelResponse(url, "invalid JSON"),
    });
    expect(repo.version(versionId)?.processing_state).toBe(
      "model-output-invalid",
    );
    expect(repo.jobs.get(job.id)?.state).toBe("completed");
    expect(new DiscoveryBudget(repo.database, now).snapshot().spent).toBe(500);
  });
  it("cleans temporary originals at their deadline while retaining metadata", () => {
    const { repo, temporary, versionId, directory, advance } = setup();
    temporary.save(versionId, "公开原文");
    expect(temporary.read(versionId)?.text).toBe("公开原文");
    advance(7 * 86_400_000);
    expect(temporary.cleanup()).toBe(1);
    expect(readdirSync(directory)).toHaveLength(0);
    expect(repo.version(versionId)).not.toBeNull();
  });
});

it("sends DeepSeek a supported output cap matching the budget reservation", async () => {
  const { repo, job, temporary, now } = setup();
  let requestedLimit: number | undefined;
  await processDiscoveryVersion(repo, job, {
    config: {
      ...config,
      url: "https://api.deepseek.com/chat/completions",
      model: "deepseek-flash",
    },
    temporary,
    now,
    fetcher: async (url, options) => {
      requestedLimit = JSON.parse(options!.body!).max_tokens;
      return modelResponse(url);
    },
  });
  expect(requestedLimit).toBe(2048);
});

it("supports an explicit completion-limit field and rejects unsupported configuration", async () => {
  const { repo, job, temporary, now } = setup();
  await processDiscoveryVersion(repo, job, {
    config: { ...config, tokenLimitField: "max_completion_tokens" },
    temporary,
    now,
    fetcher: async (url, options) => {
      const body = JSON.parse(options!.body!);
      expect(body.max_completion_tokens).toBe(2048);
      expect(body).not.toHaveProperty("max_tokens");
      return modelResponse(url);
    },
  });
  const env = {
    DISCOVERY_MODEL_URL: config.url,
    DISCOVERY_MODEL_KEY: config.key,
    DISCOVERY_MODEL_NAME: config.model,
    DISCOVERY_INPUT_PRICE: "1",
    DISCOVERY_OUTPUT_PRICE: "2",
  };
  expect(modelConfig(env)?.tokenLimitField).toBe("max_tokens");
  expect(
    modelConfig({ ...env, DISCOVERY_MODEL_TOKEN_LIMIT_FIELD: "ignored_limit" }),
  ).toBeNull();
});

it("classifies a valid irrelevant output with empty topics as off-topic instead of a schema failure", async () => {
  const { repo, job, temporary, now, versionId } = setup();
  const unrelated = {
    ...output,
    topics: [],
    scores: { actionability: 0, verifiability: 0, relevance: 0, impact: 0 },
  };
  await processDiscoveryVersion(repo, job, {
    config,
    temporary,
    now,
    fetcher: async (url) => modelResponse(url, JSON.stringify(unrelated)),
  });
  expect(repo.version(versionId)?.processing_state).toBe("off-topic");
  expect(repo.jobs.get(job.id)?.state).toBe("completed");
  expect(repo.item(repo.version(versionId)!.item_id)?.publication_state).toBe(
    "draft",
  );
  expect(new DiscoveryBudget(repo.database, now).snapshot()).toMatchObject({
    spent: 500,
    reserved: 0,
  });
});
