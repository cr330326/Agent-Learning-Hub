import { describe, it, expect } from "vitest";
import { openDiscoveryDatabase } from "./database";
import { DiscoveryRepository } from "./repository";
import { mergeSuggestions, mergeDiscoveryItems } from "./merging";
describe("reviewed event merging", () => {
  it("suggests similar originals and preserves stable references after a maintainer confirms", () => {
    const db = openDiscoveryDatabase(":memory:");
    try {
      const repo = new DiscoveryRepository(db);
      const source = repo.saveSource(
        {
          id: "test",
          name: "来源",
          kind: "json",
          url: "https://example.com/feed",
          topics: ["Harness Engineering"],
        },
        "admin",
      );
      repo.ingestPage(
        source,
        [
          {
            recordId: "a",
            title: "Harness Engineering 可复现评测实践",
            url: "https://example.com/a",
          },
          {
            recordId: "b",
            title: "Harness Engineering 可复现评测实践案例",
            url: "https://example.com/b",
          },
        ],
        "run",
      );
      const rows = db.handle
        .prepare("SELECT id,pending_version FROM items ORDER BY canonical_url")
        .all() as { id: string; pending_version: string }[];
      for (const row of rows) repo.publishVersion(row.pending_version, "admin");
      expect(mergeSuggestions(repo)).toHaveLength(1);
      mergeDiscoveryItems(repo, rows[1].id, rows[0].id, "admin");
      expect(repo.listPublic().count).toBe(1);
      expect(repo.publicItem(rows[1].id)).toMatchObject({
        withdrawn: true,
        mergedInto: rows[0].id,
      });
      expect(repo.publicItem(rows[0].id)?.relatedOriginals).toEqual([
        {
          title: "Harness Engineering 可复现评测实践案例",
          url: "https://example.com/b",
        },
      ]);
      expect(() =>
        mergeDiscoveryItems(repo, rows[0].id, rows[1].id, "admin"),
      ).toThrow();
    } finally {
      db.close();
    }
  });
});
