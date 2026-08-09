# Testing strategy

This strategy implements T0.3 and is intentionally lightweight at the start of
the project. It grows with the implementation tasks in
[docs/plans/tasks.md](./plans/tasks.md), rather than adding speculative tests.

## Test layers and locations

| Layer | Location | Tool | Purpose |
| --- | --- | --- | --- |
| Repository tooling | `tests/*.test.mjs` | Node test runner | Black-box checks for maintenance commands and repository boundaries |
| Module unit tests | `code/modules/<module>/*.test.ts` | Vitest | Public behavior of a single domain module |
| Route and integration tests | `code/app/**` or `code/tests/integration/**` | Vitest / HTTP client | Route-to-module behavior, database migrations, and authorization |
| End-to-end tests | `code/tests/e2e/**` | Playwright | Critical learner flows after the relevant UI exists |

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
unit tests, and a production Next.js build. Cloud and Local Mode use separate
`DEPLOYMENT_MODE` environments even before their adapters are implemented.

CI also runs the content-boundary audit before any artifact could be uploaded.
Future tasks add schema, integration, and end-to-end checks to these scripts;
production data and the full Local Material Library are never test fixtures.

## Test pyramid and review expectations

Most coverage should be fast module tests. Add integration tests for public route,
database, authorization, and resolver boundaries; reserve end-to-end tests for
critical learner journeys such as anonymous browsing, authenticated progress,
local reading, export, and account deletion. A test must fail for a meaningful
behavior regression, not for a private implementation refactor.
