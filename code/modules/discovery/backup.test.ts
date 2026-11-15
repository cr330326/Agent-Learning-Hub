import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { expect, it } from "vitest";
import { openLearningDatabase } from "../learning-state/database";
import { createLearningStateRepository } from "../learning-state/repository";
import { saveDiscoveryState } from "../learning-state/discovery-state";
import { openDiscoveryDatabase } from "./database";
import { DiscoveryRepository } from "./repository";
import { createDiscoveryBackup, restoreDiscoveryBackup } from "./backup";
it("backs up a coherent pair, restores references and refuses wrong passwords, corruption and existing targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "alh-two-db-"));
  const stateFilename = join(root, "state.sqlite");
  const discoveryFilename = join(root, "news.sqlite");
  const state = openLearningDatabase({ filename: stateFilename });
  const news = openDiscoveryDatabase(discoveryFilename);
  try {
    const users = createLearningStateRepository(state);
    const user = users.createUser({
      mode: "cloud",
      githubId: "1",
      displayName: "测试",
    });
    const repo = new DiscoveryRepository(news);
    const source = repo.saveSource(
      {
        id: "source",
        kind: "json",
        name: "来源",
        url: "https://example.com/feed",
        topics: ["Harness Engineering"],
      },
      "admin",
    );
    repo.ingestPage(
      source,
      [{ recordId: "1", title: "测试资讯", url: "https://example.com/a" }],
      "run",
    );
    const row = news.handle.prepare("SELECT id FROM items").get() as {
      id: string;
    };
    saveDiscoveryState(state, user.id, { itemId: row.id, note: "私人笔记" });
    const result = await createDiscoveryBackup({
      stateFilename,
      discoveryFilename,
      outputDirectory: join(root, "backup"),
      passphrase: "test-passphrase-2026",
      appVersion: "test-v1",
    });
    const batchFilename = join(result.directory, "batch.json");
    await expect(
      restoreDiscoveryBackup({
        batchFilename,
        targetDirectory: join(root, "wrong"),
        passphrase: "wrong-passphrase",
      }),
    ).rejects.toThrow();
    const encrypted = join(result.directory, result.batch.discovery);
    const original = await readFile(encrypted);
    const corrupt = Buffer.from(original);
    corrupt[corrupt.length - 1] ^= 1;
    await writeFile(encrypted, corrupt);
    await expect(
      restoreDiscoveryBackup({
        batchFilename,
        targetDirectory: join(root, "corrupt"),
        passphrase: "test-passphrase-2026",
      }),
    ).rejects.toThrow();
    await writeFile(encrypted, original);
    const restored = await restoreDiscoveryBackup({
      batchFilename,
      targetDirectory: join(root, "restored"),
      passphrase: "test-passphrase-2026",
    });
    const check = new Database(join(restored.target, "learning-state.sqlite"));
    expect(check.prepare("SELECT note FROM discovery_state").get()).toEqual({
      note: "私人笔记",
    });
    check.close();
    await expect(
      restoreDiscoveryBackup({
        batchFilename,
        targetDirectory: join(root, "restored"),
        passphrase: "test-passphrase-2026",
      }),
    ).rejects.toThrow("已存在");
  } finally {
    state.close();
    news.close();
    await rm(root, { recursive: true, force: true });
  }
});
