import { openDiscoveryDatabase } from "../../modules/discovery/database";
import { DiscoveryRepository } from "../../modules/discovery/repository";
import { randomUUID } from "node:crypto";

type Check = (label: string, condition: boolean, detail?: string) => void;
export async function verifyDiscoveryFlow(options: {
  request: (path: string, init?: RequestInit) => Promise<Response>;
  csrf: string;
  check: Check;
  databaseFilename: string;
}) {
  const { request, csrf, check } = options;
  const database = openDiscoveryDatabase(options.databaseFilename);
  const repo = new DiscoveryRepository(database);
  const runId = randomUUID();
  const sourceId = `e2e-engineering-${runId}`;
  const originalUrl = `https://example.com/e2e-harness/${runId}`;
  let itemId = "";
  try {
    const adminHeaders = {
      "content-type": "application/json",
      "x-csrf-token": csrf,
    };
    const source = {
      id: sourceId,
      name: "端到端工程信源",
      kind: "json",
      url: "https://example.com/e2e-feed",
      topics: ["Harness Engineering"],
      publicationMode: "manual",
      enabled: false,
    };
    const save = await request("/api/admin/discovery", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ action: "save-source", source }),
    });
    check(
      "admin saves a source through HTTP",
      save.status === 200,
      await save.text(),
    );
    const saved = repo.source(sourceId)!;
    repo.ingestPage(
      saved,
      [
        {
          recordId: "e2e-record",
          title: "端到端 Harness 工程实践",
          url: originalUrl,
          summary: "通过隔离工作区、代码与评测完成可复现的 Agent 工程。",
          publishedAt: new Date().toISOString(),
        },
      ],
      "e2e",
    );
    const row = database.handle
      .prepare(
        "SELECT item_id,version_id FROM source_records WHERE source_id=?",
      )
      .get(sourceId) as { item_id: string; version_id: string };
    itemId = row.item_id;
    const draft = await request(`/discover/${itemId}`);
    check("unpublished discovery content is hidden", draft.status === 404);
    const csrfFailure = await request("/api/admin/discovery", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", versionId: row.version_id }),
    });
    check("admin publication requires CSRF", csrfFailure.status === 403);
    const publish = await request("/api/admin/discovery", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ action: "publish", versionId: row.version_id }),
    });
    check("admin publishes selected version", publish.status === 200);
    const detail = await request(`/discover/${itemId}`);
    check(
      "published detail shows summary and original link",
      detail.ok && (await detail.text()).includes(originalUrl),
    );
    const saveState = await request("/api/state/discovery", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        targetType: "news",
        itemId,
        status: "completed",
        bookmarked: true,
        note: "资讯端到端私人笔记",
      }),
    });
    check(
      "discovery personal state saves via HTTP",
      saveState.status === 200,
      await saveState.text(),
    );
    const personal = await request("/api/state/discovery");
    const personalBody = (await personal.json()) as {
      state: { itemId: string; note: string }[];
    };
    check(
      "discovery state survives a subsequent request",
      personalBody.state.some(
        (item) => item.itemId === itemId && item.note === "资讯端到端私人笔记",
      ),
    );
    const exported = await request("/api/data");
    const exportedBody = (await exported.json()) as {
      schemaVersion: number;
      discoveryState: { itemId: string; targetType: string; note: string }[];
    };
    check(
      "version two export contains typed discovery state",
      exportedBody.schemaVersion === 2 &&
        exportedBody.discoveryState.some(
          (item) => item.targetType === "news" && item.itemId === itemId,
        ),
    );
    const markdown = await request("/api/data?format=notes");
    check(
      "Markdown export includes discovery notes",
      (await markdown.text()).includes("资讯端到端私人笔记"),
    );
    const invalid = await request("/api/state/discovery", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        targetType: "news",
        itemId: "news-00000000000000000000000000000000",
        note: "invalid",
      }),
    });
    check("unknown discovery targets are refused", invalid.status === 404);
    const withdraw = await request("/api/admin/discovery", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ action: "withdraw", itemId }),
    });
    check("admin withdrawal succeeds", withdraw.ok);
    const withdrawn = await request(`/discover/${itemId}`);
    check(
      "withdrawn details expose a placeholder",
      (await withdrawn.text()).includes("该资讯已撤下"),
    );
    const stillExported = await request("/api/data");
    check(
      "private notes remain exportable after withdrawal",
      (await stillExported.text()).includes("资讯端到端私人笔记"),
    );
    const page = await request("/discover");
    check(
      "discovery page has filters and source state",
      page.ok && (await page.text()).includes("关键词"),
    );
    return itemId;
  } finally {
    database.close();
  }
}
