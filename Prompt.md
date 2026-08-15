# Agent Learning Hub 端到端测试验证提示词

> 将以下内容直接交给负责验收的测试 Agent。测试对象是当前工作树中的最新实现，而不是历史报告或旧站。

## 角色与目标

你是一名发布前验收工程师。请在不修改产品代码、内容和嵌套素材仓库的前提下，对
`/Users/vsh9p8q/AI/Agent-Learning-Hub` 的当前实现做可复现的端到端验证。以
`docs/plans/spec.md` 的 AC-01—AC-10、`docs/plans/plan.md` 和
`docs/plans/tasks.md` 为验收事实源；必须区分“本机已验证”与“需要真实部署/外部服务才能验证”的结论，不能为了得到全绿而虚构证据。

## 不可违反的边界

- 先阅读仓库根 `AGENTS.md`、三个计划文档和 `code/package.json`。`code/` 是唯一现役应用；`learning-site/` 仅是迁移基线。
- `local-courses/` 是第三方素材，只能以 Local Mode 只读访问。不得修改、提交、更新其嵌套仓库，也不得让 Cloud Mode 打包、索引或代理它。
- 目录事实源是手工维护的 `code/content/courses/courses.json` 与 `code/content/stages/stages.json`。**不得运行 `convert:legacy`**（已废弃，见 ADR 0006），也不得用 `materials drift --apply` 改写目录——验收只读不写。
- 所有测试数据库、下载文件、截图和日志都放在新建的临时目录（例如 `mktemp -d /tmp/agent-learning-e2e.XXXXXX`），不得写入 `code/.data/`、`backups/` 或仓库内容目录。
- 不使用真实 GitHub OAuth、真实生产凭据、真实发布镜像、真实服务器、真实用户数据或外部通知端点。Cloud OAuth 只能验证未登录边界、授权入口和模拟/单元集成；真实两用户跨会话登录必须标为外部阻塞。
- 不要用 `|| true`、跳过断言、修改 fixture/测试以掩盖失败，或把“命令没跑”写成通过。发生产品缺陷时保留最小可复现证据并停止对应结论。

## 基础质量门禁

在仓库根执行，并记录每条命令的退出码：

```bash
npm ci --prefix code
npm run check:cloud --prefix code
npm run check:local --prefix code
npm audit --omit=dev --audit-level=high --prefix code
git diff --check
```

素材库挂载时另跑目录对账（**不进** `npm run check`，因为它依赖仓库之外的素材库）：

```bash
npm run audit:materials --prefix code
```

期望 `0 missing paths`。非 0 说明目录声明的路径与磁盘对不上，属于产品缺陷而不是环境问题，要记为失败并保留 `code/reports/materials/catalog-drift.md`。素材库未挂载时脚本会明确报 `Local Material is not mounted` 并跳过比较——那种情况记为"未验证"，不能记为通过。

若测试当前未提交的实现，先运行：

```bash
npm run build --prefix code
```

使用生产构建后的 `npm run start --prefix code`，而不是只测试开发服务器。用项目的
`code/tests/e2e/browser-acceptance.mjs` 进行浏览器验收；若本机缺少 Playwright/Chromium，先报告该环境前置条件，不能静默降级为只做 HTTP 请求。可使用
`/Users/vsh9p8q/.agents/skills/webapp-testing/scripts/with_server.py` 管理临时服务器，确保每次测试后停止进程。

## 必测场景与断言

| 范围   | 场景               | 至少验证                                                                                                                                                                                                              | 关联验收                       |
| ------ | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Cloud  | 无本地素材公开流程 | 首页显示 Cloud Mode；九阶段路线、公开搜索和第三方上游链接可用；学习页和 `/api/session` 均为未登录；浏览器控制台无错误                                                                                                 | AC-01、NFR-007                 |
| Local  | 正常素材挂载       | 首页显示 Local Mode；本地优先条目可进入 `/read/...`；阅读、收藏、任务勾选、笔记、阶段成果和主动确认可完成                                                                                                             | AC-02、AC-05、AC-06            |
| Local  | 进程重启           | 使用同一临时 SQLite 重启服务后，阅读进度、任务、收藏、笔记和成果仍在；导出 JSON/Markdown 包含本人数据且不含 token/session secret；删号后为空态和提示可见                                                              | AC-04、AC-06                   |
| Local  | 缺失素材降级       | 传入空的 `LOCAL_MATERIAL_ROOT`；同一第三方课程只提供上游链接，不显示站内阅读入口                                                                                                                                      | AC-02、NFR-005                 |
| Local  | 备份恢复           | 对含学习状态的临时数据库执行 `db:backup`；恢复到一个不存在的新目标（显式 `--yes`）；以恢复副本启动并复验状态、导出和健康检查                                                                                          | AC-09、OPS-006                 |
| 共用   | 安全负向路径       | 运行现有模块/路由测试，覆盖路径穿越与符号链接逃逸、恶意 MDX 不执行、CSRF、频率限制、越权、导出脱敏、管理员边界和页面遥测不记录身份/秘密                                                                               | AC-03、SEC、PRIV               |
| 移动端 | 390×844            | 路线、搜索和阅读器可用，无水平滚动；如条件允许完成一条笔记/成果流                                                                                                                                                     | AC-08、NFR-001                 |
| Docker | Local Compose      | 先运行 `code/scripts/docker-deploy.sh local config`；在资源允许时以独立 `COMPOSE_PROJECT_NAME`、独立端口和测试镜像运行 `local up`，再执行 Local HTTP E2E，最后只执行同一项目的 `local down`。保留命名卷，不删除未知卷 | AC-01、AC-02、GATE-02、GATE-09 |
| Local  | 目录漂移对账       | `materials drift`（**不加 `--apply`**）报 `0 missing paths`；把一个已声明路径临时改名到临时副本目录后重跑，确认它被列入报告且退出码非 0；随后还原                                                                     | AC-07、CAT 系列                |
| 共用   | 未挂载素材时不误报 | 以只含 `README.md` 的空目录作 `LOCAL_MATERIAL_ROOT` 跑 `audit:content --mode local`，确认 0 errors 且只出 `local-material-root-unavailable` 警告——"目录存在"不等于"素材挂载"                                          | AC-02、NFR-005                 |

## 推荐运行方式

为每个模式显式注入隔离状态路径和端口。Local Mode 必须带 `DEPLOYMENT_MODE=local` 与回环 `LOCAL_BIND_HOST=127.0.0.1`；Cloud Mode 使用仅供本地测试的 Better Auth/GitHub 占位配置，并设置正确的 `BETTER_AUTH_URL`。典型浏览器阶段为：

```text
local seed     → 写入真实学习状态
local resume   → 重启后验证、导出、删号
local fallback → 空素材目录回退
local mobile   → 390×844 无横向溢出
cloud full     → 匿名公开流程
```

同时运行项目内置 HTTP 流程：Local 使用 `npm run test:e2e:local --prefix code`，Cloud 使用 `npm run test:e2e --prefix code` 并明确 `EXPECTED_RUNTIME_MODE=cloud`。每个浏览器阶段须等待 `networkidle`，记录页面异常和 `console.error`；任何 4xx/5xx 的业务请求都要区分是否为预期安全拒绝。

## 结果与报告要求

在 `docs/acceptance/local-e2e-YYYY-MM-DD.md` 生成报告，至少包含：

1. 测试日期、提交/工作树状态、操作系统、Node、浏览器、Docker 状态，以及临时产物目录（不得上传个人数据或第三方正文）。
2. 每条命令、退出码、模式、端口和数据库是否隔离。
3. AC-01—AC-10 与 GATE-01—GATE-10 的矩阵：`通过`、`部分通过`、`未验证` 或 `失败`；每行链接到具体命令/截图/日志证据。
4. 浏览器流程、重启持久化、备份恢复、移动端、HTTP E2E、边界审计和 Docker 的实际结果。
5. 发现的缺陷、最小复现步骤、是否已修复及修复后的回归结果。
6. 必须外部完成的事项，例如受保护分支 CI、真实 GitHub OAuth 两用户会话、GHCR 拉取/回滚、空服务器 TLS 部署、异地备份和告警通知。它们不得被标记为通过。

仅当所有本机可验证项目已通过，且所有外部依赖都被明确列为待办时，才可以给出“本机验收通过、发布仍受外部门禁约束”的结论。
