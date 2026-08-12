# Agent Learning Hub

Agent Learning Hub 是一个以实践成果为主线的 Agent 工程学习网站。它将九阶段路线、四条学习轨道、公开策展内容、本地只读素材和个人学习状态组织在同一套体验中。

新应用唯一的现役工程是 [`code/`](./code/)。[`learning-site/`](./learning-site/) 仅保留为迁移与 Phase 8 对等验收基线，不再接收新功能。

想直接开始使用站点，请看 [使用指南](./GUIDE.md)。本文档面向搭建与维护。

## 当前能力

- 路线、课程目录、项目阶梯、搜索和安全阅读器；Cloud/Local 共享稳定课程 ID。
- Cloud Mode 使用 GitHub 登录；Local Mode 使用回环地址上的单用户身份。
- SQLite 保存身份、会话和私人学习状态；公开目录位于 [`code/content/`](./code/content/)，不写入数据库。
- Local Mode 只读挂载 [`local-courses/`](./local-courses/)，缺失素材会回退到上游地址；云端镜像不携带该目录。
- 管理员健康摘要、内容审计、素材检查、备份/恢复工具和生成式报告。

## 快速开始

需要 Node.js 22 或更新版本；CI 与 Docker 使用 Node.js 24。

```bash
npm ci --prefix code
npm run dev:cloud --prefix code
```

打开 <http://127.0.0.1:3000>。要在站内阅读 `local-courses/` 的素材正文，改用 Local Mode：

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
node code/scripts/ui-review.mjs --base-url http://127.0.0.1:3000 --item-id legacy-course-001
```

```bash
node code/scripts/functional-regression.mjs --base-url http://127.0.0.1:3000
```

两者都通过只是底线，不是结论：走查脚本只判 HTTP 状态、横向溢出、页面高度和控制台报错四类信号。T8.9 就是在两份"零 finding"的报告后面逐屏看截图，才发现搜索结果成对重复、筛选栏按钮文字折行等六项缺陷。修完记得把当初能抓住它的断言一并补进 `functional-regression.mjs`。

## Docker

Compose 文件位于 [`code/docker/`](./code/docker/)。推荐通过部署助手启动，它会选择正确的 Compose 覆盖文件、等待容器健康检查，并请求 `/api/health`：

```bash
code/scripts/local-preview.sh
```

该命令从当前工作区构建 Docker 镜像、启动 Local Mode 并完成健康检查；随后打开 <http://127.0.0.1:3000>。常用管理命令为 `code/scripts/local-preview.sh status`、`logs`、`restart` 和 `down`。Local Mode 只绑定回环地址，以只读方式挂载 `local-courses/`，并将 SQLite 放入命名卷；`down` 不删除该卷。需要直接控制部署模式或覆盖 `APP_PORT` 等变量时，仍可使用 `code/scripts/docker-deploy.sh local up`。

Cloud Mode 先从模板创建根目录 `.env`，填写 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` 和 GitHub OAuth 凭据；先静态检查配置（不会输出展开后的秘密），再启动：

```bash
cp .env.example .env
code/scripts/docker-deploy.sh cloud config
code/scripts/docker-deploy.sh cloud up
```

发布镜像必须使用不可变的版本标签或 digest。发布模式只拉取镜像，不会在目标主机重新构建源码：

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

`code/scripts/` 中的非 `.sh` 文件不是冗余文件；它们是 `code/package.json` 和 CI 调用的 Node/TypeScript 维护入口，应保留：

| 命令                                                         | 用途                                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `code/scripts/local-preview.sh`                              | 从当前代码构建镜像并启动、查看或停止本机 Local Mode 预览                                 |
| `code/scripts/docker-deploy.sh`                              | 本地构建、启动、配置检查、健康验证和已发布镜像运行                                       |
| `code/scripts/lighthouse-deploy.sh`                          | 通过 SSH 预检、初始化、备份、部署、验证和回滚专用 Lighthouse 生产主机                    |
| `npm run audit:content --prefix code`                        | 校验内容 schema、来源、许可证和本地路径                                                  |
| `npm run materials --prefix code -- <check\|audit\|reindex>` | 查看素材新鲜度、审计路径和重建索引；`update <course-id> --yes` 只允许单仓库 fast-forward |
| `npm run db:backup --prefix code` / `db:restore`             | 创建加密 SQLite 备份或在明确确认后恢复                                                   |
| `npm run audit:baseline --prefix code`                       | 重新生成旧站能力基线                                                                     |
| `npm run audit:boundaries --prefix code`                     | 审计 Git、Docker 与 CI 的内容边界                                                        |
| `npm run convert:legacy --prefix code`                       | 从 `learning-site/data.js` 可重复生成结构化内容与报告                                    |
| `node code/scripts/ui-review.mjs --base-url <url>`           | 在 desktop/tablet/mobile 三档抓全页截图，报告 HTTP 错误、横向溢出、超长页面与控制台报错  |
| `node code/scripts/functional-regression.mjs --base-url <url>` | 点击式功能回归：链接、翻页、筛选、章节与上下章导航、学习状态读写；按运行模式分支断言      |

## 文档入口

- [使用指南（面向学习者与本机维护者）](./GUIDE.md)
- [产品规格与验收场景](./docs/plans/spec.md)
- [架构、内容模型、部署和数据库运维](./docs/plans/plan.md)
- [生产部署与运维 Runbook](./docs/deploy/README.md)
- [实施任务、证据与需求追踪](./docs/plans/tasks.md)
- [测试策略](./docs/testing-strategy.md)
- [架构决策记录](./docs/adr/)
- [领域术语](./CONTEXT.md)

涉及运行模式、内容归属、认证或数据库边界的变更，先更新 ADR、规格和任务清单，再修改实现。
