# Agent Learning Hub

Agent Learning Hub 是一个以实践成果为主线的 Agent 工程学习网站：用九阶段路线组织四条学习轨道，把公开课程、可审计的上游资料、本地只读素材和个人学习状态放在同一套导航里。

新应用的唯一现役目录是 [`code/`](./code/)。仓库中的 [`learning-site/`](./learning-site/) 和根目录启动脚本仍保留为迁移基线，直到 Phase 8 对等验收和切换完成；新功能不再添加到旧站。

## 快速启动

### 本地开发

需要 Node.js 22 或更新版本：

```bash
npm ci --prefix code
npm run dev --prefix code
```

打开 <http://localhost:3000>。开发服务默认使用 `cloud` 模式；需要本地素材时，设置 `DEPLOYMENT_MODE=local` 并提供 `LOCAL_MATERIAL_ROOT`。完整环境变量示例见 [`.env.example`](./.env.example)。

提交前运行两种模式的质量门禁：

```bash
npm run check:cloud --prefix code
npm run check:local --prefix code
```

门禁包括格式、lint、类型、内容审计、工具测试、Vitest 和生产构建。生产 HTTP 冒烟测试需要先启动构建产物：

```bash
npm run build --prefix code
DEPLOYMENT_MODE=local npm run start --prefix code -- --hostname 127.0.0.1 --port 3000
APP_URL=http://127.0.0.1:3000 EXPECTED_RUNTIME_MODE=local npm run test:e2e:local --prefix code
```

### Docker Local Mode

Local Mode 会把宿主机的 `local-courses/` 以只读方式挂载进容器，SQLite 状态放在 Docker named volume：

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

打开 <http://127.0.0.1:3000>。本地模式免登录，素材缺失或格式不支持时会安全回退到课程上游链接。

### Docker Cloud Mode

Cloud Mode 不包含、不挂载也不代理 `local-courses/`。先复制环境模板，填入长随机 `BETTER_AUTH_SECRET`、公开 HTTPS origin 和 GitHub OAuth 凭据：

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.cloud.yml up --build
```

在 GitHub OAuth App 中登记：

```text
${BETTER_AUTH_URL}/api/auth/callback/github
```

登录只请求 `read:user`，不请求或保存 GitHub 邮箱、OAuth access/refresh token，也不保存原始会话 token。云端会话使用 `agent-learning-session` cookie，数据库只保存会话 token 的 SHA-256 摘要。部署、反向代理、HTTPS 和回滚步骤见 [`docs/deployment.md`](./docs/deployment.md)。

## 产品结构

- **九阶段路线**：从 Agent 基础循环、工具与检索，到浏览器、评测、安全和可交付系统。
- **四条轨道**：Learning、Agentic、AICoding、Application；阶段和课程 ID 在 cloud/local 中保持一致。
- **统一课程目录**：Git 管理的 `content/` 是公开目录与自有策展内容的事实源，条目保留来源、作者、许可证状态和上游地址。
- **统一内容解析**：课程导览、搜索和阅读器都通过 Content Resolver 处理站内正文、本地文件、上游链接和不可用状态。
- **个人学习状态**：登录后可记录进度、阅读位置、收藏、私人笔记和阶段成果，并可导出或删除账户数据。
- **素材状态工具**：本地维护者可以检查 Git freshness、执行单课程 fast-forward 更新、审计白名单路径并重建本地搜索索引。

架构边界、数据模型和需求追踪入口：

- [`docs/plans/spec.md`](./docs/plans/spec.md)：产品规格与验收场景
- [`docs/plans/plan.md`](./docs/plans/plan.md)：架构、接口和数据模型
- [`docs/plans/tasks.md`](./docs/plans/tasks.md)：按 Phase 推进的实施清单
- [`docs/content-boundaries.md`](./docs/content-boundaries.md)：Git、镜像、云端和本地素材归属
- [`code/modules/README.md`](./code/modules/README.md)：代码模块边界

## 内容归属与隐私

仓库把内容分成两类：

1. `content/` 中的策展目录和自有正文可以进入 Git 和应用镜像；第三方条目只保留获准发布的元数据、引用、作者、许可证状态和上游地址。
2. `local-courses/` 是开发者本机的第三方 Local Material。正文不进入 Git、Docker cloud build context 或云端索引，只能在 Local Mode 通过只读挂载访问。

应用镜像不携带 SQLite、备份、秘密、审计输出或旧站。身份、会话和私人学习状态只写入 SQLite；公开课程不写入 SQLite。路径穿越、符号链接逃逸、危险 Markdown/MDX、越权状态写入和跨模式素材泄漏均有测试覆盖。

审计内容边界：

```bash
node scripts/audit-content-boundaries.mjs --output-dir reports/content-boundaries
```

审计报告、旧数据转换报告和当前基线报告位于 [`reports/`](./reports/)。报告中的数量由脚本生成，不在 README 中维护手工快照。

## 本地素材维护

本地素材的归属、允许追踪的元数据和完整操作命令见 [`local-courses/README.md`](./local-courses/README.md)。常用命令：

```bash
npm run materials --prefix code check
npm run materials --prefix code audit
npm run materials --prefix code reindex
npm run materials --prefix code update <course-id> --yes
```

`update` 只允许对一个目录白名单内、clean working tree 的 Git 素材仓库执行 fast-forward；更新后会自动重新审计并重建索引。

## 数据库、备份与运维

SQLite 迁移、WAL 边界、一致性备份、加密、保留和恢复命令见 [`docs/database-operations.md`](./docs/database-operations.md)。应用不自动把备份复制到异地；生产环境需要由部署方接入受保护的调度器、秘密管理和异地存储。

```bash
STATE_DATABASE_PATH=/data/state/learning-state.sqlite \
BACKUP_OUTPUT_DIR=/secure/backups/agent-learning-hub \
BACKUP_PASSPHRASE='provided-by-secret-manager' \
npm run db:backup --prefix code
```

健康检查：

```bash
curl http://127.0.0.1:3000/api/health
```

管理员健康页只返回聚合状态，不展示绝对路径、秘密或私人笔记正文。

## 贡献

新增或修正公开条目前，先确认内容归属、来源、作者、许可证状态和上游地址，再修改 `content/` 中的结构化目录。代码变更应补充对应模块测试，并在 cloud/local 两种模式下运行质量门禁。涉及运行模式、内容归属、身份或数据库边界的取舍，先更新 `docs/adr/`、规格或任务清单。

旧站的 [`learning-site/`](./learning-site/) 仅用于 Phase 8 对等验收，不作为新功能入口。历史基线和转换差异分别见 [`reports/baseline/baseline.md`](./reports/baseline/baseline.md) 与 [`reports/legacy-conversion/legacy-conversion.md`](./reports/legacy-conversion/legacy-conversion.md)。
