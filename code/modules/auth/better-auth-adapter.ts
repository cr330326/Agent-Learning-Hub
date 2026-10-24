import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

import type { DBAdapter, JoinOption, Where } from "better-auth";
import type Database from "better-sqlite3";

type AuthRecord = Record<string, unknown>;
type DateLike = Date | string | number;

type StoredUser = {
  id: string;
  githubId: string | null;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type StoredAccount = {
  id: string;
  userId: string;
  providerId: string;
  accountId: string;
  createdAt: Date;
  updatedAt: Date;
};

type StoredSession = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

const PLACEHOLDER_EMAIL_SUFFIX = "@github.invalid";

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function dateValue(value: unknown, fallback = new Date()): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value as DateLike);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

function isoDate(value: unknown): string {
  return dateValue(value).toISOString();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function placeholderEmail(githubId: string | null, userId: string): string {
  return `${githubId ?? userId}${PLACEHOLDER_EMAIL_SUFFIX}`;
}

function githubIdFromEmail(email: unknown): string | null {
  if (typeof email !== "string" || !email.endsWith(PLACEHOLDER_EMAIL_SUFFIX)) {
    return null;
  }
  const githubId = email.slice(0, -PLACEHOLDER_EMAIL_SUFFIX.length);
  return githubId.length > 0 ? githubId : null;
}

function userFromRow(row: AuthRecord): StoredUser {
  return {
    id: stringValue(row.id),
    githubId: typeof row.github_id === "string" ? row.github_id : null,
    name: stringValue(row.display_name, "GitHub learner"),
    createdAt: dateValue(row.created_at),
    updatedAt: dateValue(row.updated_at),
  };
}

function accountFromRow(row: AuthRecord): StoredAccount {
  const createdAt = dateValue(row.created_at);
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    providerId: stringValue(row.provider),
    accountId: stringValue(row.provider_account_id),
    createdAt,
    updatedAt: createdAt,
  };
}

function sessionFromRow(row: AuthRecord): StoredSession {
  const createdAt = dateValue(row.created_at);
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    tokenHash: stringValue(row.token_hash),
    expiresAt: dateValue(row.expires_at),
    createdAt,
    updatedAt: createdAt,
    ipAddress: null,
    userAgent: null,
  };
}

function userOutput(user: StoredUser): AuthRecord {
  return {
    id: user.id,
    name: user.name,
    email: placeholderEmail(user.githubId, user.id),
    emailVerified: false,
    image: null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function accountOutput(account: StoredAccount): AuthRecord {
  return {
    id: account.id,
    userId: account.userId,
    providerId: account.providerId,
    accountId: account.accountId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function sessionOutput(session: StoredSession, token?: string): AuthRecord {
  return {
    id: session.id,
    userId: session.userId,
    token: token ?? session.tokenHash,
    expiresAt: session.expiresAt,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function compareValues(left: unknown, right: unknown): number {
  const leftDate = left instanceof Date ? left.getTime() : undefined;
  const rightDate = right instanceof Date ? right.getTime() : undefined;
  if (leftDate !== undefined || rightDate !== undefined) {
    return (
      Number(leftDate ?? new Date(String(left)).getTime()) -
      Number(rightDate ?? new Date(String(right)).getTime())
    );
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return String(left).localeCompare(String(right));
}

function rowValue(model: string, record: AuthRecord, field: string): unknown {
  const fields: Record<string, Record<string, string>> = {
    user: {
      githubId: "github_id",
      name: "display_name",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    account: {
      userId: "user_id",
      providerId: "provider",
      accountId: "provider_account_id",
      createdAt: "created_at",
      updatedAt: "created_at",
    },
    session: {
      userId: "user_id",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "created_at",
    },
  };
  return record[fields[model]?.[field] ?? field];
}

function whereMatches(
  model: string,
  record: AuthRecord,
  condition: Where,
): boolean {
  const operator = condition.operator ?? "eq";
  const value = condition.value;
  let actual = rowValue(model, record, condition.field);
  if (model === "user" && condition.field === "email") {
    actual = placeholderEmail(
      typeof record.github_id === "string" ? record.github_id : null,
      stringValue(record.id),
    );
  }
  if (model === "session" && condition.field === "token") {
    actual = stringValue(record.token_hash);
    if (typeof value === "string") {
      return operator === "eq"
        ? actual === hashToken(value)
        : operator === "ne"
          ? actual !== hashToken(value)
          : false;
    }
  }

  if (operator === "in" || operator === "not_in") {
    const values = Array.isArray(value) ? value : [value];
    const included = values.some(
      (candidate) => compareValues(actual, candidate) === 0,
    );
    return operator === "in" ? included : !included;
  }
  const comparison = compareValues(actual, value);
  switch (operator) {
    case "ne":
      return comparison !== 0;
    case "lt":
      return comparison < 0;
    case "lte":
      return comparison <= 0;
    case "gt":
      return comparison > 0;
    case "gte":
      return comparison >= 0;
    case "contains":
      return String(actual).includes(String(value));
    case "starts_with":
      return String(actual).startsWith(String(value));
    case "ends_with":
      return String(actual).endsWith(String(value));
    case "eq":
    default:
      return comparison === 0;
  }
}

function applySelect(record: AuthRecord, select?: string[]): AuthRecord {
  if (!select || select.length === 0) return record;
  const selected: AuthRecord = {};
  for (const field of select) {
    if (field in record) selected[field] = record[field];
  }
  if ("id" in record) selected.id = record.id;
  return selected;
}

// R05: authentication reads used to pull the whole table into JS and filter
// row by row, bypassing the indexes. Where clauses for the SQLite-backed
// models are now translated to parameterized SQL against an explicit field
// whitelist; anything the whitelist cannot express (or the in-memory
// verification map) falls back to the original JS path. Field names never
// reach the SQL string — only columns from these maps do.
type ModelSql = {
  table: string;
  columns: string;
  map: Record<string, string>;
};

const MODEL_SQL: Record<string, ModelSql> = {
  user: {
    table: "users",
    columns: "id, github_id, display_name, created_at, updated_at",
    map: {
      id: "id",
      githubId: "github_id",
      name: "display_name",
      // The stored placeholder email is derived, never persisted.
      email: "(COALESCE(github_id, id) || '@github.invalid')",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  account: {
    table: "accounts",
    columns: "id, user_id, provider, provider_account_id, created_at",
    map: {
      id: "id",
      userId: "user_id",
      providerId: "provider",
      accountId: "provider_account_id",
      createdAt: "created_at",
      updatedAt: "created_at",
    },
  },
  session: {
    table: "sessions",
    columns: "id, user_id, token_hash, expires_at, created_at",
    map: {
      id: "id",
      userId: "user_id",
      token: "token_hash",
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "created_at",
    },
  },
};

const COMPARISON_OPERATORS: Record<string, string> = {
  eq: "=",
  ne: "!=",
  lt: "<",
  lte: "<=",
  gt: ">",
  gte: ">=",
};

function likeEscape(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function comparableValue(value: unknown): string | number | boolean | null {
  if (value instanceof Date) return isoDate(value);
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return null;
}

function buildSqlWhere(
  model: string,
  where: Where[],
): { clause: string; params: unknown[] } | null {
  const map = MODEL_SQL[model]?.map;
  if (!map) return null;
  if (where.length === 0) return { clause: "", params: [] };

  const clauses: string[] = [];
  const params: unknown[] = [];
  for (const condition of where) {
    const operator = condition.operator ?? "eq";
    const column = map[condition.field];
    if (!column) return null;

    if (model === "session" && condition.field === "token") {
      // Tokens are stored hashed; only exact/negated lookups can be pushed down.
      if (
        (operator !== "eq" && operator !== "ne") ||
        typeof condition.value !== "string"
      ) {
        return null;
      }
      clauses.push(`(${column} ${operator === "eq" ? "=" : "!="} ?)`);
      params.push(hashToken(condition.value));
      continue;
    }

    if (operator === "in" || operator === "not_in") {
      const values = Array.isArray(condition.value)
        ? condition.value
        : [condition.value];
      const placeholders: string[] = [];
      for (const value of values) {
        const comparable = comparableValue(value);
        if (comparable === null) return null;
        placeholders.push("?");
        params.push(comparable);
      }
      if (placeholders.length === 0) {
        clauses.push(operator === "in" ? "(0)" : "(1)");
        continue;
      }
      clauses.push(
        `(${column} ${operator === "in" ? "IN" : "NOT IN"} (${placeholders.join(", ")}))`,
      );
      continue;
    }

    if (
      operator === "contains" ||
      operator === "starts_with" ||
      operator === "ends_with"
    ) {
      if (typeof condition.value !== "string") return null;
      const pattern =
        operator === "contains"
          ? `%${likeEscape(condition.value)}%`
          : operator === "starts_with"
            ? `${likeEscape(condition.value)}%`
            : `%${likeEscape(condition.value)}`;
      clauses.push(`(${column} LIKE ? ESCAPE '\\')`);
      params.push(pattern);
      continue;
    }

    const sqlOperator = COMPARISON_OPERATORS[operator];
    const comparable = comparableValue(condition.value);
    if (!sqlOperator || comparable === null) return null;
    clauses.push(`(${column} ${sqlOperator} ?)`);
    params.push(comparable);
  }
  return { clause: clauses.join(" AND "), params };
}

function createAdapter(handle: Database.Database): DBAdapter {
  const verificationRecords = new Map<string, AuthRecord>();

  // Transaction support (R04): better-sqlite3 is synchronous, so every
  // non-transactional adapter method performs all of its statements in one
  // microtask slice. The only way foreign statements can slip between a
  // transaction's BEGIN and COMMIT is through the callback's own awaits, so
  // while a transaction is open, calls that are not part of it (issued by
  // concurrent logins) wait for it to settle instead of joining it — otherwise
  // a rollback would also revert their writes. Calls made inside the
  // transaction callback are marked via AsyncLocalStorage and run directly.
  // Note: the in-memory verification map is intentionally not transactional.
  const txStorage = new AsyncLocalStorage<{ depth: number }>();
  let activeTransaction: Promise<unknown> | null = null;
  let savepointCounter = 0;

  const runGated = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (txStorage.getStore()) return operation();
    while (activeTransaction) {
      await activeTransaction.catch(() => {});
    }
    return operation();
  };

  const runTransaction = async <T>(
    callback: (tx: DBAdapter) => Promise<T>,
  ): Promise<T> => {
    const parent = txStorage.getStore();
    if (parent) {
      const savepoint = `agent_learning_hub_sp_${++savepointCounter}`;
      handle.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = await txStorage.run({ depth: parent.depth + 1 }, () =>
          callback(adapter),
        );
        handle.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        handle.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        handle.exec(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    }

    while (activeTransaction) {
      await activeTransaction.catch(() => {});
    }
    let releaseActiveTransaction = () => {};
    activeTransaction = new Promise<void>((resolveRelease) => {
      releaseActiveTransaction = resolveRelease;
    });
    try {
      handle.exec("BEGIN IMMEDIATE");
      const result = await txStorage.run({ depth: 1 }, () => callback(adapter));
      handle.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        handle.exec("ROLLBACK");
      } catch {
        // The connection itself failed; there is nothing left to roll back.
      }
      throw error;
    } finally {
      activeTransaction = null;
      releaseActiveTransaction();
    }
  };

  const readRows = (model: string): AuthRecord[] => {
    if (model === "user") {
      return handle
        .prepare(
          "SELECT id, github_id, display_name, created_at, updated_at FROM users",
        )
        .all() as AuthRecord[];
    }
    if (model === "account") {
      return handle
        .prepare(
          "SELECT id, user_id, provider, provider_account_id, created_at FROM accounts",
        )
        .all() as AuthRecord[];
    }
    if (model === "session") {
      return handle
        .prepare(
          "SELECT id, user_id, token_hash, expires_at, created_at FROM sessions",
        )
        .all() as AuthRecord[];
    }
    if (model === "verification") return [...verificationRecords.values()];
    return [];
  };

  const readRowById = (model: string, id: string): AuthRecord | undefined => {
    if (model === "user") {
      return handle
        .prepare(
          "SELECT id, github_id, display_name, created_at, updated_at FROM users WHERE id = ?",
        )
        .get(id) as AuthRecord | undefined;
    }
    if (model === "account") {
      return handle
        .prepare(
          "SELECT id, user_id, provider, provider_account_id, created_at FROM accounts WHERE id = ?",
        )
        .get(id) as AuthRecord | undefined;
    }
    if (model === "session") {
      return handle
        .prepare(
          "SELECT id, user_id, token_hash, expires_at, created_at FROM sessions WHERE id = ?",
        )
        .get(id) as AuthRecord | undefined;
    }
    return [...verificationRecords.values()].find(
      (row) => stringValue(row.id) === id,
    );
  };

  const outputRecord = (
    model: string,
    row: AuthRecord,
    token?: string,
  ): AuthRecord => {
    if (model === "user") return userOutput(userFromRow(row));
    if (model === "account") return accountOutput(accountFromRow(row));
    if (model === "session") return sessionOutput(sessionFromRow(row), token);
    return { ...row };
  };

  const findRows = (
    model: string,
    where: Where[] = [],
    limit = Number.POSITIVE_INFINITY,
    offset = 0,
    sortBy?: { field: string; direction: "asc" | "desc" },
  ): AuthRecord[] => {
    const modelSql = MODEL_SQL[model];
    const built = modelSql ? buildSqlWhere(model, where) : null;
    const sortColumn = sortBy ? modelSql?.map[sortBy.field] : "1";
    if (modelSql && built && sortColumn) {
      let sql = `SELECT ${modelSql.columns} FROM ${modelSql.table}`;
      const runParams = [...built.params];
      if (built.clause) sql += ` WHERE ${built.clause}`;
      if (sortBy) {
        sql += ` ORDER BY ${sortColumn} ${sortBy.direction === "asc" ? "ASC" : "DESC"}`;
      }
      if (Number.isFinite(limit) || offset > 0) {
        sql += " LIMIT ?";
        runParams.push(Number.isFinite(limit) ? limit : -1);
        if (offset > 0) {
          sql += " OFFSET ?";
          runParams.push(offset);
        }
      }
      return handle.prepare(sql).all(...runParams) as AuthRecord[];
    }

    // Fallback for the in-memory verification model and for where clauses the
    // whitelist cannot express (never produced by the OAuth flow).
    let rows = readRows(model).filter((row) =>
      where.every((condition) => whereMatches(model, row, condition)),
    );
    if (sortBy) {
      rows = rows.sort((left, right) => {
        const difference = compareValues(
          rowValue(model, left, sortBy.field),
          rowValue(model, right, sortBy.field),
        );
        return sortBy.direction === "asc" ? difference : -difference;
      });
    }
    return rows.slice(offset, offset + limit);
  };

  const getSessionToken = (where: Where[]): string | undefined => {
    const tokenCondition = where.find(
      (condition) => condition.field === "token",
    );
    return typeof tokenCondition?.value === "string"
      ? tokenCondition.value
      : undefined;
  };

  const toRecordForWhere = (model: string, row: AuthRecord, where: Where[]) =>
    outputRecord(model, row, getSessionToken(where));

  const applyJoin = (
    model: string,
    row: AuthRecord,
    result: AuthRecord,
    join?: JoinOption,
  ): AuthRecord => {
    if (join?.user && (model === "session" || model === "account")) {
      const userRow = handle
        .prepare("SELECT * FROM users WHERE id = ?")
        .get(stringValue(row.user_id)) as AuthRecord | undefined;
      if (userRow) result.user = userOutput(userFromRow(userRow));
    }
    if (join?.account && model === "user") {
      const accountRows = handle
        .prepare("SELECT * FROM accounts WHERE user_id = ?")
        .all(stringValue(row.id)) as AuthRecord[];
      result.account = accountRows.map((accountRow) =>
        accountOutput(accountFromRow(accountRow)),
      );
    }
    return result;
  };

  const deleteMatchingRows = (model: string, where: Where[]): number => {
    const rows = findRows(model, where);
    for (const row of rows) {
      const id = stringValue(row.id);
      if (model === "user") {
        handle.prepare("DELETE FROM users WHERE id = ?").run(id);
      } else if (model === "account") {
        handle.prepare("DELETE FROM accounts WHERE id = ?").run(id);
      } else if (model === "session") {
        handle.prepare("DELETE FROM sessions WHERE id = ?").run(id);
      } else if (model === "verification") {
        verificationRecords.delete(id);
      }
    }
    return rows.length;
  };

  const adapter: DBAdapter = {
    id: "agent-learning-hub-learning-state",

    async create<T extends Record<string, unknown>, R = T>({
      model,
      data,
    }: {
      model: string;
      data: Omit<T, "id">;
      select?: string[];
      forceAllowId?: boolean;
    }): Promise<R> {
      const input = data as Record<string, unknown>;
      const now = new Date();
      if (model === "user") {
        const id = stringValue(input.id, randomUUID());
        const githubId =
          stringValue(input.githubId) || githubIdFromEmail(input.email) || null;
        const name = stringValue(input.name, "GitHub learner").slice(0, 160);
        handle
          .prepare(
            `INSERT INTO users
              (id, mode, github_id, display_name, created_at, updated_at)
             VALUES (?, 'cloud', ?, ?, ?, ?)`,
          )
          .run(
            id,
            githubId,
            name || "GitHub learner",
            isoDate(input.createdAt ?? now),
            isoDate(input.updatedAt ?? now),
          );
        const row = handle
          .prepare("SELECT * FROM users WHERE id = ?")
          .get(id) as AuthRecord;
        return outputRecord(model, row) as R;
      }

      if (model === "account") {
        const id = stringValue(input.id, randomUUID());
        const userId = stringValue(input.userId);
        const providerId = stringValue(input.providerId);
        const accountId = stringValue(input.accountId);
        try {
          handle
            .prepare(
              `INSERT INTO accounts
                (id, user_id, provider, provider_account_id, created_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(
              id,
              userId,
              providerId,
              accountId,
              isoDate(input.createdAt ?? now),
            );
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes("UNIQUE")) {
            throw error;
          }
          const existing = handle
            .prepare(
              "SELECT * FROM accounts WHERE provider = ? AND provider_account_id = ?",
            )
            .get(providerId, accountId) as AuthRecord | undefined;
          if (!existing) throw error;
          return outputRecord(model, existing) as R;
        }
        const row = handle
          .prepare("SELECT * FROM accounts WHERE id = ?")
          .get(id) as AuthRecord;
        return outputRecord(model, row) as R;
      }

      if (model === "session") {
        const id = stringValue(input.id, randomUUID());
        const token = stringValue(input.token);
        handle
          .prepare(
            `INSERT INTO sessions
              (id, user_id, token_hash, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            stringValue(data.userId),
            hashToken(token),
            isoDate(input.expiresAt),
            isoDate(input.createdAt ?? now),
          );
        const row = handle
          .prepare("SELECT * FROM sessions WHERE id = ?")
          .get(id) as AuthRecord;
        return outputRecord(model, row, token) as R;
      }

      if (model === "verification") {
        const id = stringValue(input.id, randomUUID());
        const record = { ...input, id };
        verificationRecords.set(id, record);
        return record as R;
      }

      throw new Error(`Unsupported Better Auth model: ${model}`);
    },

    async findOne<T>({
      model,
      where,
      select,
      join,
    }: {
      model: string;
      where: Where[];
      select?: string[];
      join?: JoinOption;
    }): Promise<T | null> {
      const row = findRows(model, where, 1)[0];
      if (!row) return null as T | null;
      const result = applySelect(toRecordForWhere(model, row, where), select);
      return applyJoin(model, row, result, join) as T;
    },

    async findMany<T>({
      model,
      where,
      limit,
      offset,
      select,
      sortBy,
      join,
    }: {
      model: string;
      where?: Where[];
      limit?: number;
      select?: string[];
      sortBy?: { field: string; direction: "asc" | "desc" };
      offset?: number;
      join?: JoinOption;
    }): Promise<T[]> {
      const rows = findRows(model, where, limit, offset, sortBy);
      return rows.map((row) => {
        const result = applySelect(
          toRecordForWhere(model, row, where ?? []),
          select,
        );
        return applyJoin(model, row, result, join);
      }) as T[];
    },

    async count({ model, where }) {
      return findRows(model, where).length;
    },

    async incrementOne<T>({
      model,
      where,
      increment,
      set,
    }: {
      model: string;
      where: Where[];
      increment: Record<string, number>;
      set?: Record<string, unknown>;
    }): Promise<T | null> {
      const row = findRows(model, where, 1)[0];
      if (!row) return null as T | null;
      const id = stringValue(row.id);
      if (model === "verification") {
        const record = verificationRecords.get(id);
        if (!record) return null as T | null;
        for (const [field, delta] of Object.entries(increment)) {
          const current = typeof record[field] === "number" ? record[field] : 0;
          record[field] = current + delta;
        }
        Object.assign(record, set);
        return { ...record } as T;
      }
      return null as T | null;
    },

    async update<T>({
      model,
      where,
      update,
    }: {
      model: string;
      where: Where[];
      update: Record<string, unknown>;
    }): Promise<T | null> {
      const row = findRows(model, where, 1)[0];
      if (!row) return null as T | null;
      const id = stringValue(row.id);
      if (model === "user" && typeof update.name === "string") {
        handle
          .prepare(
            "UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?",
          )
          .run(update.name.slice(0, 160), new Date().toISOString(), id);
      } else if (model === "session" && update.expiresAt !== undefined) {
        handle
          .prepare("UPDATE sessions SET expires_at = ? WHERE id = ?")
          .run(isoDate(update.expiresAt), id);
      }
      const updated = readRowById(model, id);
      return (
        updated ? toRecordForWhere(model, updated, where) : null
      ) as T | null;
    },

    async updateMany({
      model,
      where,
      update,
    }: {
      model: string;
      where: Where[];
      update: Record<string, unknown>;
    }) {
      const rows = findRows(model, where);
      for (const row of rows) {
        await adapter.update({
          model,
          where: [{ field: "id", value: stringValue(row.id) }],
          update,
        });
      }
      return rows.length;
    },

    async delete({ model, where }) {
      deleteMatchingRows(model, where);
    },

    async deleteMany({ model, where }) {
      return deleteMatchingRows(model, where);
    },

    async consumeOne<T>({
      model,
      where,
    }: {
      model: string;
      where: Where[];
    }): Promise<T | null> {
      const row = findRows(model, where, 1)[0];
      if (!row) return null as T | null;
      const result = toRecordForWhere(model, row, where);
      deleteMatchingRows(model, [{ field: "id", value: stringValue(row.id) }]);
      return result as T;
    },

    transaction: runTransaction,
  };

  // Every statement behind these methods is synchronous, so once a call has
  // passed the gate it completes atomically. Only `transaction` bypasses the
  // gate: it manages exclusivity itself and marks its callback with the
  // AsyncLocalStorage context that lets the callback's own calls through.
  const gatedAdapter: DBAdapter = {
    id: adapter.id,
    create: (options) => runGated(() => adapter.create(options)),
    findOne: (options) => runGated(() => adapter.findOne(options)),
    findMany: (options) => runGated(() => adapter.findMany(options)),
    count: (options) => runGated(() => adapter.count(options)),
    incrementOne: (options) => runGated(() => adapter.incrementOne(options)),
    update: (options) => runGated(() => adapter.update(options)),
    updateMany: (options) => runGated(() => adapter.updateMany(options)),
    delete: (options) => runGated(() => adapter.delete(options)),
    deleteMany: (options) => runGated(() => adapter.deleteMany(options)),
    consumeOne: (options) => runGated(() => adapter.consumeOne(options)),
    transaction: runTransaction,
  };

  return gatedAdapter;
}

export function createLearningStateBetterAuthAdapter(
  handle: Database.Database,
): DBAdapter {
  return createAdapter(handle);
}

// Exposed for regression tests: they assert the parameterized SQL and the
// query plans it produces without having to reconstruct the mapping here.
export function buildAdapterWhereSql(
  model: string,
  where: Where[],
): { clause: string; params: unknown[] } | null {
  return buildSqlWhere(model, where);
}

export function stableGithubUserIdFromEmail(email: string): string | null {
  const githubId = githubIdFromEmail(email);
  return githubId ? `github-${githubId}` : null;
}
