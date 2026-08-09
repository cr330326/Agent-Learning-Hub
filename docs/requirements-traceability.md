# Requirements traceability

This table links requirements to their implementation task and executable
evidence. Add a row when a task introduces behavior; do not mark a requirement
complete before its stated acceptance evidence exists.

| Requirement | Task | Automated evidence | Current status |
| --- | --- | --- | --- |
| IA-005, CAT-004, AC-10 | T0.1 | `tests/baseline-report.test.mjs` and `reports/baseline/` | Baseline established |
| CAT-001, CAT-002, CAT-005, DEPLOY-002, PRIV-001 | T0.2 | `tests/content-boundaries.test.mjs` and `reports/content-boundaries/` | Boundary enforced |
| NFR-006, NFR-007 | T0.3 | `code` quality scripts and `.github/workflows/quality.yml` | Guardrail established |
| DEPLOY-001, NFR-004, NFR-006 | T1.1 | `code/modules/runtime/runtime-config.test.ts`, build, and home-page smoke test | Locally verified |
| IA-001—IA-005, CAT-001—CAT-007 | T1.2 | `code/modules/catalog/content-schema.test.ts` | Catalog schema enforced |
| CAT-001—CAT-007, PAGE-003, PAGE-004 | T1.3 | `code/modules/catalog/catalog-api.test.ts` | Structured catalog API enforced |
| CAT-004, IA-005, AC-10 | T1.4 | `tests/legacy-content-converter.test.mjs` and `reports/legacy-conversion/` | Legacy conversion reconciled |

The detailed requirement-to-task mapping in
[docs/plans/tasks.md](./plans/tasks.md) remains authoritative for scope and
dependencies. This document records the test and command evidence as it is
implemented.
