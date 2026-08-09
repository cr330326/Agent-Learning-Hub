# Agent Learning Hub

Agent Learning Hub 是一个以实践成果为主线的 Agent 工程学习网站。它将九阶段路线、四条学习轨道、公开策展内容、本地只读素材和个人学习状态组织在同一套体验中。

新应用唯一的现役工程是 [`code/`](./code/)。[`learning-site/`](./learning-site/) 仅保留为迁移与 Phase 8 对等验收基线，不再接收新功能。

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
npm run dev --prefix code
```

打开 <http://127.0.0.1:3000>。开发服务默认是 Cloud Mode；本地阅读素材时：

```bash
DEPLOYMENT_MODE=local \
LOCAL_MATERIAL_ROOT="$PWD/local-courses" \
npm run dev --prefix code
```

提交前运行双模式质量门禁：

```bash
npm run check:cloud --prefix code
npm run check:local --prefix code
```

## Docker

Compose 文件位于 [`code/docker/`](./code/docker/)。推荐通过部署助手启动，它会选择正确的 Compose 覆盖文件、等待容器健康检查，并请求 `/api/health`：

```bash
code/scripts/docker-deploy.sh local up
code/scripts/docker-deploy.sh local status
code/scripts/docker-deploy.sh local down
```

Local Mode 默认只绑定 `127.0.0.1:3000`，以只读方式挂载 `local-courses/`，并将 SQLite 放入命名卷。`down` 不删除该卷。

Cloud Mode 先从模板创建根目录 `.env`，填写 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL` 和 GitHub OAuth 凭据；先检查展开配置，再启动：

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

完整的镜像、持久化、备份、升级和回滚边界见 [技术方案的部署与运维章节](./docs/plans/plan.md#134-部署容器与数据库运维)。

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
| `code/scripts/docker-deploy.sh`                              | 本地构建、启动、配置检查、健康验证和已发布镜像运行                                       |
| `npm run audit:content --prefix code`                        | 校验内容 schema、来源、许可证和本地路径                                                  |
| `npm run materials --prefix code -- <check\|audit\|reindex>` | 查看素材新鲜度、审计路径和重建索引；`update <course-id> --yes` 只允许单仓库 fast-forward |
| `npm run db:backup --prefix code` / `db:restore`             | 创建加密 SQLite 备份或在明确确认后恢复                                                   |
| `npm run audit:baseline --prefix code`                       | 重新生成旧站能力基线                                                                     |
| `npm run audit:boundaries --prefix code`                     | 审计 Git、Docker 与 CI 的内容边界                                                        |
| `npm run convert:legacy --prefix code`                       | 从 `learning-site/data.js` 可重复生成结构化内容与报告                                    |

## 文档入口

- [产品规格与验收场景](./docs/plans/spec.md)
- [架构、内容模型、部署和数据库运维](./docs/plans/plan.md)
- [实施任务、证据与需求追踪](./docs/plans/tasks.md)
- [测试策略](./docs/testing-strategy.md)
- [架构决策记录](./docs/adr/)
- [领域术语](./CONTEXT.md)

涉及运行模式、内容归属、认证或数据库边界的变更，先更新 ADR、规格和任务清单，再修改实现。
