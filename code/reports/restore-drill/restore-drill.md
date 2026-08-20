# SQLite restore drill

- Generated: 2026-08-20T05:25:23.279Z
- Source: synthetic fixture
- Steps: 16, failed: 0

| Result | Step | Detail |
| --- | --- | --- |
| PASS | synthetic source database seeded | every private table |
| PASS | source database carries rows to lose | {"users":1,"accounts":1,"sessions":1,"item_progress":1,"stage_task_progress":1,"notes":1,"bookmarks":1,"stage_outcomes":1} |
| PASS | db:backup produces an encrypted backup |  |
| PASS | backup is encrypted, not a readable SQLite file |  |
| PASS | backup has not yet been proven restorable | null |
| PASS | restore target environment is clean |  |
| PASS | db:restore rebuilds the database in the clean environment |  |
| PASS | restored database passes integrity_check | ok |
| PASS | restored schema matches the source | 10 tables |
| PASS | every private table restores with the same row count | {"users":1,"accounts":1,"sessions":1,"item_progress":1,"stage_task_progress":1,"notes":1,"bookmarks":1,"stage_outcomes":1} |
| PASS | the application reopens the restored database and reads every user | 1 users |
| PASS | the manifest records when the backup was proven restorable | 2026-08-20T05:25:21.355Z |
| PASS | a wrong passphrase cannot restore the backup | exit 1 |
| PASS | a tampered backup is rejected by authenticated decryption | exit 1 |
| PASS | restoring over an existing database is refused | exit 1 |
| PASS | restoring without --yes is refused | exit 1 |

## Row counts

| Table | Source | Restored |
| --- | --- | --- |
| users | 1 | 1 |
| accounts | 1 | 1 |
| sessions | 1 | 1 |
| item_progress | 1 | 1 |
| stage_task_progress | 1 | 1 |
| notes | 1 | 1 |
| bookmarks | 1 | 1 |
| stage_outcomes | 1 | 1 |
