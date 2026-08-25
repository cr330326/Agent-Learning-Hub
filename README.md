# Agent Learning Hub

Agent Learning Hub 是一个以实践成果为主线的 Agent 工程学习网站。它将九阶段路线、四条学习轨道、公开策展内容、本地只读素材和个人学习状态组织在同一套体验中。

新应用唯一的现役工程是 [`code/`](./code/)。[`learning-site/`](./learning-site/) 仅保留为迁移与 Phase 8 对等验收基线，不再接收新功能。

想直接开始使用站点，请看 [使用指南](./GUIDE.md)。本文档面向搭建与维护。

## 当前能力

- 路线、课程目录、项目阶梯、搜索和安全阅读器；Cloud/Local 共享稳定课程 ID。
- 路线页按阶段显示个人进度，实践动作可在阶段页就地勾选；完成仍以主动提交的成果为准。
- Cloud Mode 使用 GitHub 登录；Local Mode 使用回环地址上的单用户身份。
- SQLite 保存身份、会话和私人学习状态；公开目录位于 [`code/content/`](./code/content/)，不写入数据库。
- Local Mode 只读挂载 [`local-courses/`](./local-courses/)，缺失素材会回退到上游地址；云端镜像不携带该目录。
- 管理员健康摘要、内容审计、素材检查、备份/恢复工具和生成式报告。

## 当前验收结论（2026-08-25）

本次按 [`code/package.json`](./code/package.json) 的命令事实源，对现役 `code/` 做了双模式系统复核。结论是：核心产品功能已达到本地验收 GO，但项目整体还不能标记为“全部完成”。

- `check:cloud` 与 `check:local` 均通过：格式、lint、类型、内容审计（0 errors）、11 个工具测试、144 个 Vitest 测试和生产构建均通过。构建仍输出 6 条非阻塞的 Turbopack 动态文件系统追踪 warning，需在生产发布前继续评估。
- 一次性原生生产构建服务的 Local `seed/resume/fallback/mobile` 与 HTTP E2E 通过；Cloud E2E 通过 29 项登录、鉴权、状态、导出和删号检查（GitHub 端点为测试桩，不等于真实 OAuth）。正式 Docker 镜像的 UI 走查为 48 captures / 0 findings，点击式功能回归为 23/23。
- 素材 `check`、内容 `audit` 和 `reindex` 均可运行；`materials drift` 当前因 4 个未收录仓库而按设计非零退出。漂移报告中的数量是动态事实，不应复制到文档或手工修改目录。
- 仍未完成的非云端产品工作是 T8.8：先解决课程条目与旧站单章条目的章节归属决策，再继续章节策展；当前 74 个文件被多个条目声明，不能用“多加 references”掩盖重复目标。
- 正式本地镜像 `agent-learning-hub:local-20260825` 已构建并以 `--no-build` 运行；试运行地址为 <http://127.0.0.1:3345>。云端部署、真实域名/TLS/OAuth、GHCR 固定镜像拉取与回滚、受保护分支 Actions、异地备份/调度/告警和生产日志复核仍是外部验收项，不能由本地测试代替。

详细的逐项状态、证据和 NO-GO 边界见 [`docs/plans/tasks.md`](./docs/plans/tasks.md)；本轮本地全量验收见 [`docs/acceptance/local-e2e-2026-08-25.md`](./docs/acceptance/local-e2e-2026-08-25.md)；动态报告见 [`code/reports/`](./code/reports/)。

## 快速开始

需要 Node.js 22 或更新版本；CI 与 Docker 使用 Node.js 24。

```bash
npm ci --prefix code
npm run dev:cloud --prefix code
```

打开 <http://127.0.0.1:3001>。要在站内阅读 `local-courses/` 的素材正文，改用 Local Mode：

```bash
npm run dev:local --prefix code
```

`dev:local` 会设置 `DEPLOYMENT_MODE=local` 和 `LOCAL_BIND_HOST=127.0.0.1`；素材目录默认取仓库根的 `local-courses/`，需要改路径时设置 `LOCAL_MATERIAL_ROOT`。开发服务只能通过 `127.0.0.1` 或 `localhost` 访问：免登录的本地身份仅对回环地址成立，非回环来源的静态资源会被开发服务器拒绝，页面无法完成 hydration。

提交前运行双模式质量门禁：

```bash
npm run check:cloud --prefix code
npm run check:local --prefix code
```

改动界面或交互后，另外运行走查与功能回归（需要运行中的服务与 Playwright，不属于 `check` 门禁）：

```bash
node code/scripts/ui-review.mjs --base-url http://127.0.0.1:3001 --item-id legacy-course-001
```

```bash
node code/scripts/functional-regression.mjs --base-url http://127.0.0.1:3001
```

两者都通过只是底线，不是结论：走查脚本只判 HTTP 状态、横向溢出、页面高度和控制台报错四类信号。T8.9 就是在两份"零 finding"的报告后面逐屏看截图，才发现搜索结果成对重复、筛选栏按钮文字折行等六项缺陷。修完记得把当初能抓住它的断言一并补进 `functional-regression.mjs`。

## Docker

Compose 文件位于 [`code/docker/`](./code/docker/)。推荐通过部署助手启动，它会选择正确的 Compose 覆盖文件、等待容器健康检查，并请求 `/api/health`：

```bash
code/scripts/local-preview.sh
```

该命令从当前工作区构建 Docker 镜像、启动 Local Mode 并完成健康检查；随后打开 <http://127.0.0.1:3001>。常用管理命令为 `code/scripts/local-preview.sh status`、`logs`、`restart` 和 `down`。Local Mode 只绑定回环地址，以只读方式挂载 `local-courses/`，并将 SQLite 放入命名卷；`down` 不删除该卷。需要直接控制部署模式或覆盖 `APP_PORT` 等变量时，仍可使用 `code/scripts/docker-deploy.sh local up`。

Cloud Mode 先从模板创建根目录 `.env`，填写 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` 和 GitHub OAuth 凭据；先静态检查配置（不会输出展开后的秘密），再启动：

```bash
cp .env.example .env
code/scripts/docker-deploy.sh cloud config
code/scripts/docker-deploy.sh cloud up
```

要在本机对照两种模式，用模式切换助手。同一 `code/` 目录同时只能跑一个 `next dev`（Next.js 16 按目录加锁，第二个实例会以 "server is already running" 退出），所以并行对照只能走 Docker。它给 Local 和 Cloud 各自的 Compose 项目、端口和 SQLite 卷，所以可以并行运行、单独停止：

```bash
code/scripts/mode-switch.sh local     # http://127.0.0.1:3001
code/scripts/mode-switch.sh cloud     # http://127.0.0.1:3002
code/scripts/mode-switch.sh both
code/scripts/mode-switch.sh status
code/scripts/mode-switch.sh stop
```

只想查看未登录的公开视角时，`code/scripts/mode-switch.sh cloud --preview-secrets` 会用一次性假凭据启动；GitHub 登录不会成功，也不得用于任何部署。

发布镜像必须使用不可变的版本标签或 digest。本机构建并推送发布镜像（默认交叉构建 `linux/amd64`，拒绝 `latest`，成功后打印可固定的 digest）：

```bash
docker login ghcr.io
code/scripts/image-release.sh --push v0.1.0
```

打 `v*.*.*` Git tag 会触发 [`.github/workflows/release.yml`](./.github/workflows/release.yml)，用同一个 Dockerfile 构建并附带 SBOM 与签名溯源；正式发布优先走这条路，`image-release.sh` 是 CI 到不了的镜像仓库或主机时的手工路径。发布模式只拉取镜像，不会在目标主机重新构建源码：

```bash
APP_IMAGE=ghcr.io/cr330326/agent-learning-hub:v0.1.0 \
code/scripts/docker-deploy.sh release up
```

生产部署从 [部署与运维入口](./docs/deploy/README.md) 开始：其中分别提供空白服务器的完全手工 Runbook，以及通过 `ssh tencent-lighthouse` 执行的 Lighthouse 自动化流程。架构和安全边界仍以 [技术方案第 13.4 节](./docs/plans/plan.md#134-部署容器与数据库运维) 为准。

## 内容、数据与隐私

- `code/content/`：Git 管理的课程目录、自有文章和结构化元数据；第三方条目保留作者、许可证状态和上游地址。
- `local-courses/`：开发机上的第三方 Local Material，不进入 Git、云端构建上下文或云端索引。维护规则见 [`local-courses/README.md`](./local-courses/README.md)。
- `code/.data/`：本地开发 SQLite 状态；生产状态使用容器持久化卷。数据库文件、WAL 和共享内存文件必须作为同一状态单元处理。
- `code/reports/`：可再生成的审计和基线证据；不会进入运行时镜像。

目录和交付边界由 [`docs/content-boundaries.json`](./docs/content-boundaries.json) 定义，并通过 `npm run audit:boundaries --prefix code` 验证。

## 维护命令

`code/scripts/` 中的非 `.sh` 文件不是冗余文件；它们是 `code/package.json` 和 CI 调用的 Node/TypeScript 维护入口，应保留。

脚本按**在哪台机器上执行**和**作用于什么**分三类——这两件事不一样：`image-release.sh` 和 `lighthouse-deploy.sh` 都在你自己电脑上跑，但作用对象是云端。完整分类与依赖见 [docs/deploy/README.md](./docs/deploy/README.md#脚本按运行位置分类)。

### 本机运行、作用于本机

| 命令                                                                | 用途                                                                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev:local --prefix code`                                   | **学习和读素材的默认方式**；热更新，只绑回环地址                                                                             |
| `npm run dev:cloud --prefix code`                                   | 公开视角预览；第三方素材只给出处不给正文                                                                                     |
| `npm run check:local --prefix code` / `check:cloud`                 | 提交前门禁：格式、lint、类型、内容审计、测试、构建                                                                           |
| `npm run audit:content --prefix code`                               | 校验内容 schema、来源、许可证和本地路径                                                                                      |
| `npm run materials --prefix code -- <check\|drift\|audit\|reindex>` | 素材新鲜度、目录漂移、路径审计和重建索引；`update <course-id> --yes` 只允许单仓库 fast-forward                               |
| `npm run audit:materials --prefix code`                             | 对账目录与素材库：失效路径及候选、未收录仓库、缺失的上游回退；加 `-- --apply` 才写回                                         |
| `npm run audit:boundaries --prefix code`                            | 审计 Git、Docker 与 CI 的内容边界（CI 也跑）                                                                                 |
| `npm run audit:baseline --prefix code`                              | 重新生成旧站能力基线（迁移期历史工具）                                                                                       |
| `npm run audit:ui --prefix code`                                    | 三档视口版式走查；**需要运行中的服务** + Playwright                                                                          |
| `npm run audit:functional --prefix code`                            | 点击式功能回归；**需要运行中的服务** + Playwright，按运行模式分支断言                                                        |
| `npm run test:e2e:local --prefix code` / `test:e2e:cloud`           | 端到端 HTTP 测试；**需要运行中的服务**，且**以删号收尾**——只指向一次性实例。云端那条会先真的登录一次                         |
| `npm run drill:restore --prefix code`                               | 恢复演练：备份 → 干净环境恢复 → 逐表比对，附错误口令/篡改/覆盖三组反向对照；报告记录主机、版本与耗时；需 `BACKUP_PASSPHRASE` |
| ~~`npm run convert:legacy --prefix code`~~                          | 已废弃：目录改为人手维护，见 [ADR 0006](docs/adr/0006-catalog-is-hand-maintained.md)                                         |

`audit:ui`、`audit:functional`、`test:e2e:*` 需要运行中的服务，`audit:materials` 依赖仓库之外的素材库——它们都**不进** `npm run check`，各自非零退出作为独立门禁。两条 e2e 不是同一个测试的两种配置：Local Mode 自动签入固定单用户，Cloud Mode 必须先登录，而登录是它全部访问规则的入口。

两条 e2e 都会在结尾删号，所以 `APP_URL` 必须指向带独立 `STATE_DATABASE_PATH` 的一次性服务，不能是你日常在用的预览——Local Mode 只有一个用户就是维护者本人。`test:e2e:local` 已内置拒绝：目标已有学习状态就不跑，除非显式 `E2E_ALLOW_DESTRUCTIVE=1`。

### 本机运行、作用于本机 Docker

| 命令                                               | 用途                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `code/scripts/local-preview.sh`                    | 构建镜像 + 启动 Local Mode + 健康验证，一条命令完成 |
| `code/scripts/mode-switch.sh <local\|cloud\|both>` | 本机切换或并行跑两种模式，各自独立的项目、端口和卷  |
| `code/scripts/docker-deploy.sh <mode> <action>`    | Compose 生命周期底层入口；上面两个脚本都委托给它    |

### 作用于云端

| 命令                                              | 执行位置        | 用途                                                             |
| ------------------------------------------------- | --------------- | ---------------------------------------------------------------- |
| `code/scripts/image-release.sh --push <version>`  | 本机            | 交叉构建 `linux/amd64` 并推送固定版本，拒绝 `latest`             |
| `code/scripts/lighthouse-deploy.sh <action>`      | 本机（SSH）     | 预检、装机、传秘密、部署、备份、恢复演练、回滚、验证、状态、日志 |
| `code/scripts/docker-deploy.sh release <action>`  | **云主机**      | 跑固定镜像；由 `lighthouse-deploy.sh` 打包上传                   |
| `npm run db:backup --prefix code` / `db:restore`  | **云主机**      | 加密 SQLite 备份与恢复；在维护容器内执行                         |
| `code/scripts/lighthouse-deploy.sh restore-drill` | **本机**（SSH） | 在云主机上证明生产备份可恢复；只读读状态卷，不动发布             |

`baseline-report.mjs`、`convert-legacy-content.mjs`、`ui-review.mjs`、`functional-regression.mjs` 和 `materials.ts` **都不该在生产主机运行**：前两个是迁移期工具，中间两个需要浏览器，最后一个需要 `local-courses`——而云端镜像根本不包含也不挂载素材库。

## 文档入口

- [快速上手：本地模式](./USER.md)
- [使用指南（面向学习者与本机维护者）](./GUIDE.md)
- [产品规格与验收场景](./docs/plans/spec.md)
- [架构、内容模型、部署和数据库运维](./docs/plans/plan.md)
- [部署与运维入口（含脚本运行位置分类）](./docs/deploy/README.md)
  - [Phase 7 交付、部署与运维计划及证据](./docs/deploy/phase-7-delivery-deployment-operations.md)
  - [本机手动运行本地服务](./docs/deploy/local-manual.md)
  - [完全手工生产部署与运维](./docs/deploy/production-manual.md)
  - [Lighthouse 自动化部署](./docs/deploy/lighthouse-automation.md)
- [实施任务、证据与需求追踪](./docs/plans/tasks.md)
- [测试策略](./docs/testing-strategy.md)
- [架构决策记录](./docs/adr/)
- [领域术语](./CONTEXT.md)

涉及运行模式、内容归属、认证或数据库边界的变更，先更新 ADR、规格和任务清单，再修改实现。
