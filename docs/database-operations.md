# SQLite state operations

The application stores identity, sessions, and private learning state in the
SQLite file configured by `STATE_DATABASE_PATH`. Public catalog content remains
Git-managed and is not copied into this database.

## Migrations

`code/modules/learning-state/database.ts` creates `schema_migrations` and applies
each schema version in a transaction. A failed migration is rolled back by
SQLite; starting again retries the same version. Foreign keys are enabled for
every connection and all personal tables cascade from `users`.

WAL is enabled only after checking the SQLite runtime version against the
project's safe minimum. The application currently requires SQLite `3.51.3` or
newer when WAL is enabled.

## Recovery boundary

The database file, `-wal`, and `-shm` siblings must be treated as one state unit.
Do not copy only the main file while the application is running. Stop writes or
use a SQLite-consistent backup mechanism, restore the complete state unit into a
writable directory, and let the application reopen it so migrations and foreign
key checks run again.

## Operator backup and restore commands

The repository includes an operator-side backup tool. It uses SQLite's backup
API to copy a consistent database snapshot, encrypts the snapshot with
AES-256-GCM, writes a checksum manifest, and prunes to seven daily slots plus
three weekly slots. Keep the output directory on encrypted storage and sync it
to an off-host destination; the application container never performs that
copy. Supply the passphrase through a secret manager or protected environment,
not shell history:

```bash
cd code
STATE_DATABASE_PATH=/data/state/learning-state.sqlite \
BACKUP_OUTPUT_DIR=/secure/backups/agent-learning-hub \
BACKUP_PASSPHRASE='use-a-secret-manager-value' \
npm run db:backup
```

Restore into a new, empty path first. The command requires `--yes`, decrypts
the archive, runs SQLite `quick_check`, and only then atomically installs the
database file:

```bash
cd code
BACKUP_PASSPHRASE='use-a-secret-manager-value' \
npm run db:restore -- \
  --input /secure/backups/agent-learning-hub/<backup>.sqlite.enc \
  --target /data/restore/learning-state.sqlite \
  --yes
```

The current implementation provides the consistency, encryption, checksum,
retention, and restore-verification primitives. Scheduling, external object
storage replication, alerting, and a dated clean-environment drill remain
deployment-owner work.
