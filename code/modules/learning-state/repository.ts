import { randomUUID } from "node:crypto";

import type { LearningDatabase } from "./database";

export type LearningUserMode = "cloud" | "local";
export type ItemProgressStatus = "not_started" | "in_progress" | "completed";
export type NoteScopeType = "item" | "stage";
export type StageOutcomeKind = "repository" | "demo" | "reflection";

export type UserRecord = {
  id: string;
  mode: LearningUserMode;
  githubId: string | null;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type AccountRecord = {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
};

export type ItemProgressRecord = {
  userId: string;
  itemId: string;
  status: ItemProgressStatus;
  position: number;
  updatedAt: string;
};

export type StageTaskProgressRecord = {
  userId: string;
  taskId: string;
  completed: boolean;
  updatedAt: string;
};

export type NoteRecord = {
  id: string;
  userId: string;
  scopeType: NoteScopeType;
  scopeId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type BookmarkRecord = {
  userId: string;
  itemId: string;
  createdAt: string;
};

export type StageOutcomeRecord = {
  id: string;
  userId: string;
  stageId: string;
  kind: StageOutcomeKind;
  url: string | null;
  summary: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StageStatusRecord = {
  userId: string;
  stageId: string;
  completed: boolean;
  outcomeCount: number;
  completedTaskCount: number;
};

export type CreateUserInput = {
  id?: string;
  mode: LearningUserMode;
  githubId?: string | null;
  displayName: string;
};

export type CreateAccountInput = {
  id?: string;
  userId: string;
  provider: string;
  providerAccountId: string;
};

export type CreateSessionInput = {
  id?: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
};

export type SaveItemProgressInput = {
  userId: string;
  itemId: string;
  status: ItemProgressStatus;
  position?: number;
};

export type SaveStageTaskProgressInput = {
  userId: string;
  taskId: string;
  completed: boolean;
};

export type SaveNoteInput = {
  id?: string;
  userId: string;
  scopeType: NoteScopeType;
  scopeId: string;
  body: string;
};

export type CreateStageOutcomeInput = {
  id?: string;
  userId: string;
  stageId: string;
  kind: StageOutcomeKind;
  url?: string | null;
  summary?: string | null;
};

export type LearningStateSnapshot = {
  user: UserRecord;
  accounts: AccountRecord[];
  itemProgress: ItemProgressRecord[];
  stageTaskProgress: StageTaskProgressRecord[];
  notes: NoteRecord[];
  bookmarks: BookmarkRecord[];
  stageOutcomes: StageOutcomeRecord[];
};

export class StateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateValidationError";
  }
}

export class StateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateConflictError";
  }
}

function now(): string {
  return new Date().toISOString();
}

function assertNonEmpty(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new StateValidationError(`${fieldName} must not be empty.`);
  }
}

function assertLength(value: string, fieldName: string, maximum: number): void {
  assertNonEmpty(value, fieldName);
  if (value.length > maximum) {
    throw new StateValidationError(
      `${fieldName} exceeds ${maximum} characters.`,
    );
  }
}

function assertHttpUrl(value: string, fieldName: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new StateValidationError(`${fieldName} must be an HTTP(S) URL.`);
  }
}

function assertUserMode(value: LearningUserMode): void {
  if (value !== "cloud" && value !== "local") {
    throw new StateValidationError("mode must be cloud or local.");
  }
}

function assertItemStatus(value: ItemProgressStatus): void {
  if (
    value !== "not_started" &&
    value !== "in_progress" &&
    value !== "completed"
  ) {
    throw new StateValidationError("Invalid item progress status.");
  }
}

function assertNoteScope(value: NoteScopeType): void {
  if (value !== "item" && value !== "stage") {
    throw new StateValidationError("Note scope must be item or stage.");
  }
}

function assertOutcomeKind(value: StageOutcomeKind): void {
  if (value !== "repository" && value !== "demo" && value !== "reflection") {
    throw new StateValidationError("Invalid stage outcome kind.");
  }
}

function mapUser(row: unknown): UserRecord {
  const record = row as {
    id: string;
    mode: LearningUserMode;
    github_id: string | null;
    display_name: string;
    created_at: string;
    updated_at: string;
  };
  return {
    id: record.id,
    mode: record.mode,
    githubId: record.github_id,
    displayName: record.display_name,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function mapAccount(row: unknown): AccountRecord {
  const record = row as {
    id: string;
    user_id: string;
    provider: string;
    provider_account_id: string;
    created_at: string;
  };
  return {
    id: record.id,
    userId: record.user_id,
    provider: record.provider,
    providerAccountId: record.provider_account_id,
    createdAt: record.created_at,
  };
}

function mapSession(row: unknown): SessionRecord {
  const record = row as {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
    created_at: string;
  };
  return {
    id: record.id,
    userId: record.user_id,
    tokenHash: record.token_hash,
    expiresAt: record.expires_at,
    createdAt: record.created_at,
  };
}

function mapItemProgress(row: unknown): ItemProgressRecord {
  const record = row as {
    user_id: string;
    item_id: string;
    status: ItemProgressStatus;
    position: number;
    updated_at: string;
  };
  return {
    userId: record.user_id,
    itemId: record.item_id,
    status: record.status,
    position: record.position,
    updatedAt: record.updated_at,
  };
}

function mapStageTaskProgress(row: unknown): StageTaskProgressRecord {
  const record = row as {
    user_id: string;
    task_id: string;
    completed: number;
    updated_at: string;
  };
  return {
    userId: record.user_id,
    taskId: record.task_id,
    completed: record.completed === 1,
    updatedAt: record.updated_at,
  };
}

function mapNote(row: unknown): NoteRecord {
  const record = row as {
    id: string;
    user_id: string;
    scope_type: NoteScopeType;
    scope_id: string;
    body: string;
    created_at: string;
    updated_at: string;
  };
  return {
    id: record.id,
    userId: record.user_id,
    scopeType: record.scope_type,
    scopeId: record.scope_id,
    body: record.body,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function mapBookmark(row: unknown): BookmarkRecord {
  const record = row as {
    user_id: string;
    item_id: string;
    created_at: string;
  };
  return {
    userId: record.user_id,
    itemId: record.item_id,
    createdAt: record.created_at,
  };
}

function mapStageOutcome(row: unknown): StageOutcomeRecord {
  const record = row as {
    id: string;
    user_id: string;
    stage_id: string;
    kind: StageOutcomeKind;
    url: string | null;
    summary: string | null;
    confirmed_at: string | null;
    created_at: string;
    updated_at: string;
  };
  return {
    id: record.id,
    userId: record.user_id,
    stageId: record.stage_id,
    kind: record.kind,
    url: record.url,
    summary: record.summary,
    confirmedAt: record.confirmed_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function isSqliteConstraint(error: unknown, constraint: string): boolean {
  return (
    error instanceof Error && error.message.toUpperCase().includes(constraint)
  );
}

export type LearningStateRepository = {
  createUser(input: CreateUserInput): UserRecord;
  getUser(userId: string): UserRecord | null;
  getUserByGithubId(githubId: string): UserRecord | null;
  updateUserProfile(userId: string, input: { displayName: string }): UserRecord;
  deleteUser(userId: string): boolean;
  createAccount(input: CreateAccountInput): AccountRecord;
  listAccounts(userId: string): AccountRecord[];
  createSession(input: CreateSessionInput): SessionRecord;
  getSessionByTokenHash(tokenHash: string): SessionRecord | null;
  deleteSession(userId: string, sessionId: string): boolean;
  saveItemProgress(input: SaveItemProgressInput): ItemProgressRecord;
  getItemProgress(userId: string, itemId: string): ItemProgressRecord | null;
  listItemProgress(userId: string): ItemProgressRecord[];
  saveStageTaskProgress(
    input: SaveStageTaskProgressInput,
  ): StageTaskProgressRecord;
  listStageTaskProgress(userId: string): StageTaskProgressRecord[];
  saveNote(input: SaveNoteInput): NoteRecord;
  getNote(
    userId: string,
    scopeType: NoteScopeType,
    scopeId: string,
  ): NoteRecord | null;
  listNotes(userId: string): NoteRecord[];
  deleteNote(userId: string, noteId: string): boolean;
  setBookmark(input: { userId: string; itemId: string }): BookmarkRecord;
  listBookmarks(userId: string): BookmarkRecord[];
  removeBookmark(userId: string, itemId: string): boolean;
  createStageOutcome(input: CreateStageOutcomeInput): StageOutcomeRecord;
  listStageOutcomes(userId: string, stageId?: string): StageOutcomeRecord[];
  deleteStageOutcome(userId: string, outcomeId: string): boolean;
  confirmStageCompletion(userId: string, stageId: string): StageStatusRecord;
  getStageStatus(userId: string, stageId: string): StageStatusRecord;
  getStateSnapshot(userId: string): LearningStateSnapshot | null;
};

export function createLearningStateRepository(
  database: LearningDatabase,
): LearningStateRepository {
  const handle = database.handle;

  const getUser = (userId: string): UserRecord | null => {
    assertNonEmpty(userId, "userId");
    const row = handle.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    return row ? mapUser(row) : null;
  };

  const getStageStatus = (
    userId: string,
    stageId: string,
  ): StageStatusRecord => {
    assertNonEmpty(userId, "userId");
    assertNonEmpty(stageId, "stageId");
    const row = handle
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM stage_outcomes WHERE user_id = @userId AND stage_id = @stageId) AS outcome_count,
           (SELECT COUNT(*) FROM stage_task_progress
             WHERE user_id = @userId AND task_id LIKE @taskPrefix AND completed = 1) AS completed_task_count,
           EXISTS(
             SELECT 1 FROM stage_outcomes
              WHERE user_id = @userId AND stage_id = @stageId AND confirmed_at IS NOT NULL
           ) AS completed`,
      )
      .get({ userId, stageId, taskPrefix: `${stageId}-%` }) as {
      outcome_count: number;
      completed_task_count: number;
      completed: number;
    };
    return {
      userId,
      stageId,
      completed: row.completed === 1,
      outcomeCount: row.outcome_count,
      completedTaskCount: row.completed_task_count,
    };
  };

  return {
    createUser(input) {
      assertUserMode(input.mode);
      assertLength(input.displayName, "displayName", 160);
      if (input.githubId !== undefined && input.githubId !== null) {
        assertLength(input.githubId, "githubId", 240);
      }
      const userId = input.id ?? randomUUID();
      assertLength(userId, "id", 200);
      const timestamp = now();

      try {
        handle
          .prepare(
            `INSERT INTO users
              (id, mode, github_id, display_name, created_at, updated_at)
             VALUES (@id, @mode, @githubId, @displayName, @timestamp, @timestamp)`,
          )
          .run({
            id: userId,
            mode: input.mode,
            githubId: input.githubId ?? null,
            displayName: input.displayName,
            timestamp,
          });
      } catch (error) {
        if (isSqliteConstraint(error, "UNIQUE")) {
          throw new StateConflictError(`User ${userId} already exists.`);
        }
        throw error;
      }

      const user = getUser(userId);
      if (!user) throw new Error("Created user could not be read back.");
      return user;
    },

    getUser,

    getUserByGithubId(githubId) {
      assertLength(githubId, "githubId", 240);
      const row = handle
        .prepare("SELECT * FROM users WHERE github_id = ?")
        .get(githubId);
      return row ? mapUser(row) : null;
    },

    updateUserProfile(userId, input) {
      assertNonEmpty(userId, "userId");
      assertLength(input.displayName, "displayName", 160);
      const result = handle
        .prepare(
          "UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?",
        )
        .run(input.displayName, now(), userId);
      if (result.changes === 0) {
        throw new StateValidationError(`User ${userId} does not exist.`);
      }
      const user = getUser(userId);
      if (!user) throw new Error("Updated user could not be read back.");
      return user;
    },

    deleteUser(userId) {
      assertNonEmpty(userId, "userId");
      return (
        handle.prepare("DELETE FROM users WHERE id = ?").run(userId).changes > 0
      );
    },

    createAccount(input) {
      assertLength(input.userId, "userId", 200);
      assertLength(input.provider, "provider", 80);
      assertLength(input.providerAccountId, "providerAccountId", 240);
      const id = input.id ?? randomUUID();
      const timestamp = now();
      try {
        handle
          .prepare(
            `INSERT INTO accounts
              (id, user_id, provider, provider_account_id, created_at)
             VALUES (@id, @userId, @provider, @providerAccountId, @timestamp)`,
          )
          .run({
            id,
            userId: input.userId,
            provider: input.provider,
            providerAccountId: input.providerAccountId,
            timestamp,
          });
      } catch (error) {
        if (isSqliteConstraint(error, "UNIQUE")) {
          throw new StateConflictError(
            "This provider account is linked already.",
          );
        }
        if (isSqliteConstraint(error, "FOREIGN KEY")) {
          throw new StateValidationError(
            `User ${input.userId} does not exist.`,
          );
        }
        throw error;
      }
      const row = handle.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
      return mapAccount(row);
    },

    listAccounts(userId) {
      assertNonEmpty(userId, "userId");
      return handle
        .prepare("SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at")
        .all(userId)
        .map(mapAccount);
    },

    createSession(input) {
      assertLength(input.userId, "userId", 200);
      assertLength(input.tokenHash, "tokenHash", 256);
      assertLength(input.expiresAt, "expiresAt", 80);
      const id = input.id ?? randomUUID();
      const timestamp = now();
      try {
        handle
          .prepare(
            `INSERT INTO sessions
              (id, user_id, token_hash, expires_at, created_at)
             VALUES (@id, @userId, @tokenHash, @expiresAt, @timestamp)`,
          )
          .run({
            id,
            userId: input.userId,
            tokenHash: input.tokenHash,
            expiresAt: input.expiresAt,
            timestamp,
          });
      } catch (error) {
        if (isSqliteConstraint(error, "UNIQUE")) {
          throw new StateConflictError("This session token is already stored.");
        }
        if (isSqliteConstraint(error, "FOREIGN KEY")) {
          throw new StateValidationError(
            `User ${input.userId} does not exist.`,
          );
        }
        throw error;
      }
      const row = handle.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
      return mapSession(row);
    },

    getSessionByTokenHash(tokenHash) {
      assertLength(tokenHash, "tokenHash", 256);
      const row = handle
        .prepare("SELECT * FROM sessions WHERE token_hash = ?")
        .get(tokenHash);
      return row ? mapSession(row) : null;
    },

    deleteSession(userId, sessionId) {
      assertNonEmpty(userId, "userId");
      assertNonEmpty(sessionId, "sessionId");
      return (
        handle
          .prepare("DELETE FROM sessions WHERE user_id = ? AND id = ?")
          .run(userId, sessionId).changes > 0
      );
    },

    saveItemProgress(input) {
      assertLength(input.userId, "userId", 200);
      assertLength(input.itemId, "itemId", 200);
      assertItemStatus(input.status);
      const position = input.position ?? 0;
      if (!Number.isInteger(position) || position < 0) {
        throw new StateValidationError(
          "position must be a non-negative integer.",
        );
      }
      const timestamp = now();
      try {
        handle
          .prepare(
            `INSERT INTO item_progress
              (user_id, item_id, status, position, updated_at)
             VALUES (@userId, @itemId, @status, @position, @timestamp)
             ON CONFLICT(user_id, item_id) DO UPDATE SET
              status = excluded.status,
              position = excluded.position,
              updated_at = excluded.updated_at`,
          )
          .run({
            userId: input.userId,
            itemId: input.itemId,
            status: input.status,
            position,
            timestamp,
          });
      } catch (error) {
        if (isSqliteConstraint(error, "FOREIGN KEY")) {
          throw new StateValidationError(
            `User ${input.userId} does not exist.`,
          );
        }
        throw error;
      }
      return this.getItemProgress(input.userId, input.itemId)!;
    },

    getItemProgress(userId, itemId) {
      assertLength(userId, "userId", 200);
      assertLength(itemId, "itemId", 200);
      const row = handle
        .prepare(
          "SELECT * FROM item_progress WHERE user_id = ? AND item_id = ?",
        )
        .get(userId, itemId);
      return row ? mapItemProgress(row) : null;
    },

    listItemProgress(userId) {
      assertNonEmpty(userId, "userId");
      return handle
        .prepare(
          "SELECT * FROM item_progress WHERE user_id = ? ORDER BY updated_at DESC",
        )
        .all(userId)
        .map(mapItemProgress);
    },

    saveStageTaskProgress(input) {
      assertLength(input.userId, "userId", 200);
      assertLength(input.taskId, "taskId", 200);
      const timestamp = now();
      try {
        handle
          .prepare(
            `INSERT INTO stage_task_progress
              (user_id, task_id, completed, updated_at)
             VALUES (@userId, @taskId, @completed, @timestamp)
             ON CONFLICT(user_id, task_id) DO UPDATE SET
              completed = excluded.completed,
              updated_at = excluded.updated_at`,
          )
          .run({
            userId: input.userId,
            taskId: input.taskId,
            completed: input.completed ? 1 : 0,
            timestamp,
          });
      } catch (error) {
        if (isSqliteConstraint(error, "FOREIGN KEY")) {
          throw new StateValidationError(
            `User ${input.userId} does not exist.`,
          );
        }
        throw error;
      }
      const row = handle
        .prepare(
          "SELECT * FROM stage_task_progress WHERE user_id = ? AND task_id = ?",
        )
        .get(input.userId, input.taskId);
      return mapStageTaskProgress(row);
    },

    listStageTaskProgress(userId) {
      assertNonEmpty(userId, "userId");
      return handle
        .prepare(
          "SELECT * FROM stage_task_progress WHERE user_id = ? ORDER BY updated_at DESC",
        )
        .all(userId)
        .map(mapStageTaskProgress);
    },

    saveNote(input) {
      assertLength(input.userId, "userId", 200);
      assertNoteScope(input.scopeType);
      assertLength(input.scopeId, "scopeId", 200);
      if (input.body.length > 20_000) {
        throw new StateValidationError("body exceeds 20000 characters.");
      }
      const id = input.id ?? randomUUID();
      const timestamp = now();
      try {
        handle
          .prepare(
            `INSERT INTO notes
              (id, user_id, scope_type, scope_id, body, created_at, updated_at)
             VALUES (@id, @userId, @scopeType, @scopeId, @body, @timestamp, @timestamp)
             ON CONFLICT(user_id, scope_type, scope_id) DO UPDATE SET
              body = excluded.body,
              updated_at = excluded.updated_at`,
          )
          .run({
            id,
            userId: input.userId,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            body: input.body,
            timestamp,
          });
      } catch (error) {
        if (isSqliteConstraint(error, "FOREIGN KEY")) {
          throw new StateValidationError(
            `User ${input.userId} does not exist.`,
          );
        }
        throw error;
      }
      return this.getNote(input.userId, input.scopeType, input.scopeId)!;
    },

    getNote(userId, scopeType, scopeId) {
      assertNonEmpty(userId, "userId");
      assertNoteScope(scopeType);
      assertLength(scopeId, "scopeId", 200);
      const row = handle
        .prepare(
          "SELECT * FROM notes WHERE user_id = ? AND scope_type = ? AND scope_id = ?",
        )
        .get(userId, scopeType, scopeId);
      return row ? mapNote(row) : null;
    },

    listNotes(userId) {
      assertNonEmpty(userId, "userId");
      return handle
        .prepare(
          "SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC",
        )
        .all(userId)
        .map(mapNote);
    },

    deleteNote(userId, noteId) {
      assertNonEmpty(userId, "userId");
      assertNonEmpty(noteId, "noteId");
      return (
        handle
          .prepare("DELETE FROM notes WHERE user_id = ? AND id = ?")
          .run(userId, noteId).changes > 0
      );
    },

    setBookmark(input) {
      assertLength(input.userId, "userId", 200);
      assertLength(input.itemId, "itemId", 200);
      const timestamp = now();
      try {
        handle
          .prepare(
            `INSERT INTO bookmarks (user_id, item_id, created_at)
             VALUES (@userId, @itemId, @timestamp)
             ON CONFLICT(user_id, item_id) DO NOTHING`,
          )
          .run({ userId: input.userId, itemId: input.itemId, timestamp });
      } catch (error) {
        if (isSqliteConstraint(error, "FOREIGN KEY")) {
          throw new StateValidationError(
            `User ${input.userId} does not exist.`,
          );
        }
        throw error;
      }
      const row = handle
        .prepare("SELECT * FROM bookmarks WHERE user_id = ? AND item_id = ?")
        .get(input.userId, input.itemId);
      return mapBookmark(row);
    },

    listBookmarks(userId) {
      assertNonEmpty(userId, "userId");
      return handle
        .prepare(
          "SELECT * FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC",
        )
        .all(userId)
        .map(mapBookmark);
    },

    removeBookmark(userId, itemId) {
      assertNonEmpty(userId, "userId");
      assertLength(itemId, "itemId", 200);
      return (
        handle
          .prepare("DELETE FROM bookmarks WHERE user_id = ? AND item_id = ?")
          .run(userId, itemId).changes > 0
      );
    },

    createStageOutcome(input) {
      assertLength(input.userId, "userId", 200);
      assertLength(input.stageId, "stageId", 200);
      assertOutcomeKind(input.kind);
      const url = input.url ?? null;
      const summary = input.summary ?? null;
      if (url !== null) {
        assertLength(url, "url", 2_000);
        assertHttpUrl(url, "url");
      }
      if (summary !== null && summary.length > 20_000) {
        throw new StateValidationError("summary exceeds 20000 characters.");
      }
      if ((input.kind === "repository" || input.kind === "demo") && !url) {
        throw new StateValidationError(`${input.kind} outcomes require a URL.`);
      }
      if (input.kind === "reflection" && !summary?.trim()) {
        throw new StateValidationError(
          "reflection outcomes require a summary.",
        );
      }
      const id = input.id ?? randomUUID();
      const timestamp = now();
      try {
        handle
          .prepare(
            `INSERT INTO stage_outcomes
              (id, user_id, stage_id, kind, url, summary, confirmed_at, created_at, updated_at)
             VALUES (@id, @userId, @stageId, @kind, @url, @summary, NULL, @timestamp, @timestamp)`,
          )
          .run({
            id,
            userId: input.userId,
            stageId: input.stageId,
            kind: input.kind,
            url,
            summary,
            timestamp,
          });
      } catch (error) {
        if (isSqliteConstraint(error, "FOREIGN KEY")) {
          throw new StateValidationError(
            `User ${input.userId} does not exist.`,
          );
        }
        throw error;
      }
      const row = handle
        .prepare("SELECT * FROM stage_outcomes WHERE id = ?")
        .get(id);
      return mapStageOutcome(row);
    },

    listStageOutcomes(userId, stageId) {
      assertNonEmpty(userId, "userId");
      if (stageId !== undefined) assertLength(stageId, "stageId", 200);
      const rows = stageId
        ? handle
            .prepare(
              "SELECT * FROM stage_outcomes WHERE user_id = ? AND stage_id = ? ORDER BY created_at DESC",
            )
            .all(userId, stageId)
        : handle
            .prepare(
              "SELECT * FROM stage_outcomes WHERE user_id = ? ORDER BY created_at DESC",
            )
            .all(userId);
      return rows.map(mapStageOutcome);
    },

    deleteStageOutcome(userId, outcomeId) {
      assertNonEmpty(userId, "userId");
      assertNonEmpty(outcomeId, "outcomeId");
      return (
        handle
          .prepare("DELETE FROM stage_outcomes WHERE user_id = ? AND id = ?")
          .run(userId, outcomeId).changes > 0
      );
    },

    confirmStageCompletion(userId, stageId) {
      const outcomes = this.listStageOutcomes(userId, stageId);
      if (outcomes.length === 0) {
        throw new StateValidationError(
          "Add at least one stage outcome before confirming completion.",
        );
      }
      const timestamp = now();
      handle
        .prepare(
          `UPDATE stage_outcomes
             SET confirmed_at = COALESCE(confirmed_at, @timestamp), updated_at = @timestamp
           WHERE user_id = @userId AND stage_id = @stageId`,
        )
        .run({ userId, stageId, timestamp });
      return getStageStatus(userId, stageId);
    },

    getStageStatus,

    getStateSnapshot(userId) {
      const user = getUser(userId);
      if (!user) return null;
      return {
        user,
        accounts: this.listAccounts(userId),
        itemProgress: this.listItemProgress(userId),
        stageTaskProgress: this.listStageTaskProgress(userId),
        notes: this.listNotes(userId),
        bookmarks: this.listBookmarks(userId),
        stageOutcomes: this.listStageOutcomes(userId),
      };
    },
  };
}
