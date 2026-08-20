# Testing strategy

This strategy implements T0.3 and is intentionally lightweight at the start of
the project. It grows with the implementation tasks in
[docs/plans/tasks.md](./plans/tasks.md), rather than adding speculative tests.

## Test layers and locations

| Layer                       | Location                                     | Tool                 | Purpose                                                             |
| --------------------------- | -------------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| Repository tooling          | `code/tests/*.test.mjs`                      | Node test runner     | Black-box checks for maintenance commands and repository boundaries |
| Module unit tests           | `code/modules/<module>/*.test.ts`            | Vitest               | Public behavior of a single domain module                           |
| Route and integration tests | `code/app/**` or `code/tests/integration/**` | Vitest / HTTP client | Route-to-module behavior, database migrations, and authorization    |
| End-to-end tests            | `code/tests/e2e/**`                          | Node fetch / tsx     | Critical learner flows across the real HTTP boundary                |
| Restore drill               | `code/scripts/restore-drill.ts`              | tsx / better-sqlite3 | Proves an encrypted backup restores into a clean environment        |

Use `*.test.ts` and `*.test.mjs` names. Tests must be independent, deterministic,
and verify public behavior. Mock only external boundaries such as a clock, network
service, or a disposable database; do not mock a module's own collaborators.

## Required checks

`code/package.json` is the single command source after scaffolding:

```bash
cd code
npm run check:cloud
npm run check:local
```

Each command runs formatting, ESLint, TypeScript, repository-tool tests, module
unit tests, a content audit, and a production Next.js build. Cloud and Local
Mode use separate `DEPLOYMENT_MODE` environments; production HTTP smoke tests
run after a separately started build.

CI also runs the content-boundary audit before any artifact could be uploaded.
Production data and the full Local Material Library are never test fixtures.

### Mode-specific end-to-end tests

`npm run check` deliberately excludes these: they need a started production
build, so CI runs them against the built server, once per mode.

```bash
APP_URL=http://127.0.0.1:3100 npm run test:e2e:local   # fixed single user
APP_URL=http://127.0.0.1:3100 npm run test:e2e:cloud   # logs in first
```

Both end by deleting the account, so `APP_URL` must name a throwaway instance
with its own `STATE_DATABASE_PATH` — never the local preview you actually use.
Local Mode has exactly one user, you, and every assertion before the deletion is
about state the test just wrote, so a wrong `APP_URL` destroys reading progress,
notes and bookmarks without anything looking wrong. `learning-state-http.mjs`
refuses to start against an instance that already holds learning state unless
`E2E_ALLOW_DESTRUCTIVE=1` says the data is disposable.

The split is not incidental. Local Mode signs a fixed user in automatically, so
its end-to-end test can start writing learning state immediately. Cloud Mode
cannot: login is the gate every other access rule hangs off, so the cloud test
has to hold a real session before any of it can be asserted. A cloud run that
skipped login would still pass every anonymous check and prove nothing about
the authenticated half.

`cloud-auth-state-http.mts` mints that session through Better Auth's own API
against the same SQLite file the server has open, stubbing only GitHub's token
and profile endpoints. The server accepts the cookie because the same library
and secret issued it — the test never re-implements cookie signing. It requires
`STATE_DATABASE_PATH`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to match the running server
exactly; a mismatch fails at "session resolves to the GitHub identity".

Minting the session that way makes the test a **second writer** on the server's
SQLite file, so the two processes must share a filesystem: CI, a dev machine, or
two containers on one volume. Pointing it at a containerised server whose state
sits on a macOS or Windows bind mount produces false failures — SQLite
coordinates WAL access through a memory-mapped `-shm` file, and that mapping is
not coherent across the VM boundary. Measured on the release image: writes land,
the deletion succeeds and the session stops authenticating, and yet the file
still shows the user row, so the run fails at "account deletion cascades every
private table" while the application is behaving correctly. A mid-test
checkpoint, "the database file agrees with the server about the note just
written", now names that situation instead. To exercise a container, give the
app and the test the same Docker volume — the production topology anyway — and
the same run passes 29/29.

### Restore drill

```bash
BACKUP_PASSPHRASE='<passphrase>' npm run drill:restore
```

A backup nobody has restored is a hypothesis. The drill runs the real
`db:backup` / `db:restore` commands, restores into a directory that has never
held a database, and compares row counts per private table. It also proves the
restore path _can_ fail — wrong passphrase, a single flipped ciphertext byte,
and restoring over an existing database must all be refused. A control that
passes when it should have failed exits non-zero just like a failed restore.

## Browser-driven review commands

Two commands need a running server and a Playwright browser, so `npm run check`
deliberately does not call them. Run both, in both modes, after touching the
interface or an interaction:

```bash
npm run audit:ui --prefix code -- --base-url <url> --item-id legacy-course-001
npm run audit:functional --prefix code -- --base-url <url>
```

`ui-review.mjs` captures full-page screenshots at three widths and fails on HTTP
errors, horizontal overflow, listing pages past the height budget, and console
errors. `functional-regression.mjs` operates the site — links, paging, filters,
chapter navigation, and the learning-state write/read/delete cycle — and branches
its assertions on the runtime mode badge.

**A clean run from both is a floor, not a verdict.** T8.9 found six defects
behind two green reports, including duplicated search results and a filter bar
whose submit button wrapped mid-word: none of them is an HTTP status, an
overflow, a height, or a console error. Read the screenshots the review writes to
`code/reports/ui-review/screenshots/`, and when a defect turns out to be real,
land the assertion that would have caught it alongside the fix.

## Test pyramid and review expectations

Most coverage should be fast module tests. Add integration tests for public route,
database, authorization, and resolver boundaries; reserve end-to-end tests for
critical learner journeys such as anonymous browsing, authenticated progress,
local reading, export, and account deletion. A test must fail for a meaningful
behavior regression, not for a private implementation refactor.
