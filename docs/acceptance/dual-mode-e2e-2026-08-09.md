# Dual-mode end-to-end acceptance

Date: 2026-08-09  
Scope: `code/` production build, Local Mode, Cloud Mode, and the ten AC
scenarios in [`spec.md`](../plans/spec.md)

## Result

The application-level Local Mode and Cloud Mode smoke flows passed locally.
Local Mode also completed the state, note, bookmark, outcome, export and
delete flow over HTTP, and the mobile browser walkthrough is recorded in the
[mobile acceptance report](./mobile-accessibility-2026-08-09.md). This report
does not claim release acceptance: real GitHub account restoration, a
clean-room image run, off-host backup recovery and production rollback still
need deployment-owned evidence.

## AC matrix

| AC                                           | Evidence from this run                                                                                                                                                                                                                                                                                                   | Status                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| AC-01 Cloud without local materials          | Cloud production HTTP smoke passed on `127.0.0.1:3231`; GitHub authorize redirect used `read:user`; `/api/auth/get-session` returned `null`; the old callback returned `410`. The local Docker clean-room build was canceled after hanging in `npm ci`, so image-boundary and container-start evidence is still pending. | Partial                        |
| AC-02 Local material preference and fallback | Local production HTTP smoke passed on `127.0.0.1:3230`; resolver, local-file and reader tests cover allowlisted-file preference and upstream fallback; the mobile reader opened an allowlisted local chapter.                                                                                                            | Verified at application level  |
| AC-03 Path traversal protection              | Local file-access, local-image, content-audit and reader tests cover `..`, absolute paths and escaping symlinks; negative requests return no outside-root content.                                                                                                                                                       | Verified                       |
| AC-04 Learning state persistence             | Local production HTTP E2E verified progress, position, note, bookmark, outcome and confirmation persistence. Cloud unauthenticated writes correctly returned `401`; a real GitHub login/re-login with two-user isolation still needs OAuth credentials.                                                                  | Partial                        |
| AC-05 Stage completion constraint            | Local HTTP E2E and repository tests verified that a stage cannot be confirmed without a qualifying outcome, then can be confirmed after the user submits one.                                                                                                                                                            | Verified                       |
| AC-06 Personal data lifecycle                | Local HTTP E2E verified JSON export and explicit-confirmation deletion; repository and route tests verify cascade deletion and absence of session/OAuth secrets from exports.                                                                                                                                            | Verified at application level  |
| AC-07 Material update protection             | `materials check/update/audit/reindex` tests cover dirty, diverged and fast-forward-only decisions; a real dirty `legacy-course-029` update was rejected without changing its working tree.                                                                                                                              | Verified at host-command level |
| AC-08 Mobile complete flow                   | Chrome 390×844 route, search, long reader, note and outcome walkthrough passed with no horizontal overflow; Lighthouse accessibility, best practices, SEO and agentic browsing all scored 100.                                                                                                                           | Verified; see mobile report    |
| AC-09 Backup and restore                     | Encrypted SQLite backup/restore tests and CLI walkthrough verified WAL-consistent backup, AES-256-GCM, checksum manifest, retention and `quick_check`. A clean deployment-server restore and same-version app smoke remain pending.                                                                                      | Partial                        |
| AC-10 Legacy parity                          | The [legacy parity report](./legacy-parity-2026-08-09.md) maps all seven baseline capabilities to the new routes and tests, with explicit migration decisions.                                                                                                                                                           | Verified                       |

## Commands and runtime evidence

The following application checks passed before this report was written:

```text
npm run check:cloud --prefix code
npm run check:local --prefix code
npm audit --omit=dev --audit-level=high --prefix code
APP_URL=http://127.0.0.1:3230 EXPECTED_RUNTIME_MODE=local npm run test:e2e:local --prefix code
APP_URL=http://127.0.0.1:3231 EXPECTED_RUNTIME_MODE=cloud npm run test:e2e --prefix code
APP_IMAGE=ghcr.io/cr330326/agent-learning-hub:v0.1.0 \
BETTER_AUTH_SECRET=ci-only-secret-that-is-long-enough \
BETTER_AUTH_URL=http://127.0.0.1:3231 \
GITHUB_CLIENT_ID=ci-client-id GITHUB_CLIENT_SECRET=ci-client-secret \
docker compose -f docker-compose.yml -f docker-compose.cloud.yml -f docker-compose.release.yml config
git diff --check
```

The two application servers used by the HTTP walkthrough were stopped after
verification. Their temporary state databases remain only under `/tmp` outside
the repository and were not committed. No Git staging or commit was performed.

## Release blockers still open

- Run the protected-branch GitHub Actions checks and confirm stability.
- Pull a published immutable GHCR image, start it, and complete a rollback.
- Perform the documented reverse-proxy/HTTPS deployment on an empty server.
- Schedule off-host encrypted backups, test alerting, and record a dated clean
  environment restore drill.
- Complete a real GitHub OAuth login, cross-session restore and two-user
  isolation check before marking T8.2 and T8.4 complete.
