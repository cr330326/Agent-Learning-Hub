# Content schema location

The executable Content Catalog schema lives in
[`code/modules/catalog/content-schema.ts`](../../modules/catalog/content-schema.ts).
It uses Zod for runtime validation and derives the exported TypeScript types
from the same definitions. Keeping one executable schema prevents a JSON Schema
copy from drifting from the application contract.

This directory is reserved for future generated interchange schemas when an
external importer needs one; generated artifacts must identify the executable
schema revision they were produced from.
