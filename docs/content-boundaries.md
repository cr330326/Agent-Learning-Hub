# Content ownership and delivery boundaries

This document implements the content boundary established by
[ADR-0002](./adr/0002-third-party-materials-are-references.md). The machine-readable
source of truth is [content-boundaries.json](./content-boundaries.json); the audit
command verifies the relevant Git, Docker, and CI rules.

## Ownership model

| Area | Ownership | Git | Image / deployment |
| --- | --- | --- | --- |
| `code/` | Application source | Versioned | Included |
| `content/` | Curated Content authored or explicitly licensed for publication | Versioned | Included |
| `docs/` | Product, architecture, and operating documentation | Versioned | Excluded from runtime image |
| `learning-site/` | Migration and Phase 8 parity baseline | Versioned | Excluded from runtime image |
| `local-courses/` | Third-party Local Material | Excluded, except its metadata README | Excluded from cloud images; read-only local mount only |
| `data/` | SQLite, WAL, and local runtime user state | Excluded | Persistent volume only |
| `backups/` | Encrypted backup outputs | Excluded | External storage only |
| `reports/` | Repeatable audit evidence | Versioned when it is useful evidence | Excluded from runtime image |
| `.env*`, keys, certificates | Secret configuration | Excluded | Runtime secret only |

Curated Content must preserve source, author, and license information for third-party
learning items. A Local Material copy never grants permission to publish it in cloud
mode. The only allowed Git-tracked path below `local-courses/` is
`local-courses/README.md`, which documents the local library without copying its
contents.

## Enforcement

Run the audit from the repository root:

```bash
node scripts/audit-content-boundaries.mjs --output-dir reports/content-boundaries
```

The command writes JSON and Markdown reports and exits non-zero when a required ignore
rule is missing, an `actions/upload-artifact` step would expose protected data, or an
unapproved Local Material file is tracked by Git. CI must run this command before it
uploads any artifact.

The root `.dockerignore` is intentionally conservative: a cloud build context may not
contain `local-courses/`, runtime state, backups, secrets, audit output, or the legacy
site. Local mode receives `local-courses/` only through the read-only Compose mount that
will be introduced in Phase 5.
