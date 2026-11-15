# Testing strategy

This strategy implements T0.3 and is intentionally lightweight at the start of
the project. It grows with the implementation tasks in
[docs/plans/tasks.md](./plans/tasks.md), rather than adding speculative tests.

## 云端资讯扩展的计划验证

2026-11-15 已确认 Phase 9，以下为实施与验收范围，需求与场景以 [spec 第 20 节](./plans/spec.md#20-云端资讯与学习扩展) 和 AC-11～AC-23 为准。

- 模块与集成测试覆盖多页导入、游标恢复、记录和 URL 去重、修订保护、平台指标、来源缺失、模型结构校验、来源发布方式及固定日报版本。
- 可控时钟与服务替身覆盖任务租约、重启、并发预算预留、跨日核销、结果未知回执、临时原文清理和迟到内容。
- 两种模式的独立实例 e2e 覆盖旧学习数据兼容、资讯个人状态、两用户隔离、导出与删号，以及云端专属能力的模式边界。实例还需独立资讯库与任务配置。
- `audit:ui`、`audit:functional` 扩展双入口、筛选分页、来源状态、审核与重试、日报和收录 PR；逐屏检查截图，修复问题时加入对应断言。
- 两库恢复演练验证批次与版本、跨库引用、任务租约及回执，保留错误口令、篡改密文、覆盖已有目标三组反向对照。
- 真实接入单独验证三份飞书 Base 及九个子表映射、公开来源解析、模型用量、GitHub 登录与 PR、单域名 TLS 和 worker。代码级门禁与真实接入各记录证据。

命令以 `code/package.json` 为准，新增命令随 T9.8 实现登记到部署脚本分类和两份云端 Runbook。当前新增覆盖包括 `modules/discovery/*.test.ts`、Cloud e2e 的资讯流程、双模式功能脚本与 Cloud 资讯页面走查，实际通过结果见 tasks.md。

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

整课连续阅读以 OpenCode 旧单节 ID 为固定回归入口。Local 分支验证转发后的当前节、作者顺序、上下节目标、首尾边界及手机目录位置和键盘展开；Cloud 分支验证同一旧 ID 的对应章节原站入口。目录单元测试固定归属与顺序，正文链接测试覆盖无扩展名、目录路由和显式文档根，未知或歧义目标必须降级。

Cloud 管理界面与资讯个人交互可另传一次性管理员会话及停用的飞书信源 JSON：

```bash
npm run audit:functional --prefix code -- --base-url <disposable-cloud-url> \
  --admin-storage-state /tmp/private-test/admin-session.json \
  --feishu-source /tmp/private-test/disabled-feishu-source.json
```

两项参数须一起提供；来源必须 `enabled: false`、`publicationMode: manual`，包含已验证的 Base、子表与标题/原文链接字段 ID。脚本通过真实 API 验证首次读取字段、下拉映射、预览与保存，切换子表后旧选项消失；另验证笔记/收藏清空保留阅读完成状态，明确重新阅读才恢复为阅读中。测试恢复个人字段，但会保存停用的测试来源，必须指向独立实例。会话只由 Better Auth 或真实 OAuth 签发，保存在仓库外权限受限的临时目录，不进入报告或 Git。

日报编辑快照另支持 `--edition-fixture <json>`，仅用于独立实例的已播种合成记录。文件包含 `day`、`id`、`versionId`，以及 `frozen` / `current` 的标题、摘要、理由和主题。Cloud 分支验证冻结卡片和详情包含出刊前更正，跳转当前版本后显示出刊后更正；Local 分支验证同一日报入口返回 404。单测另覆盖模型重算、处理失败、撤下、旧两字段日报兼容和同版本跨期去重。该参数不触发模型请求或创建日报，播种必须在隔离库另行完成，不可拿日常实例演示。

版式工具使用实际无结果的筛选组合覆盖空状态；完整页面截图先回到顶部，避免阅读位置恢复后固定导航出现在长截图中段。最终仍需查看截图。

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
