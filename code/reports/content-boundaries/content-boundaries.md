# Content boundary audit

Generated: 2026-08-24T15:17:03.595Z

Status: PASS

## Ownership boundaries

| Path | Classification | Git | Image | Deployment |
| --- | --- | --- | --- | --- |
| code/ | application-source | included | included | included |
| code/content/ | curated-content | included | included | included |
| docs/ | project-documentation | included | excluded | excluded |
| learning-site/ | migration-baseline | included | excluded | excluded |
| local-courses/ | local-material | excluded | excluded | local-only |
| code/.data/ | runtime-user-state | excluded | excluded | persistent-volume |
| backups/ | encrypted-backup-output | excluded | excluded | external-storage |
| code/reports/ | development-audit-evidence | included | excluded | excluded |
| .env* | secret-configuration | excluded | excluded | runtime-secret |

## Checks

- Missing Git ignore rules: 0
- Missing Docker ignore rules: 0
- Unsafe CI artifact paths: 0
- Unapproved tracked local material files: 0
