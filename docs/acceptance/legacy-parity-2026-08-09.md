# Legacy parity review

Date: 2026-08-09  
Baseline: [`code/reports/baseline/baseline.md`](../../code/reports/baseline/baseline.md)
Scope: `learning-site/` migration baseline versus the `code/` application

## Decision

The seven capabilities recorded by the baseline report are covered by the new
application's first-release scope. No baseline capability is silently dropped.
The legacy site remains read-only until the separate production cutover gate is
closed; this report does not claim that cutover has happened.

## Capability comparison

| Baseline capability   | New application coverage                                                                              | Evidence                                                                                                                                                    | Decision              |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Learning route        | `/roadmap`, `/roadmap/[stageId]`, nine structured stages and project outcomes                         | `code/tests/e2e/public-pages-http-smoke.mjs`, `code/modules/catalog/catalog-api.test.ts`                                                                    | Keep in first release |
| Course catalog        | `/courses` and course detail pages backed by the validated Catalog API                                | `code/modules/catalog/catalog-api.test.ts`, `code/tests/e2e/public-pages-http-smoke.mjs`                                                                    | Keep in first release |
| Track filtering       | Catalog filters for stage, track, tag and access policy; search has the same stable IDs               | `code/modules/catalog/catalog-api.test.ts`, `code/modules/search/search-index.test.ts`                                                                      | Keep in first release |
| Local Markdown reader | Resolver-backed reader with allowlisted local chapters, upstream fallback and safe Markdown output    | `code/modules/content-resolver/local-content-resolver.test.ts`, `code/modules/reader/local-document-source.test.ts`, `code/modules/reader/markdown.test.ts` | Keep in first release |
| Reading progress      | Local single-user state and cloud per-user progress, position, bookmarks, notes and outcomes          | `code/modules/learning-state/repository.test.ts`, `code/tests/e2e/learning-state-http.mjs`, browser walk-through on Local Mode                              | Keep in first release |
| Local path audit      | Content audit plus allowlist/symlink/path-traversal checks; material update runs audit before reindex | `code/modules/catalog/content-audit.test.ts`, `code/modules/reader/local-file-access.test.ts`, `code/scripts/materials.ts`                                  | Keep in first release |
| Responsive layout     | Shared responsive shell and reader/search layouts; no horizontal overflow at 390×844                  | Chrome mobile walk-through, Lighthouse mobile snapshot, `code/app/globals.css`                                                                              | Keep in first release |

## Explicit migration decisions

- The old `learning-site/` static state format is not copied into the new
  database. The new state model uses stable catalog IDs and explicit actions.
- The old local file convention is replaced by the catalog `localPath` allowlist
  and the Local Content Resolver. A missing local file falls back to its
  validated upstream URL when one exists.
- Public catalog content stays in Git-managed `code/content/`; SQLite is reserved for
  identity, sessions and private learning state.
- The old root README and `local-courses/README.md` inventory were replaced by
  current dual-mode documentation. Counts now come from generated reports.

## Remaining gate

T8.1 is complete as a functional comparison. T8.2–T8.5 still require the
separate dual-mode acceptance, mobile accessibility checklist, security release
review, production recovery evidence and final cutover decision.
