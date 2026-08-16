# Agent Learning Hub 端到端测试验证提示词

> 将以下内容直接交给负责验收的测试 Agent。测试对象是当前工作树中的最新实现，而不是历史报告或旧站。文中的命令、环境变量和脚本参数都以 `code/package.json` 与 `code/scripts/`、`code/tests/e2e/` 的现状为准。

## 角色与目标

你是一名发布前验收工程师。请在不修改产品代码、内容和嵌套素材仓库的前提下，对
`/Users/vsh9p8q/AI/Agent-Learning-Hub` 的当前实现做可复现的端到端验证。验收事实源：

- `docs/plans/spec.md`：AC-01—AC-10 验收场景，以及 NFR/SEC/PRIV/DEPLOY/CAT/OPS 需求编号；
- `docs/plans/tasks.md` 第 12 节：GATE-01—GATE-10 上线门槛（注意 GATE 编号定义在这里，不在 spec.md）；其中 GATE-04（学习状态集成）与 GATE-07（干净环境恢复演练）尚无勾选证据，本次本机验证若通过可直接为它们补充证据；
- `docs/plans/plan.md`：架构与边界；
- `docs/deploy/README.md` 与 `docs/deploy/local-manual.md`：本机两条运行路径（开发服务器 / 本机 Docker）的已核对步骤、状态路径（`code/.data/learning-state.sqlite`）和备份口令变量。

必须区分“本机已验证”与“需要真实部署/外部服务才能验证”的结论，不能为了得到全绿而虚构证据。

## 不可违反的边界

- 先阅读仓库根 `AGENTS.md`、上述计划文档和 `code/package.json`。`code/` 是唯一现役应用；`learning-site/` 仅是迁移基线。
- `local-courses/` 是第三方素材，只能以 Local Mode 只读访问。不得修改、提交、更新其嵌套仓库，也不得让 Cloud Mode 打包、索引或代理它。
- 目录事实源是手工维护的 `code/content/courses/courses.json` 与 `code/content/stages/stages.json`。**不得运行 `convert:legacy`**（已废弃，见 ADR 0006），也不得用 `materials drift --apply` 改写目录、不得运行 `materials update`——验收只读不写。`materials drift`（目录声明 vs 磁盘实际）与 `materials check`（本地素材 vs 上游新鲜度）是两件事，都要分别记录结果。
- 产物存放：测试数据库、下载文件、浏览器截图和进程日志放新建的临时目录（例如 `mktemp -d /tmp/agent-learning-e2e.XXXXXX`），不得写入 `code/.data/`、`backups/` 或仓库内容目录。走查脚本（`audit:content`、`audit:materials`、`audit:ui`、`audit:functional`）默认把可再生成报告写进 `code/reports/`，这是允许的——它是登记过的审计证据目录；也可以用 `--output-dir` 指到临时目录，但报告里不得包含个人数据或第三方正文。
- 不使用真实 GitHub OAuth、真实生产凭据、真实发布镜像、真实服务器、真实用户数据或外部通知端点。Cloud OAuth 只能验证未登录边界、授权入口和模拟/单元集成；真实两用户跨会话登录必须标为外部阻塞。
- 不要用 `|| true`、跳过断言、修改 fixture/测试以掩盖失败，或把“命令没跑”写成通过。发生产品缺陷时保留最小可复现证据并停止对应结论。

## 基础质量门禁

Node 需 >= 22（`code/package.json` engines）。在仓库根执行，并记录每条命令的退出码：

```bash
git status --porcelain        # 记录被测工作树状态
npm ci --prefix code
npm run check:cloud --prefix code
npm run check:local --prefix code
npm audit --omit=dev --audit-level=high --prefix code
git diff --check
```

`check` 已包含 format:check、lint、typecheck、audit:content、全部单元/集成测试（`test:tools` + `test:unit`）和生产构建，不需要重复跑 `npm run build`；只有浏览器阶段改用生产服务器时才需要单独构建（见下）。

素材库挂载时另跑目录对账（**不进** `npm run check`，因为它依赖仓库之外的素材库）：

```bash
npm run audit:materials --prefix code            # materials drift，不加 --apply
npm run materials --prefix code -- check         # 素材新鲜度，只读，结果单独记录
```

`drift` 期望 `0 missing paths`。非 0 说明目录声明的路径与磁盘对不上，属于产品缺陷而不是环境问题，要记为失败并保留 `code/reports/materials/catalog-drift.md`。素材库未挂载时脚本会明确报 `Local Material is not mounted` 并跳过比较——那种情况记为“未验证”，不能记为通过。

## 运行环境与隔离变量

为每个模式显式注入隔离状态路径和端口，不要依赖脚本默认值：

| 变量                    | 用途与取值                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEPLOYMENT_MODE`       | `cloud` 或 `local`；`test:e2e:local`/`check:local` 会自己带上                                                                                     |
| `LOCAL_BIND_HOST`       | Local Mode 必须 `127.0.0.1`，运行时会校验回环绑定（`modules/auth/local-auth.ts`）                                                                   |
| `LOCAL_MATERIAL_ROOT`   | 素材根目录，**必须指向真实存在的绝对路径**。传空串不会回退默认值——代码用 `??` 判断，空串会被解析成进程工作目录。回退场景应指向一个只含 `README.md` 的空临时目录 |
| `STATE_DATABASE_PATH`   | 学习状态 SQLite 的隔离路径，指向临时目录；不设则落到 `code/.data/learning-state.sqlite`（验收时禁止污染）                                          |
| `APP_URL`               | HTTP 冒烟与服务地址。三个 smoke 脚本默认 `127.0.0.1:3100`、`learning-state-http.mjs` 默认 `3218`，不一致——必须显式设置                                |
| `EXPECTED_RUNTIME_MODE` | 健康检查断言的模式；`test:e2e:local` 自带 `local`，云端默认 `cloud`                                                                                |
| `BETTER_AUTH_SECRET`    | Cloud Mode 启动必需（占位值即可）；配 `BETTER_AUTH_URL` 指向测试地址。OAuth 提供方缺省时 `/api/auth/...` 正确行为是 503，不是缺陷                    |
| `BACKUP_PASSPHRASE`     | `db:backup`/`db:restore` 必需的口令，用一次性测试值                                                                                                |
| `PLAYWRIGHT_CHROME_PATH` | `browser-acceptance.mjs` 默认找 `/Applications/Google Chrome.app/.../Google Chrome`，非 macOS 布局时用此变量覆盖；走查脚本（`audit:ui`/`audit:functional`）则要求可用的 Playwright 浏览器 |

浏览器验收用生产构建而非开发服务器：

```bash
npm run build --prefix code
npm run start --prefix code -- -p <port> -H 127.0.0.1   # 连同上述模式变量一起注入
```

可使用 `/Users/vsh9p8q/.agents/skills/webapp-testing/scripts/with_server.py` 管理临时服务器（`--server "<启动命令>" --port <port> -- <测试命令>`），确保每次测试后停止进程。

## 必测场景与断言

| 范围   | 场景               | 至少验证                                                                                                                                                                                                              | 关联验收                       |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Cloud  | 无本地素材公开流程 | 首页显示“云端模式”徽标；九阶段路线、公开搜索（`/search?q=agent` 出 `.search-result`）和第三方上游链接可用；`/learning` 为未登录空态；`/api/session` 返回 `authenticated:false`；`/api/admin/health` 匿名返回 401；浏览器控制台无错误 | AC-01、NFR-007                 |
| Local  | 正常素材挂载       | 首页显示“本地模式”徽标；本地优先条目可进入 `/read/...`；阅读、收藏、任务勾选、笔记、阶段成果和主动确认可完成；`/api/admin/health` 返回 403（非管理员）                                                                  | AC-02、AC-05、AC-06            |
| Local  | 进程重启           | 使用同一临时 SQLite 重启服务后，阅读进度、任务、收藏、笔记和成果仍在；导出 JSON/Markdown 包含本人数据且不含 token/session secret；删号后为空态和提示可见                                                              | AC-04、AC-06                   |
| Local  | 缺失素材降级       | 把 `LOCAL_MATERIAL_ROOT` 指向只含 `README.md` 的空临时目录（**不要传空串**，见上表）；同一第三方课程只提供上游链接，不出现 `/read/...` 站内阅读入口                                                                    | AC-02、NFR-005                 |
| Local  | 备份恢复           | 对含学习状态的临时数据库执行 `db:backup`（`BACKUP_PASSPHRASE` 用测试口令，`--output-dir` 指向临时目录）；`db:restore --input <备份文件> --yes` 恢复到一个不存在的新目标；以恢复副本启动并复验状态、导出和健康检查      | AC-09、OPS-006、GATE-07        |
| 共用   | 安全负向路径       | 确认以下场景均有测试文件且在 `check` 中通过：路径穿越与符号链接逃逸（`modules/content-resolver/local-file-access.test.ts`）、Markdown 消毒（`modules/reader/markdown.test.ts`）、CSRF/频率限制与导出脱敏（`app/api/` 各 `*.test.ts`）、管理员边界与健康接口越权 | AC-03、SEC、PRIV               |
| 共用   | 界面与内容不变量   | 列表页分页（每页 24 条）；无效查询参数被忽略且不回显；Local 顶部导航末项是“账户”而非“登录”；进度徽标文案是“动作已做完 · 待交成果”而不自行判完成；未登录时状态控件整块不渲染且无 `0/3` 先渲染；阅读器 `<img>` 带 `loading="lazy"` `decoding="async"` `referrerpolicy="no-referrer"`；未知路由出 404 页 | AC-05、NFR-003、NFR-005       |
| 移动端 | 390×844            | 路线、搜索和阅读器可用，无水平滚动；如条件允许完成一条笔记/成果流                                                                                                                                                     | AC-08、NFR-001                 |
| Docker | Local Compose      | 先运行 `code/scripts/docker-deploy.sh local config`；在资源允许时以独立 `COMPOSE_PROJECT_NAME`、独立端口和测试镜像运行 `local up`，随后用 `local verify`（调用 `/api/health`）确认健康，再执行 Local HTTP E2E，最后只执行同一项目的 `local down`。保留命名卷，不删除未知卷 | AC-01、AC-02、GATE-02、GATE-09 |
| Local  | 目录漂移对账       | `materials drift`（**不加 `--apply`**）报 `0 missing paths`；把一个已声明路径临时改名到临时副本目录后重跑，确认它被列入报告且退出码非 0；随后还原。`materials check` 另行记录新鲜度结论，不与漂移合并                  | AC-07、CAT 系列                |
| 共用   | 未挂载素材时不误报 | 以只含 `README.md` 的空目录作 `LOCAL_MATERIAL_ROOT` 跑 `npm run audit:content --prefix code -- --mode local`（npm 传参需要 `--`），确认 0 errors 且只出 `local-material-root-unavailable` 警告——“目录存在”不等于“素材挂载” | AC-02、NFR-005                 |
| 共用   | UI 走查            | `npm run audit:ui --prefix code -- --base-url <url> --output-dir <临时或 reports>`：desktop/tablet/mobile 三档全页截图，对 HTTP 错误、横向溢出、异常页高和控制台报错零 finding（依赖运行中的服务与 Playwright，不进 `check`） | NFR-010、PAGE 系列             |
| 共用   | 功能回归           | `npm run audit:functional --prefix code -- --base-url <url> --output-dir <临时或 reports>`：真实点击遍历站内链接、翻页、筛选、章节导航和学习状态写入/读取/删除；脚本读 `.mode-badge` 识别运行模式——云端断言匿名访问被拒、本地素材出正文，两种模式都要跑且全部通过 | NFR-011、READ 系列、GATE-04    |

## 推荐运行方式

每个阶段独立端口和独立 `STATE_DATABASE_PATH`。Local Mode 必须带 `DEPLOYMENT_MODE=local` 与 `LOCAL_BIND_HOST=127.0.0.1`；Cloud Mode 使用仅供本地测试的 Better Auth/GitHub 占位配置，并设置正确的 `BETTER_AUTH_URL`。典型浏览器阶段（`code/tests/e2e/browser-acceptance.mjs`，注意 `resume` 阶段必须传 `--artifacts-dir`）：

```text
node tests/e2e/browser-acceptance.mjs --base-url <url> --mode local  --phase seed     → 写入真实学习状态
node tests/e2e/browser-acceptance.mjs --base-url <url> --mode local  --phase resume   --artifacts-dir <dir> → 重启后验证、导出、删号
node tests/e2e/browser-acceptance.mjs --base-url <url> --mode local  --phase fallback → 空素材目录回退
node tests/e2e/browser-acceptance.mjs --base-url <url> --mode local  --phase mobile   → 390×844 无横向溢出
node tests/e2e/browser-acceptance.mjs --base-url <url> --mode cloud  --phase full     → 匿名公开流程
```

（以上命令在 `code/` 目录下执行，或改用绝对路径。）

同时运行项目内置 HTTP 流程，显式设置 `APP_URL`：Local 使用 `npm run test:e2e:local --prefix code`（含 `learning-state-http.mjs` 的状态写入/读取/删除全链路），Cloud 使用 `npm run test:e2e --prefix code`。每个浏览器阶段与走查脚本自身都等待 `networkidle` 并收集 `console.error` 与页面异常；任何 4xx/5xx 的业务请求都要区分是否为预期安全拒绝（例如云端 `/api/admin/health` 的 401、Local 的 403、未配置 OAuth 的 503）。

## 结果与报告要求

在 `docs/acceptance/local-e2e-YYYY-MM-DD.md` 生成报告，至少包含：

1. 测试日期、提交/工作树状态（`git status --porcelain` 输出）、操作系统、Node 版本、浏览器、Docker 状态，以及临时产物目录（不得上传个人数据或第三方正文）。
2. 每条命令、退出码、模式、端口和数据库是否隔离；每条浏览器/走查结果附实际抓取的运行模式徽标文本。
3. AC-01—AC-10（spec.md 第 18 节）与 GATE-01—GATE-10（tasks.md 第 12 节）的矩阵：`通过`、`部分通过`、`未验证` 或 `失败`；每行链接到具体命令/截图/日志证据。GATE-04 与 GATE-07 若本次通过，注明可据此补勾。
4. 浏览器流程、重启持久化、备份恢复、移动端、HTTP E2E、UI 走查、功能回归、边界审计（boundaries/materials）和 Docker 的实际结果。
5. 发现的缺陷、最小复现步骤、是否已修复及修复后的回归结果。
6. 必须外部完成的事项，例如受保护分支 CI、真实 GitHub OAuth 两用户会话、GHCR 拉取/回滚、空服务器 TLS 部署、异地备份和告警通知。它们不得被标记为通过（GATE-10 属于此列，除非文档确已由他人复现）。

仅当所有本机可验证项目已通过，且所有外部依赖都被明确列为待办时，才可以给出“本机验收通过、发布仍受外部门禁约束”的结论。
