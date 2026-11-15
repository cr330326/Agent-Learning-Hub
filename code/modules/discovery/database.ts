import Database from "better-sqlite3";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  compareSQLiteVersions,
  UnsupportedWalSQLiteVersionError,
  WAL_SAFE_MINIMUM_SQLITE_VERSION,
} from "../learning-state/database";

const SCHEMA_VERSION = 6;
const SCHEMA = `
CREATE TABLE discovery_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  unique_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','waiting','completed','failed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  heartbeat_at INTEGER,
  checkpoint TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX jobs_ready ON jobs(state, available_at, priority DESC);
CREATE TABLE worker_health (
  id TEXT PRIMARY KEY,
  heartbeat_at INTEGER NOT NULL,
  current_job TEXT
);
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings VALUES ('daily_budget_micros', '5000000');
CREATE TABLE model_receipts (
  call_key TEXT PRIMARY KEY,
  budget_day TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('reserved','dispatched','succeeded','released','unknown')),
  reserved_micros INTEGER NOT NULL CHECK(reserved_micros >= 0),
  actual_micros INTEGER CHECK(actual_micros >= 0),
  price_version TEXT NOT NULL,
  currency TEXT NOT NULL,
  exchange_rate REAL NOT NULL,
  provider_request_id TEXT,
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX receipts_day ON model_receipts(budget_day);
CREATE TABLE admin_actions (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const CONTENT_SCHEMA = `
CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  next_sync_at INTEGER NOT NULL,
  last_success_at INTEGER,
  upstream_updated_at INTEGER,
  last_error TEXT,
  progress TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE items (
  id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL UNIQUE,
  published_version TEXT,
  pending_version TEXT,
  publication_state TEXT NOT NULL DEFAULT 'draft' CHECK(publication_state IN ('draft','published','withdrawn')),
  protected_fields TEXT NOT NULL DEFAULT '{}',
  first_seen_at INTEGER NOT NULL,
  published_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE item_versions (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  content_hash TEXT NOT NULL,
  input TEXT NOT NULL,
  processing_state TEXT NOT NULL DEFAULT 'pending',
  output TEXT,
  processing_version TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(item_id,content_hash)
);
CREATE TABLE source_records (
  source_id TEXT NOT NULL REFERENCES sources(id),
  record_id TEXT NOT NULL,
  item_id TEXT NOT NULL REFERENCES items(id),
  version_id TEXT NOT NULL REFERENCES item_versions(id),
  last_seen_run TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'present',
  source_status TEXT,
  upstream_updated_at INTEGER,
  PRIMARY KEY(source_id,record_id)
);
CREATE INDEX records_item ON source_records(item_id);
CREATE TABLE metric_observations (
  item_id TEXT NOT NULL REFERENCES items(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  observed_at INTEGER NOT NULL,
  metrics TEXT NOT NULL,
  PRIMARY KEY(item_id,source_id,observed_at)
);
CREATE TABLE editions (
  day TEXT PRIMARY KEY,
  cutoff INTEGER NOT NULL,
  entries TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id),
  config TEXT NOT NULL,
  branch TEXT NOT NULL UNIQUE,
  pr_number INTEGER,
  pr_url TEXT,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE temporary_content (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES item_versions(id),
  filename TEXT NOT NULL UNIQUE,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  content_hash TEXT NOT NULL
);
INSERT INTO settings VALUES ('edition_hour', '9');
INSERT INTO settings VALUES ('edition_limit', '10');
`;

export type DiscoveryDatabase = {
  handle: Database.Database;
  schemaVersion: number;
  close(): void;
};

export function openDiscoveryDatabase(
  filename = process.env.DISCOVERY_DATABASE_PATH ??
    resolve(process.cwd(), ".data", "discovery.sqlite"),
): DiscoveryDatabase {
  const fileBacked = filename !== ":memory:";
  const existed = existsSync(filename);
  if (fileBacked)
    mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
  const handle = new Database(filename);
  try {
    const { version } = handle
      .prepare("SELECT sqlite_version() AS version")
      .get() as { version: string };
    if (compareSQLiteVersions(version, WAL_SAFE_MINIMUM_SQLITE_VERSION) < 0) {
      throw new UnsupportedWalSQLiteVersionError(version);
    }
    handle.pragma("foreign_keys = ON");
    handle.pragma("busy_timeout = 5000");
    handle.pragma("journal_mode = WAL");
    handle
      .transaction(() => {
        const table = handle
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'discovery_migrations'",
          )
          .get();
        if (!table) {
          handle.exec(SCHEMA);
          handle
            .prepare("INSERT INTO discovery_migrations VALUES (?, ?)")
            .run(1, Date.now());
        }
        const row = handle
          .prepare("SELECT MAX(version) AS version FROM discovery_migrations")
          .get() as { version: number };
        if (row.version === 1) {
          handle.exec(CONTENT_SCHEMA);
          handle
            .prepare("INSERT INTO discovery_migrations VALUES (?,?)")
            .run(2, Date.now());
        } else if (row.version > SCHEMA_VERSION)
          throw new Error("资讯数据库版本与应用不兼容。");
        if (row.version < 3) {
          handle.exec(`CREATE TABLE item_merges (
            source_id TEXT PRIMARY KEY REFERENCES items(id),
            target_id TEXT NOT NULL REFERENCES items(id),
            created_at INTEGER NOT NULL,
            CHECK(source_id<>target_id)
          );`);
          handle
            .prepare("INSERT INTO discovery_migrations VALUES (?,?)")
            .run(3, Date.now());
        }
        if (row.version < 4) {
          handle.exec(`CREATE TABLE github_result_files (
            source_id TEXT NOT NULL REFERENCES sources(id),
            path TEXT NOT NULL,
            sha TEXT NOT NULL,
            commit_sha TEXT NOT NULL,
            PRIMARY KEY(source_id,path)
          );
          CREATE TABLE item_urls (
            url TEXT PRIMARY KEY,
            item_id TEXT NOT NULL REFERENCES items(id)
          );`);
          handle
            .prepare("INSERT INTO discovery_migrations VALUES (?,?)")
            .run(4, Date.now());
        }
        if (row.version < 5) {
          handle.exec(
            "ALTER TABLE github_result_files ADD COLUMN record_ids TEXT NOT NULL DEFAULT '[]'; ALTER TABLE github_result_files ADD COLUMN parser_version INTEGER NOT NULL DEFAULT 0;",
          );
          handle
            .prepare("INSERT INTO discovery_migrations VALUES (?,?)")
            .run(5, Date.now());
        }
        if (row.version < 6) {
          handle.exec(
            "ALTER TABLE github_result_files ADD COLUMN rejected INTEGER NOT NULL DEFAULT 0; ALTER TABLE github_result_files ADD COLUMN error_code TEXT;",
          );
          handle
            .prepare("INSERT INTO discovery_migrations VALUES (?,?)")
            .run(6, Date.now());
        }
      })
      .immediate();
    if (fileBacked && !existed) {
      for (const suffix of ["", "-wal", "-shm"]) {
        if (existsSync(filename + suffix)) chmodSync(filename + suffix, 0o600);
      }
    }
    return {
      handle,
      schemaVersion: SCHEMA_VERSION,
      close: () => handle.close(),
    };
  } catch (error) {
    handle.close();
    throw error;
  }
}
