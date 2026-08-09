import Database from "better-sqlite3";

export const WAL_SAFE_MINIMUM_SQLITE_VERSION = "3.51.3";

const INITIAL_SCHEMA_VERSION = 1;

const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('cloud', 'local')),
  github_id TEXT UNIQUE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  provider_account_id TEXT NOT NULL CHECK (length(provider_account_id) BETWEEN 1 AND 240),
  created_at TEXT NOT NULL,
  UNIQUE (provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) BETWEEN 1 AND 256),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS item_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS stage_task_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL CHECK (length(task_id) BETWEEN 1 AND 200),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, task_id)
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('item', 'stage')),
  scope_id TEXT NOT NULL CHECK (length(scope_id) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (length(body) <= 20000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL CHECK (length(item_id) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS stage_outcomes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL CHECK (length(stage_id) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('repository', 'demo', 'reflection')),
  url TEXT,
  summary TEXT CHECK (summary IS NULL OR length(summary) <= 20000),
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_item_progress_user_id ON item_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_stage_task_progress_user_id ON stage_task_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_stage_outcomes_user_id ON stage_outcomes(user_id);
CREATE INDEX IF NOT EXISTS idx_stage_outcomes_stage_id ON stage_outcomes(stage_id);
`;

type SQLiteVersionProvider = () => string;

export type LearningDatabaseOptions = {
  filename: string;
  enableWal?: boolean;
  sqliteVersionProvider?: SQLiteVersionProvider;
};

export type LearningDatabase = {
  readonly handle: Database.Database;
  readonly sqliteVersion: string;
  readonly schemaVersion: number;
  readonly foreignKeysEnabled: boolean;
  readonly journalMode: string;
  close(): void;
};

export class UnsupportedWalSQLiteVersionError extends Error {
  readonly sqliteVersion: string;

  constructor(sqliteVersion: string) {
    super(
      `SQLite ${sqliteVersion} is not safe for WAL; require ${WAL_SAFE_MINIMUM_SQLITE_VERSION} or newer.`,
    );
    this.name = "UnsupportedWalSQLiteVersionError";
    this.sqliteVersion = sqliteVersion;
  }
}

function compareSQLiteVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function readSQLiteVersion(database: Database.Database): string {
  const row = database.prepare("SELECT sqlite_version() AS version").get() as {
    version: string;
  };
  return row.version;
}

function applyMigrations(database: Database.Database): number {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const currentRow = database
    .prepare(
      "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
    )
    .get() as { version: number };

  if (currentRow.version < INITIAL_SCHEMA_VERSION) {
    const applyInitialMigration = database.transaction(() => {
      database.exec(INITIAL_SCHEMA_SQL);
      database
        .prepare(
          "INSERT INTO schema_migrations (version, applied_at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .run(INITIAL_SCHEMA_VERSION);
    });
    applyInitialMigration();
  }

  const finalRow = database
    .prepare(
      "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
    )
    .get() as { version: number };
  return finalRow.version;
}

export function openLearningDatabase(
  options: LearningDatabaseOptions,
): LearningDatabase {
  const database = new Database(options.filename);
  const sqliteVersion =
    options.sqliteVersionProvider?.() ?? readSQLiteVersion(database);
  const enableWal = options.enableWal ?? true;

  try {
    if (
      enableWal &&
      compareSQLiteVersions(sqliteVersion, WAL_SAFE_MINIMUM_SQLITE_VERSION) < 0
    ) {
      throw new UnsupportedWalSQLiteVersionError(sqliteVersion);
    }

    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    const journalMode = String(
      database.pragma(enableWal ? "journal_mode = WAL" : "journal_mode", {
        simple: true,
      }),
    ).toLowerCase();
    const schemaVersion = applyMigrations(database);
    const foreignKeysEnabled =
      Number(database.pragma("foreign_keys", { simple: true })) === 1;

    return {
      handle: database,
      sqliteVersion,
      schemaVersion,
      foreignKeysEnabled,
      journalMode,
      close: () => database.close(),
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
