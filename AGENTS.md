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
- `code/content/courses/courses.json` 与 `code/content/stages/stages.json` 是目录的权威事实源，由人手维护。`convert:legacy` 已废弃（[ADR 0006](docs/adr/0006-catalog-is-hand-maintained.md)），只作溯源保留；它仍写死输出 `legacy-import.json`，误跑会因重复 stable ID 被校验拦下。不要把它接回任何流程，也不要改 `learning-site/data.js` 来影响目录。
- **Catalog Drift**（目录声明 vs 磁盘实际）和 **Freshness Status**（本地素材 vs 上游）是两件事，分属 `materials drift` 和 `materials check`，不要合并。素材库随时会被重组，所以漂移**不进** `npm run check`——它会让维护者整理目录时连 typecheck 都跑不了；`materials drift` 自己非零退出。`audit:content` 里 `local-path-missing` 是 warning，`local-path-escape` 与 `local-path-not-file` 仍是 error。
- 失效路径的修复由 `materials drift --apply` 落盘，但只落"被多条路径共同印证的目录搬迁"（[ADR 0007](docs/adr/0007-catalog-drift-is-proposed-not-applied.md)）。匹配器没有"已删除"这个输出——素材库有 17.5 万个文件，被删的文件几乎总有同名孪生——所以判不准的必须留给人。放宽这个门槛会让条目静默指向别的项目，页面照常渲染、审计全绿、只有内容是错的。
- 运行模式、内容归属、身份或数据库边界有变化时，先更新 ADR、规格和任务清单。
- 阅读器保留第三方 Markdown 中的排版 HTML，但只经 `modules/reader/markdown.ts` 的标签与属性 allowlist；`script`/`style`/`iframe`/表单等连同内容一起丢弃，`on*` 事件属性和非 `http(s)`/`mailto` 协议一律拒绝。扩大 allowlist 属于安全边界变更。
- 阅读器内的链接和图片都必须先经 `resolveDocumentRelativePath()` 按当前文档所在目录解析，再对照课程条目声明的路径。未声明的目标：链接降级为纯文本，图片整个丢弃。**绝不要把文档里的相对地址原样输出**——它会被浏览器解析到 `/read/` 下并 404。要放开必须同时改 `/api/local-image` 的 allowlist 并记录决定。
- 章节顺序由 `listLocalChapters()` 决定，同时驱动章节列表和上下章翻页；两者必须一致。

## 界面约定

- 所有面向用户的文本使用中文；不要把 `accessPolicy`、`publicationRights`、`licenseStatus`、搜索 `kind`、阶段成果 `kind` 等 schema 枚举值直接渲染到页面上，经各自展示面的标签函数映射为中文（目录卡片走 `app/components/content-card.tsx`，搜索结果与学习面板各有自己的映射表）。
- 旧站导入把缺失字段写成了字面量 `Unknown`，并把合集名同时写进 summary 和 tag。展示层要把它们收敛为“作者待补 / 许可证待确认”，并过滤 `legacy-reading` 等内部标签，不要在数据层改写导入结果。内部标签同样不能出现在筛选下拉里——`displayTags()` 既管卡片也管 `/courses` 的标签选项。
- 查询参数只在能对应到目录里真实存在的值时才生效：轨道、阶段、访问方式和标签都要先校验，不匹配就当作没传，绝不把原始值回显到页面上。悄悄清空结果网格或把用户输入打印回结果计数旁边都算缺陷。
- 任何列出目录条目的页面都必须分页（`app/components/pagination.tsx`，每页 24 条），并且只解析当前页的条目——目录有 500+ 条，全量解析会在 Local Mode 逐条读文件系统。
- 一条结果只代表一个可打开的目标。旧站导入让每个上游章节文件都变成了独立课程条目，其唯一 reference 的 label 就是条目标题；`buildRuntimeSearchIndex()` 因此把**单章条目**的正文并进条目本身，只有多章条目才另外产出逐章结果。给本地素材加索引维度时要保持这个不变量。
- 窄屏下 `.primary-nav` 会隐藏，`.compact-nav` 必须留在 DOM 里作为替代导航；不要把导航整体 `display: none`。横向滚动的导航条和路线图要保留右边缘淡出——它们隐藏了滚动条，没有淡出时被裁掉的文字会被读成渲染错误。
- 顶部导航最后一项随运行模式变化：Local Mode 已经自动签入固定单用户，只能显示“账户”，不能显示与 `/login` 页面内容矛盾的“登录”。
- 所有页面都必须 `export const dynamic = "force-dynamic"`（或等价地按请求渲染）：header 的模式徽标和末项导航读取运行时 `DEPLOYMENT_MODE`，静态预渲染会把构建期默认值固化进页面——`/content-policy`、`/contribute` 与 404 曾因此在本地 Docker 部署里错误显示“云端模式 + 登录”。`next dev` 按请求渲染、暴露不了这类问题，只有构建产物会。
- 不可撤销的操作（当前只有“删除账户”）不能和同容器里的普通操作共用样式，必须有独立的分隔和颜色，并保留二次确认。
- 个人学习状态出现在多个公开页面上，但**一个页面只能取一次快照**：`app/components/stage-progress.tsx` 的 `StageProgressProvider` 负责 fetch，徽标与勾选框从 context 读。路线页一次要渲染九行，逐行请求 `/api/state` 是回归项。
- “动作全勾完”不等于“阶段完成”。STATE-005 规定完成必须由用户提交成果确认，进度徽标最多显示“动作已做完 · 待交成果”，不得自行判定完成。
- 依赖登录态的控件在未登录时必须整块不渲染，并留一句说明，而不是渲染出点了不会保存的控件；快照到达前也不要先渲染 `0/3` 再跳变。
- 阅读器输出的 `<img>` 一律带 `loading="lazy"`、`decoding="async"` 和 `referrerpolicy="no-referrer"`：第三方 README 里的绝对图片地址经过消毒后仍然是绝对地址，请求还是会从读者浏览器发出去。要彻底禁止远程图片属于内容政策变更，需要单独的 ADR。
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

`check` 里没有端到端测试——它们需要一个已经跑起来的构建产物。改过登录、学习状态或导出后，按模式各跑一次：

```bash
APP_URL=http://127.0.0.1:3100 npm run test:e2e:local --prefix code
APP_URL=http://127.0.0.1:3100 npm run test:e2e:cloud --prefix code
```

两条命令都会**在结尾删号**，所以 `APP_URL` 必须指向一次性实例（自带 `STATE_DATABASE_PATH`），不要指向你日常在用的本地预览。Local Mode 只有一个用户，就是你本人：指错了会把阅读进度、笔记和收藏一起清掉，而且中途所有断言都只针对测试自己刚写的数据，看不出异常。`learning-state-http.mjs` 因此在开跑前检查目标是否已有学习状态，非空即拒绝，除非显式 `E2E_ALLOW_DESTRUCTIVE=1`。

两者不是同一个测试的两种配置。Local Mode 自动签入固定单用户，可以直接写状态；**Cloud Mode 必须先真的登录一次**，因为匿名拒绝、CSRF、删号后会话失效全都挂在登录后面——跳过登录的云端 e2e 会把匿名断言全跑通，却对鉴权后的一半毫无覆盖。`cloud-auth-state-http.mts` 用 Better Auth 自己的 API 在服务端同一个 SQLite 文件上签发会话，只打桩 GitHub 的 token 与 profile 两个端点；它要求 `STATE_DATABASE_PATH`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` 与服务端完全一致，不要改成自己拼 cookie 签名。

签发会话让这个测试成了服务端 SQLite 文件的**第二个写入者**，所以它必须和服务端共享文件系统——CI、开发机，或共用一个卷的两个容器。指向"容器化服务 + 状态放在 macOS/Windows bind mount"会产生假失败：SQLite 的 WAL 锁经由内存映射的 `-shm` 协调，该映射跨 VM 边界不相干。实测症状具有迷惑性——写入成功、删号返回 200、会话确实失效，但文件里用户行还在，于是在删号级联那步失败，而应用本身是对的。测试中段的「the database file agrees with the server about the note just written」就是为点名这种环境而设。要验证容器，就让应用和测试共用同一个 Docker 卷（这也正是生产拓扑），同一套断言 29/29 通过。

`code/AGENTS.md` 和 `code/CLAUDE.md` 由 `next dev` 自动生成，不是本仓库手写的规则文件；不要在其中记录项目约定，项目约定只写在根目录这一份。

Docker Compose 位于 `code/docker/`；从仓库根目录使用：

```bash
code/scripts/docker-deploy.sh local up
code/scripts/docker-deploy.sh local down
```

Cloud/Release 模式通过根目录 `.env` 提供秘密与镜像变量。发布模式必须指定固定版本或 digest，不能使用 `latest`。`down` 默认保留 SQLite 命名卷；不要在未确认目标的情况下删除卷。

## 脚本约定

脚本按**在哪台机器上执行**和**作用于什么**分三类，两件事不一样：`image-release.sh` 和 `lighthouse-deploy.sh` 都在开发机上跑，作用对象却是云端。完整分类表在 [docs/deploy/README.md](docs/deploy/README.md#脚本按运行位置分类)，改动脚本时同步那里。

| 类别               | 脚本                                                                                                                                                                | 边界                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 本机 → 本机        | `audit-content.ts`、`materials.ts`、`audit-content-boundaries.mjs`、`baseline-report.mjs`、`ui-review.mjs`、`functional-regression.mjs`、`restore-drill.ts`         | 需要 `local-courses` 或浏览器的都不进 `npm run check` |
| 本机 → 本机 Docker | `local-preview.sh`、`mode-switch.sh`、`docker-deploy.sh local\|cloud`                                                                                               | 只绑回环地址                                          |
| → 云端             | `image-release.sh`（本机执行）、`lighthouse-deploy.sh`（本机执行、SSH 操作云主机）、`docker-deploy.sh release`、`database.ts` 与 `restore-drill.ts`（在云主机执行） | 只跑固定版本或 digest                                 |

需要 `local-courses` 的脚本（`materials.ts`）和需要浏览器的脚本（两个走查脚本）**绝不能在生产主机运行**——云端镜像根本不包含素材库。

- `code/scripts/docker-deploy.sh` 是容器构建、启动、健康验证与已发布镜像运行的入口。
- `code/scripts/lighthouse-deploy.sh` 是专用腾讯云 Lighthouse 主机的 SSH 部署入口；它不替代云端防火墙、DNS、快照、异地备份或真实恢复演练。
- `code/scripts/local-preview.sh` 是本机 Docker 预览入口，委托给 `docker-deploy.sh`，只绑定回环地址。
- `code/scripts/mode-switch.sh` 在本机 Docker 上切换或并行运行 Local/Cloud 两种模式，同样委托给 `docker-deploy.sh`。两种模式用各自的 Compose 项目、端口和 SQLite 卷。Cloud Compose 的 `${VAR:?}` 会让缺凭据时连 `down`/`ps` 都失败，因此只读与停止路径注入显式假值；真正 `up` 必须显式传 `--preview-secrets` 才允许用一次性假凭据，且只够渲染匿名页面。
- `code/scripts/image-release.sh` 是本机构建并推送发布镜像的手工路径，默认交叉构建 `linux/amd64`（云主机是 x86，Apple Silicon 直接构建的 arm64 镜像跑不起来），拒绝 `latest`，推送前检查版本是否已存在，成功后打印可固定的 digest。带 SBOM 与签名溯源的正式发布仍走 `v*.*.*` tag 触发的 `.github/workflows/release.yml`。
- `code/scripts/restore-drill.ts`（`npm run drill:restore`）是 GATE-07 的执行体。它跑真实的 `db:backup`/`db:restore` 两条 CLI，在一个从未存在过数据库的目录里恢复，并逐张私有表比对行数。三组**反向对照**是它的核心而不是附加项——错误口令、被翻掉一个字节的密文、覆盖已有目标，三者必须全部被拒绝；某条"本该失败却成功了"和恢复失败同等严重。删掉任何一条对照，演练就退化成"命令没报错"。`--source` 必须走 SQLite 在线备份 API 而不是文件拷贝：live 库的已提交页可能还在 `-wal` 里。报告头部记录日期、耗时、主机平台、node 与应用版本——OPS-006 要求演练记录能看出**是哪台机器、哪个构建**跑的，缺了这几项就只剩一句「通过了」。注意 `hostname` 取的是维护容器 ID 而非宿主机名，宿主机身份要另行记录。2026-08-20 已在目标主机 `VM-0-9-ubuntu` 实跑 16/16，GATE-07 据此勾选。
- 只读挂载状态卷时 `-shm` 必须存在。实测：`-wal` 非空而 `-shm` 缺失时，只读打开直接 `SQLITE_CANTOPEN`，报错里不提任何文件名。生产备份和演练都在只读卷上打开数据库，所以"不得手工搬运库文件"不是洁癖。
- `audit-content.ts`、`materials.ts`、`database.ts`、`restore-drill.ts` 以及五个 `.mjs` 审计/走查脚本都是质量门禁或运维命令，不应因扩展名不是 `.sh` 而删除。
- `ui-review.mjs`（`npm run audit:ui`）看版式，`functional-regression.mjs`（`npm run audit:functional`）真实点击。两者都需要运行中的服务和 Playwright，因此**不进** `npm run check`；改动界面或交互后手动运行，产物写入 `code/reports/`。
- `npm run audit:materials`（即 `materials drift`）同理不进 `check`：它依赖仓库之外的素材库。整理过 `local-courses/` 之后手动跑，先读 `code/reports/materials/catalog-drift.md`，再决定要不要 `--apply`。
- `functional-regression.mjs` 的页面等待用 `domcontentloaded` 而不是 `networkidle`。第三方 README 里嵌着 shields.io / contrib.rocks / trendshift 这类远程徽章图，阅读器按内容政策保留它们；等 `networkidle` 会让走查结果取决于**跑它的机器能不能连上这些图床**——实测有一个挂住时，每次导航都在 30 秒超时，报告把网络问题记成阅读器缺陷。这些断言看的是 DOM 结构和学习状态往返，不需要图片加载完，真正的异步由各自的 `waitFor()` 等。
- `functional-regression.mjs` 会读取页面上的运行模式徽标并据此断言：云端断言匿名访问被拒、本地素材不出正文；本地断言章节导航与学习状态读写。给某个模式新增能力时，要在两个分支里都补断言，不要用跳过掩盖差异。
- 以 `code/package.json` scripts 作为命令事实源；不要在 README、任务文档或 CI 中复制已经失效的根目录 `scripts/`、`content/`、`reports/`、Dockerfile 或 Compose 路径。

## 文档职责

- `USER.md`：本地模式快速上手（跑起来、Docker 里切换模式、构建推送镜像）；深入用法归 `GUIDE.md`，边界与运维归 `README.md` 和 `docs/`。
- `GUIDE.md`：面向学习者和本机维护者的使用指南（模式差异、页面用法、走查命令）。
- `docs/plans/spec.md`：产品规格和验收场景。
- `docs/plans/plan.md`：架构、内容模型、边界、Docker、备份与运维约束。
- `docs/deploy/`：三条运行路径各一份可独立执行的 Runbook——`local-manual.md`（本机运行本地服务）、`production-manual.md`（云端完全手工）、`lighthouse-automation.md`（云端脚本化）；`README.md` 是入口，同时是脚本运行位置分类的事实源。云端两份做的是同一件事，必须保持逐节可互相定位。
- `docs/plans/tasks.md`：任务、实施证据和需求到任务追踪。
- `docs/testing-strategy.md`：测试层次与质量门禁。
- `docs/adr/`：已接受的架构决策；不要用当前实现静默改写历史决定。
