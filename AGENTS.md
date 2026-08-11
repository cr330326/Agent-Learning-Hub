# Agent Learning Hub

## 项目定位

Agent Learning Hub 是一个以实践成果为主线的 Agent 工程学习网站。它以九阶段路线组织 Learning、AICoding、Agentic 与 Application 四条学习轨道，并支持 Cloud Mode 公开学习和 Local Mode 本地素材深读。

产品范围和验收以 [spec.md](docs/plans/spec.md) 为准，实施顺序、完成状态与需求追踪以 [tasks.md](docs/plans/tasks.md) 为准；架构、内容模型、部署和运维边界以 [plan.md](docs/plans/plan.md) 为准，可执行的生产步骤位于 [docs/deploy/](docs/deploy/README.md)。

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
- 阅读器保留第三方 Markdown 中的排版 HTML，但只经 `modules/reader/markdown.ts` 的标签与属性 allowlist；`script`/`style`/`iframe`/表单等连同内容一起丢弃，`on*` 事件属性和非 `http(s)`/`mailto` 协议一律拒绝。扩大 allowlist 属于安全边界变更。
- 阅读器内的链接和图片都必须先经 `resolveDocumentRelativePath()` 按当前文档所在目录解析，再对照课程条目声明的路径。未声明的目标：链接降级为纯文本，图片整个丢弃。**绝不要把文档里的相对地址原样输出**——它会被浏览器解析到 `/read/` 下并 404。要放开必须同时改 `/api/local-image` 的 allowlist 并记录决定。
- 章节顺序由 `listLocalChapters()` 决定，同时驱动章节列表和上下章翻页；两者必须一致。

## 界面约定

- 所有面向用户的文本使用中文；不要把 `accessPolicy`、`publicationRights`、`licenseStatus`、搜索 `kind` 等 schema 枚举值直接渲染到页面上，统一走 `app/components/content-card.tsx` 的标签函数。
- 旧站导入把缺失字段写成了字面量 `Unknown`，并把合集名同时写进 summary 和 tag。展示层要把它们收敛为“作者待补 / 许可证待确认”，并过滤 `legacy-reading` 等内部标签，不要在数据层改写导入结果。
- 任何列出目录条目的页面都必须分页（`app/components/pagination.tsx`，每页 24 条），并且只解析当前页的条目——目录有 500+ 条，全量解析会在 Local Mode 逐条读文件系统。
- 窄屏下 `.primary-nav` 会隐藏，`.compact-nav` 必须留在 DOM 里作为替代导航；不要把导航整体 `display: none`。
- 标题使用衬线族，中日韩字形会撑满 em box，`line-height` 不要低于 1.15。

## 如何运行与验证

```bash
npm ci --prefix code
npm run dev:cloud --prefix code   # 公开视角
npm run dev:local --prefix code   # 可读 local-courses 素材正文
npm run check:cloud --prefix code
npm run check:local --prefix code
```

开发服务只能通过 `127.0.0.1` 或 `localhost` 访问。Local Mode 的免登录身份仅对回环地址成立，`next.config.ts` 的 `allowedDevOrigins` 也据此限定；改动这里会直接影响本地模式能否 hydration。

`code/AGENTS.md` 和 `code/CLAUDE.md` 由 `next dev` 自动生成，不是本仓库手写的规则文件；不要在其中记录项目约定，项目约定只写在根目录这一份。

Docker Compose 位于 `code/docker/`；从仓库根目录使用：

```bash
code/scripts/docker-deploy.sh local up
code/scripts/docker-deploy.sh local down
```

Cloud/Release 模式通过根目录 `.env` 提供秘密与镜像变量。发布模式必须指定固定版本或 digest，不能使用 `latest`。`down` 默认保留 SQLite 命名卷；不要在未确认目标的情况下删除卷。

## 脚本约定

- `code/scripts/docker-deploy.sh` 是容器构建、启动、健康验证与已发布镜像运行的入口。
- `code/scripts/lighthouse-deploy.sh` 是专用腾讯云 Lighthouse 主机的 SSH 部署入口；它不替代云端防火墙、DNS、快照、异地备份或真实恢复演练。
- `code/scripts/local-preview.sh` 是本机 Docker 预览入口，委托给 `docker-deploy.sh`，只绑定回环地址。
- `audit-content.ts`、`materials.ts`、`database.ts` 以及四个 `.mjs` 审计/走查脚本都是质量门禁或运维命令，不应因扩展名不是 `.sh` 而删除。
- `ui-review.mjs`（`npm run audit:ui`）看版式，`functional-regression.mjs`（`npm run audit:functional`）真实点击。两者都需要运行中的服务和 Playwright，因此**不进** `npm run check`；改动界面或交互后手动运行，产物写入 `code/reports/`。
- `functional-regression.mjs` 会读取页面上的运行模式徽标并据此断言：云端断言匿名访问被拒、本地素材不出正文；本地断言章节导航与学习状态读写。给某个模式新增能力时，要在两个分支里都补断言，不要用跳过掩盖差异。
- 以 `code/package.json` scripts 作为命令事实源；不要在 README、任务文档或 CI 中复制已经失效的根目录 `scripts/`、`content/`、`reports/`、Dockerfile 或 Compose 路径。

## 文档职责

- `GUIDE.md`：面向学习者和本机维护者的使用指南（模式差异、页面用法、走查命令）。
- `docs/plans/spec.md`：产品规格和验收场景。
- `docs/plans/plan.md`：架构、内容模型、边界、Docker、备份与运维约束。
- `docs/deploy/`：完全手工生产 Runbook 和 Lighthouse 自动化执行手册。
- `docs/plans/tasks.md`：任务、实施证据和需求到任务追踪。
- `docs/testing-strategy.md`：测试层次与质量门禁。
- `docs/adr/`：已接受的架构决策；不要用当前实现静默改写历史决定。
