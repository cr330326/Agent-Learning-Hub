import type { LearningDatabase } from "./database";
import { StateValidationError } from "./repository";

export const DISCOVERY_STATE_SCHEMA = `
CREATE TABLE discovery_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'news' CHECK(target_type='news'),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','completed')),
  bookmarked INTEGER NOT NULL DEFAULT 0 CHECK(bookmarked IN (0,1)),
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,item_id)
);
`;
export type DiscoveryPersonalState = {
  itemId: string;
  targetType: "news";
  status: "not_started" | "in_progress" | "completed";
  bookmarked: boolean;
  note: string;
  updatedAt: string;
};
export function listDiscoveryState(
  database: LearningDatabase,
  userId: string,
): DiscoveryPersonalState[] {
  const rows = database.handle
    .prepare(
      "SELECT * FROM discovery_state WHERE user_id=? ORDER BY updated_at DESC",
    )
    .all(userId) as {
    item_id: string;
    target_type: "news";
    status: DiscoveryPersonalState["status"];
    bookmarked: number;
    note: string;
    updated_at: string;
  }[];
  return rows.map((row) => ({
    itemId: row.item_id,
    targetType: row.target_type,
    status: row.status,
    bookmarked: Boolean(row.bookmarked),
    note: row.note,
    updatedAt: row.updated_at,
  }));
}
export function saveDiscoveryState(
  database: LearningDatabase,
  userId: string,
  input: {
    itemId: string;
    status?: DiscoveryPersonalState["status"];
    bookmarked?: boolean;
    note?: string;
  },
): DiscoveryPersonalState {
  return database.handle
    .transaction(() => {
      const current = listDiscoveryState(database, userId).find(
        (item) => item.itemId === input.itemId,
      );
      const count = database.handle
        .prepare(
          "SELECT COUNT(*) AS count,SUM(length(note)) AS noteLength FROM discovery_state WHERE user_id=?",
        )
        .get(userId) as { count: number; noteLength: number | null };
      if (!current && count.count >= 1000)
        throw new StateValidationError("资讯个人记录已达到 1000 条上限。");
      const note = input.note ?? current?.note ?? "";
      if (
        (count.noteLength ?? 0) - (current?.note.length ?? 0) + note.length >
        512000
      )
        throw new StateValidationError("资讯笔记总长度超过上限。");
      const updatedAt = new Date().toISOString();
      database.handle
        .prepare(
          `INSERT INTO discovery_state(user_id,item_id,status,bookmarked,note,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id,item_id) DO UPDATE SET status=excluded.status,bookmarked=excluded.bookmarked,note=excluded.note,updated_at=excluded.updated_at`,
        )
        .run(
          userId,
          input.itemId,
          input.status ?? current?.status ?? "not_started",
          Number(input.bookmarked ?? current?.bookmarked ?? false),
          note,
          updatedAt,
        );
      return listDiscoveryState(database, userId).find(
        (item) => item.itemId === input.itemId,
      )!;
    })
    .immediate();
}
