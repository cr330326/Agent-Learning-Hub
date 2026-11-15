import { DiscoveryRepository, type DiscoveryInput } from "./repository";

function titleParts(title: string): Set<string> {
  const characters = Array.from(
    title.toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{Z}\p{S}]/gu, ""),
  );
  return new Set(
    characters
      .slice(0, -1)
      .map((character, index) => character + characters[index + 1]),
  );
}
export function mergeSuggestions(repo: DiscoveryRepository) {
  const rows = repo.database.handle
    .prepare(
      `SELECT i.id,v.input FROM items i JOIN item_versions v
    ON v.id=COALESCE(i.pending_version,i.published_version) WHERE i.publication_state<>'withdrawn'
    ORDER BY i.updated_at DESC LIMIT 100`,
    )
    .all() as { id: string; input: string }[];
  const items = rows.map((row) => ({
    id: row.id,
    input: JSON.parse(row.input) as DiscoveryInput,
  }));
  const suggestions: {
    leftId: string;
    rightId: string;
    leftTitle: string;
    rightTitle: string;
    similarity: number;
  }[] = [];
  for (let left = 0; left < items.length; left++) {
    const parts = titleParts(items[left].input.title);
    if (parts.size < 4) continue;
    for (let right = left + 1; right < items.length; right++) {
      const other = titleParts(items[right].input.title);
      const intersection = [...parts].filter((part) => other.has(part)).length;
      const similarity =
        intersection / (parts.size + other.size - intersection);
      if (similarity >= 0.7)
        suggestions.push({
          leftId: items[left].id,
          rightId: items[right].id,
          leftTitle: items[left].input.title,
          rightTitle: items[right].input.title,
          similarity,
        });
    }
  }
  return suggestions.sort((a, b) => b.similarity - a.similarity).slice(0, 20);
}
export function mergeDiscoveryItems(
  repo: DiscoveryRepository,
  sourceId: string,
  targetId: string,
  actor: string,
) {
  repo.database.handle
    .transaction(() => {
      const source = repo.item(sourceId);
      const target = repo.item(targetId);
      if (
        sourceId === targetId ||
        !source?.published_version ||
        target?.publication_state !== "published"
      )
        throw new Error("合并需要两个已发布条目。");
      if (
        repo.database.handle
          .prepare("SELECT 1 FROM item_merges WHERE source_id=?")
          .get(targetId)
      )
        throw new Error("合并目标已被关联至其他条目。");
      repo.database.handle
        .prepare("UPDATE item_merges SET target_id=? WHERE target_id=?")
        .run(targetId, sourceId);
      repo.database.handle
        .prepare(
          `INSERT INTO item_merges(source_id,target_id,created_at) VALUES (?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET target_id=excluded.target_id`,
        )
        .run(sourceId, targetId, Date.now());
      repo.setPublication(sourceId, "withdrawn", actor);
      repo.audit(actor, "merge-related-event", sourceId, { targetId });
    })
    .immediate();
}
