# Agent Learning Hub

## 项目定位

Agent Learning Hub 是一个以实践成果为主线的 Agent 工程学习网站。它以九阶段路线组织 Learning、AICoding、Agentic 与 Application 四条学习轨道，并支持 Cloud Mode 公开学习和 Local Mode 本地素材深读。

产品范围和验收以 [spec.md](docs/plans/spec.md) 为准，实施顺序、完成状态与需求追踪以 [tasks.md](docs/plans/tasks.md) 为准；架构、内容模型、部署和运维以 [plan.md](docs/plans/plan.md) 为准。

## 现役工程与边界

- `code/` 是唯一现役的全栈工程，使用 Next.js App Router + TypeScript。不要新建 `apps/web/`、第二套应用或根目录的运行入口。
- `code/content/` 是公开课程和自有内容的唯一运行时目录；`code/reports/` 存放可再生成的审计证据；`code/scripts/` 存放受 `code/package.json` 和 CI 调用的维护命令。
- `learning-site/` 是迁移基线，Phase 8 对等验收前保持不动，不新增产品功能。
- `local-courses/` 是第三方 Local Material，只能在 Local Mode 以只读方式访问；云端不得打包、代理、索引或假设它存在。
- Git 管公开目录和自有内容；SQLite 只管身份、会话和个人学习状态。公开课程绝不写入 SQLite。
- `.dockerignore`、`.gitignore` 和 [content-boundaries.json](docs/content-boundaries.json) 共同定义内容、状态、报告和秘密的交付边界。

## 领域与安全约定

- Cloud/Local 的 Learning Item ID 必须一致。打开或点击仅表示开始；完成必须由用户主动确认。
- 第三方条目必须保留作者、许可证状态和上游地址；本地副本不代表获得云端发布许可。
- 本地文件必须来自 allowlist 并限制在只读挂载根内；拒绝路径穿越、符号链接逃逸和可执行 MDX。
- 网站进程不得更新嵌套素材仓库；`materials update` 仅允许在指定单课程、clean working tree 上 fast-forward。
- 运行模式、内容归属、身份或数据库边界有变化时，先更新 ADR、规格和任务清单。

## 如何运行与验证

```bash
npm ci --prefix code
npm run dev --prefix code
npm run check:cloud --prefix code
npm run check:local --prefix code
```

Docker Compose 位于 `code/docker/`；从仓库根目录使用：

```bash
code/scripts/docker-deploy.sh local up
code/scripts/docker-deploy.sh local down
```

Cloud/Release 模式通过根目录 `.env` 提供秘密与镜像变量。发布模式必须指定固定版本或 digest，不能使用 `latest`。`down` 默认保留 SQLite 命名卷；不要在未确认目标的情况下删除卷。

## 脚本约定

- `code/scripts/docker-deploy.sh` 是容器构建、启动、健康验证与已发布镜像运行的入口。
- `audit-content.ts`、`materials.ts`、`database.ts` 以及三个 `.mjs` 审计/转换脚本都是质量门禁或运维命令，不应因扩展名不是 `.sh` 而删除。
- 以 `code/package.json` scripts 作为命令事实源；不要在 README、任务文档或 CI 中复制已经失效的根目录 `scripts/`、`content/`、`reports/`、Dockerfile 或 Compose 路径。

## 文档职责

- `docs/plans/spec.md`：产品规格和验收场景。
- `docs/plans/plan.md`：架构、内容模型、边界、Docker、备份和运行手册。
- `docs/plans/tasks.md`：任务、实施证据和需求到任务追踪。
- `docs/testing-strategy.md`：测试层次与质量门禁。
- `docs/adr/`：已接受的架构决策；不要用当前实现静默改写历史决定。
