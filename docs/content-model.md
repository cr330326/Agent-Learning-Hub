# Content model

`code/modules/catalog/content-schema.ts` is the executable source of truth for
the Content Catalog. It owns runtime validation and exports TypeScript types
inferred from the same Zod schemas; callers must use `parseContentCatalog` or
`validateContentCatalog` rather than recreating these rules.

## Catalog root

A catalog contains all four Learning Tracks plus `stages`, `stageTasks`,
`projectOutcomes`, and `items`.

- A **Learning Stage** has a stable ID, order, learning goals, maintainer guide,
  applicable tracks, and ordered references to its Stage Tasks and Project
  Outcomes.
- A **Stage Task** belongs to one Learning Stage and has acceptance criteria.
- A **Project Outcome** can belong to one Learning Stage and lists any known
  evidence types: `repository`, `demo`, or `reflection`. A legacy project
  ladder entry may retain a `null` stage while its mapping is not known.
- A **Learning Item** retains the fields required by the product spec: stable
  ID, track, stage IDs, summary, goals, source URL, optional local path, access
  policy, attribution, license status, tags, and review date. Catalog-only
  items may have no stage assignment.

## Repository layout

The initial structured catalog uses these Git-managed paths:

- `content/catalog/tracks.json` contains the four Learning Tracks.
- `content/stages/*.json` contains one Learning Stage, its Stage Tasks, and its
  Project Outcomes per file.
- `content/courses/*.json` and `content/articles/*.json` contain Learning
  Items. The directories express curation intent without copying any Local
  Material.
- `content/schemas/` documents the location of the executable schema.

`loadCatalogApiFromDirectory()` reads these files, validates each source file,
then validates cross-record references before serving the Catalog API. Its
`listItems()` filters by `stageId`, `track`, all requested `tags`, and
`accessPolicy`; results sort by stable ID. `getItem()` and `getStage()` return
`undefined` for a missing ID.

## Legacy import and pending metadata

`npm run convert:legacy` from `code/` deterministically converts
`learning-site/data.js` into `content/stages/legacy-import.json`,
`content/courses/legacy-import.json`, `content/catalog/project-outcomes.json`,
and a lossless source snapshot. It also writes
`reports/legacy-conversion/legacy-conversion.{json,md}` and reconciles its
counts with the baseline report.

The converter does not infer third-party attribution. It records `Unknown` as
an explicit pending sentinel for author and license, leaves a missing upstream
URL as `null`, and lists every unresolved record in the report. A
`local-preferred` item may therefore have only a relative `localPath`; this
preserves the Local Material reference without pretending that a cloud fallback
exists. `lastReviewedAt` is nullable for the same reason. All original legacy
fields remain in `legacyImport.raw` and the generated source snapshot.

## Publication and access rules

`publicationRights` makes the ownership declaration explicit:

- `project-owned` and `republication-authorized` may use `owned` only with a
  known license.
- `third-party` content requires an upstream source URL and cannot use
  `owned`.
- `upstream-only` requires an upstream URL and has no local path.
- `local-preferred` requires both a local path and an upstream fallback URL.
- `unavailable` has neither URL nor local path and must explain why.

`localPath` is always relative, POSIX-style, and traversal-free. The schema
only validates catalog metadata; the Content Resolver later decides whether a
local path is allowed and available in the current runtime mode.

## Referential integrity

All IDs use lowercase kebab case and are unique across the catalog. Stage
track/task/outcome references and Learning Item stage references must point to
existing records. Schema failures return field paths, so import and audit tools
can report the exact source record rather than a generic catalog error.
