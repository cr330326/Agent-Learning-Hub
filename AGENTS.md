# AGENTS.md

本文件只记录在本仓库工作**必须遵守的规则与纪律**，所有 Agent（Claude Code、Codex 等）共用。项目是什么、怎么运行、目录结构和当前进度见 [README.md](README.md)，这里不重复；规则背后的完整论证见各条引用的 ADR。

## 0. 事实源

冲突时以事实源为准，不以本文件或 README 的转述为准。

| 问题                         | 事实源                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| 产品范围与验收场景           | [docs/plans/spec.md](docs/plans/spec.md)                                                    |
| 架构、内容模型、部署运维边界 | [docs/plans/plan.md](docs/plans/plan.md)                                                    |
| 任务状态、实施证据、需求追踪 | [docs/plans/tasks.md](docs/plans/tasks.md)（以最新复核段为准）                              |
| 已接受的架构决策             | [docs/adr/](docs/adr/)                                                                      |
| 命令                         | `code/package.json` 的 `scripts`                                                            |
| 脚本按运行位置分类           | [docs/deploy/README.md](docs/deploy/README.md#脚本按运行位置分类)                           |
| 交付边界                     | `.gitignore`、`.dockerignore`、[docs/content-boundaries.json](docs/content-boundaries.json) |
| 领域术语                     | [CONTEXT.md](CONTEXT.md)                                                                    |

- 运行模式、内容归属、身份或数据库边界有变化时，**先**更新 ADR、spec 和 tasks，再改实现。
- 不要用当前实现静默改写已接受的 ADR；推翻决定要新写一份 ADR。

## 1. 工程边界

- `code/` 是唯一现役工程。不要新建 `apps/web/`、第二套应用或新的根目录运行入口。
- `learning-site/`、根目录 `index.html` 与 `start-site.sh` 是旧站迁移基线，在 T8.5 切换归档前保持不动，不新增功能。
- `local-courses/` 是第三方素材，只能在 Local Mode 只读访问；云端不得打包、代理、索引或假设它存在。
- 公开课程与自有内容只放在 `code/content/`，由 Git 管理；SQLite 只管身份、会话和个人学习状态。公开课程绝不写入 SQLite。
- `code/AGENTS.md` 与 `code/CLAUDE.md` 由 `next dev` 自动生成，不要在其中记录项目约定。

## 2. 内容目录

- `code/content/courses/courses.json` 与 `code/content/stages/stages.json` 由人手维护，是目录的权威事实源（[ADR 0006](docs/adr/0006-catalog-is-hand-maintained.md)）。`convert:legacy` 已废弃、仅作溯源保留：不要把它接回任何流程，也不要改 `learning-site/data.js` 来影响目录。
- Cloud/Local 的 Learning Item ID 必须一致。
- 第三方条目必须保留作者、许可证状态和上游地址；本地副本不代表获得云端发布许可。
- **单一归属**（[ADR 0008](docs/adr/0008-chapter-content-has-a-single-owner.md)）：同一份本地素材正文只能被一个未退场条目声明，schema 会拒绝重复归属。退场条目携带 `redirect`，不进目录、搜索、首页计数和学习面板，但 `getItem()` 仍能找到以便路由转发。给课程卡补章节时，若目标文件已被单章条目拥有，让该条目退场并 redirect 到课程卡，不要直接加 reference。
- **Catalog Drift**（目录声明 vs 磁盘实际，`materials drift`）与 **Freshness Status**（本地素材 vs 上游，`materials check`）是两件事，不要合并。
- 漂移不进 `npm run check`：素材库随时会被重组，放进去会让维护者整理目录时连 typecheck 都跑不了。`audit:content` 中 `local-path-missing` 是 warning，`local-path-escape` 与 `local-path-not-file` 仍是 error。
- `materials drift --apply` 只落"被多条路径共同印证的目录搬迁"（[ADR 0007](docs/adr/0007-catalog-drift-is-proposed-not-applied.md)），判不准的留给人。**不要放宽这个门槛**：素材库里被删的文件几乎总有同名孪生，放宽会让条目静默指向别的项目，而页面照常渲染、审计全绿。

## 3. 本地素材与阅读器安全

- 本地文件必须来自 allowlist 并限制在只读挂载根内；拒绝路径穿越、符号链接逃逸和可执行 MDX。
- 网站进程不得更新嵌套素材仓库；`materials update` 只允许对指定单课程、clean working tree 做 fast-forward。
- 第三方 Markdown 中的排版 HTML 只经 `code/modules/reader/markdown.ts` 的标签与属性 allowlist 保留；`script`/`style`/`iframe`/表单等连同内容一起丢弃，`on*` 属性和非 `http(s)`/`mailto` 协议一律拒绝。**扩大 allowlist 属于安全边界变更。**
- 阅读器内的链接和图片必须先经 `resolveDocumentRelativePath()`（`code/modules/reader/document-source.ts`）按当前文档目录解析，再对照条目声明的路径：未声明的链接降级为纯文本，未声明的图片整个丢弃。**绝不原样输出文档里的相对地址**——浏览器会把它解析到 `/read/` 下并 404。要放开必须同时改 `/api/local-image` 的 allowlist 并记录决定。
- 阅读器输出的 `<img>` 一律带 `loading="lazy"`、`decoding="async"`、`referrerpolicy="no-referrer"`。彻底禁止远程图片属于内容政策变更，需要单独的 ADR。
- 章节顺序只由 `listLocalChapters()` 决定，它同时驱动章节列表和上下章翻页，两者必须一致。
- 一条搜索结果只代表一个可打开的目标：`buildRuntimeSearchIndex()` 把**单章条目**的正文并进条目本身，只有多章条目才另外产出逐章结果。给本地素材加索引维度时保持这个不变量。

## 4. 学习状态

- 打开或点击只表示开始；完成必须由用户主动确认。
- "动作全勾完"不等于"阶段完成"：STATE-005 要求用户提交成果确认，进度徽标最多显示"动作已做完 · 待交成果"，不得自行判定完成。
- **一个页面只取一次状态快照**：`code/app/components/stage-progress.tsx` 的 `StageProgressProvider` 负责 fetch，徽标与勾选框从 context 读。逐行请求 `/api/state` 是回归。
- 依赖登录态的控件在未登录时整块不渲染并留一句说明，不要渲染点了不会保存的控件；快照到达前不要先渲染 `0/3` 再跳变。
- 不可撤销的操作（当前只有"删除账户"）必须有独立的分隔和颜色，并保留二次确认，不能和同容器里的普通操作共用样式。

## 5. 界面

- 面向用户的文本一律中文。`accessPolicy`、`publicationRights`、`licenseStatus`、搜索 `kind`、阶段成果 `kind` 等 schema 枚举值不得直接渲染，经各展示面的标签函数映射（目录卡片走 `code/app/components/content-card.tsx`，搜索结果与学习面板各有映射表）。
- 旧站导入的字面量 `Unknown` 在展示层收敛为"作者待补 / 许可证待确认"；`legacy-reading` 等内部标签由 `displayTags()` 过滤，它同时管卡片和 `/courses` 的标签下拉。不要在数据层改写导入结果。
- 查询参数（轨道、阶段、访问方式、标签）只在匹配目录中真实存在的值时生效，不匹配就当作没传；绝不把原始值回显到页面上。
- 列出目录条目的页面必须用 `code/app/components/pagination.tsx` 分页（每页 24 条），且只解析当前页的条目——Local Mode 下全量解析会逐条读文件系统。
- 窄屏下 `.primary-nav` 隐藏，`.compact-nav` 必须留在 DOM 里作为替代导航，不要把导航整体 `display: none`。横向滚动的导航条和路线图保留右边缘淡出。
- 顶部导航末项随运行模式变化：Local Mode 显示"账户"，不能显示与 `/login` 页面内容矛盾的"登录"。
- 所有页面必须 `export const dynamic = "force-dynamic"`（或等价地按请求渲染）：header 的模式徽标和末项导航读取运行时 `DEPLOYMENT_MODE`，静态预渲染会把构建期默认值固化进页面。`next dev` 暴露不了这类问题，只有构建产物会。
- 标题使用衬线族，`line-height` 不低于 1.15（中日韩字形会撑满 em box）。

## 6. 验证纪律

- 提交前运行 `check:cloud` 与 `check:local`。它们只证明代码级门禁和生产构建；e2e、`audit:ui`、`audit:functional`、`materials check/audit/reindex/drift`、Docker 启动是各自独立的证据，不能用一次命令的退出码替代其他层，也不要把它们塞回 `check`。
- 开发服务只通过 `127.0.0.1` 或 `localhost` 访问。Local Mode 的免登录身份只对回环地址成立，`code/next.config.ts` 的 `allowedDevOrigins` 据此限定；改动它直接影响本地模式能否 hydration。
- 改过登录、学习状态或导出后，按模式各跑一次 `test:e2e:local` 与 `test:e2e:cloud`：
  - 两者都在结尾**删号**，`APP_URL` 必须指向带独立 `STATE_DATABASE_PATH` 的一次性实例，不能是日常预览——Local Mode 唯一的用户就是维护者本人。`learning-state-http.mjs` 在目标已有学习状态时拒绝运行，不要随手加 `E2E_ALLOW_DESTRUCTIVE=1` 绕过。
  - Cloud e2e **必须真的登录一次**：匿名拒绝、CSRF、删号后会话失效都挂在登录之后。`cloud-auth-state-http.mts` 用 Better Auth 自己的 API 签发会话，只打桩 GitHub token 与 profile 两个端点，要求 `STATE_DATABASE_PATH`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET` 与服务端完全一致。不要改成自己拼 cookie 签名。
  - 该测试是服务端 SQLite 的第二个写入者，必须与服务端共享文件系统。不要指向"容器化服务 + 状态放在 macOS/Windows bind mount"：`-shm` 内存映射跨 VM 不相干，会在删号级联一步产生假失败。验证容器时让应用和测试共用同一个 Docker 卷。
- 改过界面或交互后，运行 `audit:ui`（版式）与 `audit:functional`（点击）。两者需要运行中的服务和 Playwright，产物写入 `code/reports/`。
  - 零 finding 只是底线：逐屏看截图再下结论。修复走查缺陷时，把能抓住它的断言补进 `functional-regression.mjs`。
  - 页面等待用 `domcontentloaded`，不要改回 `networkidle`：第三方 README 的远程徽章图会让结果取决于跑它的机器能否连上图床。
  - 断言按页面上的运行模式徽标分支。给某个模式新增能力时两个分支都补断言，不要用跳过掩盖差异。
- 整理过 `local-courses/` 后运行 `audit:materials`，先读 `code/reports/materials/catalog-drift.md`，再决定是否 `--apply`。

## 7. 脚本、Docker 与运维

- 以 `code/package.json` 为命令事实源，不要在 README、任务文档或 CI 中写入已不存在的根目录 `scripts/`、`content/`、`reports/`、Dockerfile 或 Compose 路径。
- 改动脚本时同步 [docs/deploy/README.md](docs/deploy/README.md#脚本按运行位置分类) 的分类表。`code/scripts/` 中的 `.ts`/`.mjs` 是质量门禁或运维命令，不要因扩展名不是 `.sh` 而删除。
- 需要 `local-courses` 的脚本（`materials.ts`）和需要浏览器的脚本（`ui-review.mjs`、`functional-regression.mjs`）**绝不在生产主机运行**，云端镜像不包含素材库。
- 本机 Docker 预览（`local-preview.sh`、`mode-switch.sh`、`docker-deploy.sh local|cloud`）只绑回环地址。
- `mode-switch.sh cloud` 用一次性假凭据启动必须显式传 `--preview-secrets`，只够渲染匿名页面，不得用于任何部署。
- 发布只用固定版本或 digest，禁止 `latest`。正式发布走 `v*.*.*` tag 触发的 `.github/workflows/release.yml`（带 SBOM 与签名溯源）；`image-release.sh` 只是手工路径，默认交叉构建 `linux/amd64`。
- `docker-deploy.sh ... down` 默认保留 SQLite 命名卷；未确认目标前不要删除卷。
- `lighthouse-deploy.sh` 不替代云端防火墙、DNS、快照、异地备份或真实恢复演练；自动化脚本不代持维护者凭据。
- SQLite 的库文件、`-wal`、`-shm` 是同一状态单元，**不得手工搬运库文件**：只读打开时 `-wal` 非空而 `-shm` 缺失会直接 `SQLITE_CANTOPEN`，报错不提文件名；备份必须走在线备份 API，不能文件拷贝。
- `restore-drill.ts` 的三组反向对照（错误口令、被翻一个字节的密文、覆盖已有目标）是演练的核心，任何一条"本该失败却成功"都与恢复失败同等严重，不得删除。报告头部必须记录日期、耗时、主机平台、node 与应用版本；其中 `hostname` 是维护容器 ID，宿主机身份要另行记录。

## 8. 文档纪律

| 文件                       | 只写什么                                                |
| -------------------------- | ------------------------------------------------------- |
| `AGENTS.md`                | 规则与纪律（本文件）                                    |
| `CLAUDE.md`                | Claude Code 的查阅索引，不复制规则，不用 `@` 引用大文档 |
| `README.md`                | 项目介绍、技术栈、目录结构、常用命令、状态摘要          |
| `USER.md` / `GUIDE.md`     | 本地模式快速上手 / 面向学习者的使用手册（不写维护命令） |
| `docs/plans/`              | 规格（spec）、架构（plan）、任务与证据（tasks）         |
| `docs/deploy/`             | 部署入口与三份 Runbook；脚本运行位置分类的事实源        |
| `docs/testing-strategy.md` | 测试层次与质量门禁                                      |
| `docs/adr/`                | 已接受的架构决策                                        |

- 新规则写进本文件，项目信息写进 README，不要两处各写一遍。
- 测试数、漂移数、目录条目数等动态事实不写进规则文件；验收结论与证据写进 `tasks.md`，README 只保留带日期的摘要。
- 云端两份 Runbook（`production-manual.md` 与 `lighthouse-automation.md`）做的是同一件事，必须保持逐节可互相定位。
- `GUIDE.md` 的截图放在 `docs/images/guide/`，界面改版后要重拍。演示数据只能写进带独立 `STATE_DATABASE_PATH` 的一次性实例，不得截取或改动维护者本人的学习记录；截图隐藏 Next.js 开发角标。
