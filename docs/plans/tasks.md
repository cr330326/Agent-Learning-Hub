# Agent Learning Hub 实施任务清单

**状态**：实施中（已完成公开浏览、双模式内容解析、个人学习状态、本地 Docker、搜索、素材状态检查、管理员健康摘要和 Better Auth 云端登录；完整运维尚待完成）
**版本**：1.0  
**日期**：2026-08-09
**产品规格**：[spec.md](./spec.md)  
**总体方案**：[Agent Learning Hub 产品与技术方案](./plan.md)

## 1. 使用方法

- 按 Phase 顺序推进；只有显式标注可并行的任务可以跨顺序实施。
- 主任务完成后勾选标题前的复选框，并保留测试、文档或演练证据。
- `依赖` 指必须先完成的任务 ID；`—` 表示无前置任务。
- `规格` 指该任务覆盖的 [spec.md](./spec.md) 需求或验收场景。
- 每个 Phase 的退出条件全部满足后，才能将该 Phase 标为完成。
- 实现过程中发现规格冲突时，先修订方案/spec/ADR，不在代码中形成隐式新决策。

## 2. 全局完成定义

一个任务只有同时满足以下条件才算完成：

- 实现内容符合关联需求，且没有扩大首版范围。
- 新增或修改的行为有相应测试；测试在 CI 和本地均可重复运行。
- 类型检查、格式检查、测试和生产构建通过。
- 涉及配置、命令、部署或内容维护的变更已同步文档。
- 不提交 Token、数据库、备份、本地素材正文或其他秘密/大文件。
- 涉及数据库的任务包含迁移及回滚/恢复说明。
- 涉及云端与本地模式的任务同时验证两种模式，或明确说明为何仅适用于一种模式。

## 3. Phase 0：基线与实施护栏

### - [x] T0.1 固化仓库基线报告

**依赖**：—  
**规格**：IA-005、CAT-004、AC-10

- 编写只读盘点脚本，生成阶段、轨道、课程、分组、章节、本地引用和嵌套仓库统计。
- 输出机器可读报告和 Markdown 摘要，替代 README 中的手工数字。
- 保存当前 `learning-site/` 核心能力清单，作为 Phase 8 对等验收基线。
- 标记未进入课程清单、路径失效和存在本地修改的素材仓库。

**完成证据**：脚本在当前仓库可重复运行；输出与现有快照差异有解释。

**实施证据（2026-08-09）**：`npm run audit:baseline --prefix code` 生成 [JSON 基线报告](../../code/reports/baseline/baseline.json) 与 [Markdown 摘要](../../code/reports/baseline/baseline.md)。[baseline-report.test.mjs](../../code/tests/baseline-report.test.mjs) 覆盖报告输出、引用/覆盖率异常、嵌套仓库脏状态和旧站能力清单；报告说明了与旧手工统计的口径差异。

### - [x] T0.2 建立内容归属与忽略规则

**依赖**：T0.1  
**规格**：CAT-001、CAT-002、CAT-005、DEPLOY-002、PRIV-001

- 明确哪些目录进入 Git、镜像和部署包。
- 校验 `.gitignore`、Docker ignore 和 CI artifact 规则不会包含第三方素材正文、SQLite 文件、备份及秘密。
- 为自有内容、第三方引用和本地素材建立可审计边界。

**完成证据**：提供一次镜像/构建上下文清单审计结果。

**实施证据（2026-08-09）**：[content-boundaries.json](../content-boundaries.json) 定义可审计的目录归属和交付边界；执行规则收敛在 [plan.md 第 7 节](./plan.md#7-内容维护与归属)。`npm run audit:boundaries --prefix code` 生成 [JSON 审计](../../code/reports/content-boundaries/content-boundaries.json) 和 [Markdown 摘要](../../code/reports/content-boundaries/content-boundaries.md)，验证 Git、Docker 和 CI artifact 边界。14 个历史追踪的第三方 Local Material 文件已仅从 Git 索引移除，文件仍保留在本机；`local-courses/README.md` 是唯一允许追踪的素材库元数据。

### - [x] T0.3 建立需求追踪和质量门禁

**依赖**：—  
**规格**：NFR-006、NFR-007

- 约定测试目录、命名、覆盖范围和 CI 必过检查。
- 建立需求 ID 到测试/任务的追踪方式。
- 为 cloud、local 两种模式定义独立测试配置。

**完成证据**：最小 CI 流程可运行，并包含空骨架的类型、格式、测试和构建步骤。

**实施证据（2026-08-09）**：[testing-strategy.md](../testing-strategy.md) 约定测试分层、位置、命名和覆盖范围；本文的任务 ID、`spec.md` 需求 ID 与每项实施证据共同构成追踪矩阵（见 [plan.md 第 14 节](./plan.md#14-文档职责)）。[quality.yml](../../.github/workflows/quality.yml) 在 Cloud/Local Mode 矩阵中执行质量门禁，并先运行内容边界审计。`npm run check:cloud --prefix code` 与 `npm run check:local --prefix code` 已在本地通过。

**Phase 0 退出条件**：基线可重复生成；内容边界明确；质量门禁可执行。

## 4. Phase 1：应用骨架与内容模型

### - [x] T1.1 创建 Next.js TypeScript 应用骨架

**依赖**：T0.2、T0.3  
**规格**：DEPLOY-001、NFR-004、NFR-006

- 按总体方案在 `code/` 创建全栈应用工程。
- 配置 App Router、TypeScript、格式检查、单元测试和生产构建。
- 建立 `catalog`、`content-resolver`、`learning-state`、`reader`、`search`、`freshness` 和 `auth` 模块边界。
- 增加运行模式配置解析，但暂不实现具体 adapter。

**完成证据**：开发服务与生产构建成功；无内容的首页可访问；CI 通过。

**实施证据（2026-08-09）**：`code/` 已建立 Next.js App Router、TypeScript、ESLint、Prettier、Vitest 和生产构建脚本；[modules/README.md](../../code/modules/README.md) 固化七个领域模块与 runtime 边界。运行模式解析由 [runtime-config.test.ts](../../code/modules/runtime/runtime-config.test.ts) 覆盖 Cloud、Local 和非法配置；同一生产构建分别以 Cloud/Local Mode 启动并通过 [首页 HTTP 冒烟测试](../../code/tests/e2e/home-page-http-smoke.mjs)。

### - [x] T1.2 定义阶段、课程和学习条目 schema

**依赖**：T1.1  
**规格**：IA-001—IA-005、CAT-001—CAT-007

- 定义 Track、Stage、LearningItem、StageTask 和 ProjectOutcome 内容结构。
- 实现稳定 ID、枚举、日期、URL、来源、作者、许可证和引用完整性校验。
- 生成类型定义，避免运行时 schema 与 TypeScript 类型分叉。
- 为合法、缺字段、重复 ID、无效阶段和错误访问策略编写测试。

**完成证据**：内容 schema 测试通过，错误内容在构建前被拒绝并给出可定位信息。

**实施证据（2026-08-09）**：[content-schema.ts](../../code/modules/catalog/content-schema.ts) 以 Zod 定义 Track、Stage、Stage Task、Project Outcome 和 Learning Item，并从同一 schema 推导 TypeScript 类型；`validateContentCatalog` 返回字段路径，`parseContentCatalog` 用于拒绝非法目录。[content-schema.test.ts](../../code/modules/catalog/content-schema.test.ts) 覆盖合法目录、缺字段、重复 ID、无效阶段、无效 URL/日期、来源/作者/许可证和访问策略边界。维护契约见 [plan.md 第 6.1 节](./plan.md#61-content-catalog-module)。

### - [x] T1.3 创建内容目录和 Catalog API

**依赖**：T1.2  
**规格**：CAT-001—CAT-007、PAGE-003、PAGE-004

- 建立 `code/content/stages`、`code/content/courses`、`code/content/articles`、`code/content/catalog` 和 `code/content/schemas`。
- 实现 `listItems`、`getItem` 和 `getStage`。
- 支持按阶段、轨道、标签和访问策略查询。
- 确保构建输出不依赖 SQLite 才能读取公开内容。

**完成证据**：Catalog API 单元测试覆盖查询、排序、缺失 ID 和非法内容。

**实施证据（2026-08-09）**：已建立 Git 管理的 [code/content/](../../code/content/) 目录，包括 `stages`、`courses`、`articles`、`catalog` 和 `schemas`。[catalog-api.ts](../../code/modules/catalog/catalog-api.ts) 仅从该目录读取 JSON 清单，逐文件验证并在交叉引用验证后提供 `listItems`、`getItem`、`getStage`；不读取 SQLite 或 `local-courses/`。[catalog-api.test.ts](../../code/modules/catalog/catalog-api.test.ts) 覆盖默认目录、稳定排序、阶段/轨道/标签/访问策略查询、缺失 ID 和带文件路径的非法内容错误。

### - [x] T1.4 实现旧数据转换器

**依赖**：T0.1、T1.2、T1.3  
**规格**：CAT-004、IA-005、AC-10

- 读取 `learning-site/data.js` 并转换九阶段、四轨道及现有课程/章节引用。
- 为无法自动确定的作者、许可证、上游地址生成待处理报告，不猜测值。
- 确保转换可重复运行，避免手工生成结果漂移。
- 对照基线报告验证数量、ID、顺序和路径。

**完成证据**：转换前后差异报告经人工确认；所有已策展条目均有确定去向。

**实施证据（2026-08-09）**：[convert-legacy-content.mjs](../../code/scripts/convert-legacy-content.mjs) 可重复把 `learning-site/data.js` 转为 [结构化阶段](../../code/content/stages/legacy-import.json)、[课程与章节条目](../../code/content/courses/legacy-import.json)、[项目阶梯](../../code/content/catalog/project-outcomes.json) 与完整旧数据快照；各条转换记录保留 `legacyImport.raw`，完整源数据保留在快照中。[legacy-conversion.json](../../code/reports/legacy-conversion/legacy-conversion.json) 对照基线确认 4 轨、9 阶段、42 课程卡、38 分组、472 章节和路径引用；[待补全报告](../../code/reports/legacy-conversion/legacy-conversion.md) 明确列出 488 个缺失上游地址及 514 个未知作者/许可证，未猜测值。[legacy-content-converter.test.mjs](../../code/tests/legacy-content-converter.test.mjs) 断言转换可重复、数量与基线一致。

### - [x] T1.5 建立内容审计命令

**依赖**：T1.3、T1.4  
**规格**：CAT-007、ADMIN-001、IA-005

- 检查 schema、重复 ID、无效阶段、来源、许可证、本地路径和孤立条目。
- 输出 JSON 与 Markdown 报告。
- 在 CI 中将确定性错误设为失败，将网络类检查作为独立结果处理。

**完成证据**：当前目录可生成完整审计报告，故障测试能触发 CI 失败。

**实施证据（2026-08-09）**：`npm run audit:content --prefix code` 报告 0 个确定性错误；[content-audit-cli.test.mjs](../../code/tests/content-audit-cli.test.mjs) 覆盖通过与故障退出路径，命令同时写出 JSON/Markdown 报告。

**Phase 1 退出条件**：现有阶段和课程可无损转换，新目录通过 schema 与引用审计。

## 5. Phase 2：公开网站与视觉迁移

### - [x] T2.1 建立全局布局与视觉系统

**依赖**：T1.1  
**规格**：PAGE-001、PAGE-007、PAGE-008、NFR-001—NFR-005

- 迁移暖色出版物风格、轨道色和交通线路图视觉语言。
- 建立响应式导航、页脚、模式标识、加载、空状态和错误状态。
- 定义手机端阶段折叠导航和阅读器目录抽屉。
- 验证键盘导航、焦点样式、语义标题和颜色对比。

**完成证据**：桌面和常见手机视口的视觉/无障碍基础检查通过。

**实施证据（2026-08-09）**：[全局站点外壳](../../code/app/components/site-chrome.tsx) 与 [视觉系统](../../code/app/globals.css) 已覆盖导航、页脚、模式标识、空/错误状态和移动端布局；Chrome 390×844 走查确认搜索、学习面板和阅读器无横向溢出，Lighthouse 移动端搜索页 Accessibility/Best Practices/SEO/Agentic Browsing 均为 100，控制台无错误。

### - [x] T2.2 实现首页与九阶段路线页

**依赖**：T1.3、T2.1  
**规格**：IA-001—IA-003、PAGE-001、PAGE-002

- 首页呈现定位、九阶段入口、四轨道说明、双模式说明和项目阶梯入口。
- 路线页展示阶段顺序、学习目标、任务和条目分布。
- 未登录时不展示虚假的持久化进度。

**完成证据**：匿名用户可从首页进入任一阶段并理解下一步行动。

**实施证据（2026-08-09）**：[首页](../../code/app/page.tsx)、[路线页](../../code/app/roadmap/page.tsx) 和 [阶段详情页](../../code/app/roadmap/[stageId]/page.tsx) 已接入真实 catalog；HTTP 端到端冒烟覆盖首页、路线和阶段详情，匿名页面不显示持久化进度。

### - [x] T2.3 实现课程目录与导览页

**依赖**：T1.3、T2.1  
**规格**：PAGE-003、PAGE-004、PAGE-007、CAT-005

- 实现阶段、轨道、标签和访问方式筛选。
- 导览页展示摘要、目标、来源、作者、许可证、相关阶段和访问按钮。
- 访问按钮基于统一的解析结果展示，不在页面内复制解析规则。

**完成证据**：筛选组合、空结果、未知课程和不同访问类型测试通过。

**实施证据（2026-08-09）**：[课程目录](../../code/app/courses/page.tsx) 支持阶段、轨道、标签和访问方式查询，[课程导览](../../code/app/courses/[itemId]/page.tsx) 统一调用 resolver；浏览器 E2E 验证了 `learning + owned + tag` 组合、空结果、未知条目和本地/上游/站内访问动作。

### - [x] T2.4 实现项目阶梯

**依赖**：T1.3、T2.1  
**规格**：IA-003、PAGE-005、STATE-005、STATE-006

- 展示每阶段实践任务、预期成果和验收提示。
- 匿名用户可查看要求，但不能产生持久化成果记录。

**完成证据**：九阶段均有明确产出定义，不存在无成果要求的阶段。

**实施证据（2026-08-09）**：[项目阶梯页](../../code/app/projects/page.tsx) 和阶段详情页展示九阶段任务、成果与验收提示；公开 HTTP 冒烟覆盖项目页。

### - [x] T2.5 实现自有内容阅读器

**依赖**：T1.3、T2.1  
**规格**：READ-001、READ-004—READ-006、NFR-002—NFR-005

- 支持安全 Markdown/MDX、GFM、代码块、图片、目录和上下章。
- 使用明确组件白名单，禁用脚本、事件属性、任意 iframe 和可执行 JavaScript。
- 对不支持内容提供安全退化提示。

**完成证据**：正常文档、恶意 Markdown、超长文档和移动端阅读测试通过。

**实施证据（2026-08-09）**：[Markdown 渲染器](../../code/modules/reader/markdown.ts) 仅输出安全白名单 HTML，测试覆盖标题、GFM/代码块、相对图片和危险协议；[阅读器](../../code/app/read/[itemId]/page.tsx) 已接入目录、章节导航、源码/上游安全退化和阅读状态。浏览器实际打开 33,133px 长本地章节并在 390px 视口通过目录、正文和位置恢复走查。

**修订（2026-08-11，见 T8.6）**：上述"白名单"当时只覆盖 Markdown 语法，混在正文里的 HTML 会被整体转义成可见文本，GFM 表格也尚未实现。渲染策略已改为标签/属性 allowlist 通过（详见 [plan.md](plan.md) 6.5），并补齐表格、分隔线、嵌套列表与任务项；注入负向测试保留。

**Phase 2 退出条件**：匿名用户能浏览路线、筛选课程、查看导览、阅读自有内容和项目要求。

## 6. Phase 3：云端内容模式

### - [x] T3.1 定义 Content Resolver interface

**依赖**：T1.2  
**规格**：RES-001—RES-010、DEPLOY-001

- 定义 `ResolvedContent` 判别联合和 adapter 接口。
- 将页面访问按钮、阅读器入口和搜索结果统一接入 resolver。
- 为所有访问策略建立表驱动测试。

**完成证据**：调用方不包含 cloud/local 的文件路径分支判断。

**实施证据（2026-08-09）**：[Content Resolver interface](../../code/modules/content-resolver/content-resolver.ts) 以 `ResolvedContent` 判别联合统一站内、Local、上游和不可用结果；[Cloud/Local adapter 测试](../../code/modules/content-resolver/content-resolver.test.ts) 与 [Local adapter 测试](../../code/modules/content-resolver/local-content-resolver.test.ts) 以访问策略表驱动验证，课程导览只消费 resolver 结果，不拼接素材路径。

### - [x] T3.2 实现 Cloud Adapter

**依赖**：T3.1  
**规格**：RES-001—RES-004、AC-01

- 自有内容返回站内阅读地址。
- 第三方内容返回经过校验的上游 URL。
- 缺少合法访问方式时返回不可用原因。
- 禁止从 cloud adapter 读取本地素材路径。

**完成证据**：Cloud Adapter 单元测试覆盖 owned、upstream-only、local-preferred 和 unavailable。

**实施证据（2026-08-09）**：[Cloud Adapter](../../code/modules/content-resolver/content-resolver.ts) 通过 `content-resolver.test.ts` 表驱动覆盖四种访问策略；云端完整检查在不读取本地正文的情况下通过，第三方导览返回校验后的 HTTP(S) URL。

### - [x] T3.3 建立“无 local-courses”云端验证

**依赖**：T3.2  
**规格**：RES-003、DEPLOY-002、DEPLOY-008、AC-01

- 在不提供 `local-courses/` 的干净上下文构建镜像。
- 扫描构建产物和镜像，确认无本地素材正文或绝对路径残留。
- 执行公开页面和第三方导览冒烟测试。

**完成证据**：CI 中 cloud-clean-room 作业稳定通过。

**实施证据（2026-08-09）**：[`.dockerignore`](../../.dockerignore) 排除 `local-courses/`、SQLite、备份和环境文件；[cloud-clean-room CI 作业](../../.github/workflows/quality.yml) 构建无素材镜像并扫描边界，再冒烟健康检查、云端搜索和上游课程。本地 Docker 实测使用 `code/docker/Dockerfile` 构建 `agent-learning-hub:docs-verify`，镜像内无 `local-courses`、SQLite、`.data` 或报告目录；以隔离 Cloud Compose 项目启动后只挂载状态卷，健康接口与九条公开路由通过，云端搜索无 `LOCAL-CHAPTER`/本地阅读路由。

### - [x] T3.4 增加内容政策与贡献页面

**依赖**：T2.3、T3.2  
**规格**：CAT-005、CAT-006、RES-002、PRIV-003

- 说明第三方资料归属、上游链接、许可证状态和云端不转载策略。
- 说明通过 Issue/PR 推荐或修正内容的流程。
- 不提供在线 CMS 或投稿表单。

**完成证据**：每个第三方导览页可到达统一内容政策。

**实施证据（2026-08-09）**：[内容政策页](../../code/app/content-policy/page.tsx) 与 [贡献指南页](../../code/app/contribute/page.tsx) 已加入全局页脚；课程导览、HTTP 冒烟和浏览器走查均可到达统一政策入口。

**Phase 3 退出条件**：删除本地素材库后，云端仍可构建并完成全部公开流程。

## 7. Phase 4：身份与学习状态

### - [x] T4.1 建立 SQLite、迁移与数据访问层

**依赖**：T1.1、T0.3  
**规格**：STATE-010、STATE-011、OPS-001、OPS-002、DEPLOY-007、DEPLOY-012

- 配置 SQLite 稳定驱动和迁移工具。
- 创建身份、会话、进度、阶段任务、笔记、收藏和成果表。
- 建立用户隔离、唯一性、级联删除和合理字段上限。
- 在启用 WAL 前增加 SQLite 版本验证。

**完成证据**：全新数据库可迁移到最新版本；迁移和级联删除集成测试通过。

**实施证据（2026-08-09）**：[SQLite schema/migration](../../code/modules/learning-state/database.ts) 创建身份、会话、进度、任务、笔记、收藏和成果表，启用外键并在 WAL 前校验 SQLite 版本；[repository tests](../../code/modules/learning-state/repository.test.ts) 覆盖隔离、唯一性、重开持久化和级联删号；事务迁移、备份和恢复边界见 [plan.md 第 13.2 节](./plan.md#132-sqlite-备份与恢复)。

### - [x] T4.2 实现云端 GitHub 登录

**依赖**：T4.1  
**规格**：AUTH-001—AUTH-003、SEC-003、SEC-004、PRIV-001、PRIV-002

- 集成 Better Auth 和 GitHub OAuth。
- 只申请最低身份权限，保存最少身份字段。
- 通过 GitHub 稳定用户 ID 识别管理员。
- 配置安全 Cookie、回调校验、错误处理和登录频率限制。

**完成证据**：登录、退出、拒绝错误回调、会话过期和管理员判定测试通过。

**实施证据（2026-08-09）**：使用 Better Auth 1.6.26 和 Next catch-all route；[Better Auth 配置](../../code/modules/auth/better-auth.ts) 关闭账户自动关联，只申请 `read:user`，以 `github-${githubId}` 作为稳定用户 ID，并通过自定义 adapter 复用既有 `users/accounts/sessions` 表。adapter 丢弃 GitHub provider token，只写 SHA-256 session token hash；OAuth state 使用签名 cookie，云端 `/api/session` 为已认证用户签发双提交 CSRF cookie。[Better Auth 集成测试](../../code/modules/auth/better-auth.test.ts) 已覆盖 mock 登录、最低权限、身份/Token 最小化、有效会话、过期会话和登出；[adapter 测试](../../code/modules/auth/better-auth-adapter.test.ts) 覆盖数据库边界，[callback boundary 测试](../../code/modules/auth/better-auth-route.test.ts) 确认旧回调入口停用；登录入口仍受客户端地址限频。生产只需在 GitHub 应用中注册 `${BETTER_AUTH_URL}/api/auth/callback/github` 并提供部署密钥。

### - [x] T4.3 实现本地单用户身份

**依赖**：T4.1  
**规格**：AUTH-004、AUTH-005、DEPLOY-010、DEPLOY-013

- local 模式自动映射到固定本地用户。
- 默认仅绑定回环地址。
- 检测非回环监听与免登录组合并拒绝启动。

**完成证据**：本地免登录可用；不安全监听配置的负向测试通过。

**实施证据（2026-08-09）**：[Local auth](../../code/modules/auth/local-auth.ts) 固定映射 `local-user`，默认只接受回环绑定；[runtime tests](../../code/modules/runtime/runtime-config.test.ts) 覆盖非回环监听拒绝，Docker Local Mode 实测免登录健康、搜索、阅读和状态持久化。

### - [x] T4.4 实现进度与阅读位置

**依赖**：T4.1、T4.2、T4.3  
**规格**：STATE-001—STATE-004、STATE-009—STATE-011、READ-002、READ-003、AC-04

- 实现条目状态变更、任务勾选和阅读位置保存。
- 外部点击只开始条目，不自动完成。
- 支持用户主动完成和撤销完成。
- 建立继续阅读和最近活动查询。

**完成证据**：cloud/local 数据隔离、重启恢复和状态转换测试通过。

**实施证据（2026-08-09）**：[state repository](../../code/modules/learning-state/repository.ts)、[状态 API](../../code/app/api/state/route.ts) 和阅读控件支持开始、进行中、完成/撤销、任务勾选与阅读位置；数据库重开测试和 Docker 两容器同卷重启实测恢复位置 4321px，外部/打开动作不会自动完成条目。

### - [x] T4.5 实现收藏与私人笔记

**依赖**：T4.1、T4.2、T4.3  
**规格**：STATE-007、STATE-008、AUTH-006、AUTH-007、PRIV-004、SEC-002

- 实现收藏的创建与删除。
- 实现私人 Markdown 笔记的创建、编辑、删除和安全预览。
- 限制笔记大小和请求频率。
- 确保管理员接口和日志不泄露笔记正文。

**完成证据**：越权访问、恶意 Markdown、大小限制和并发更新测试通过。

**实施证据（2026-08-09）**：[笔记/收藏 repository](../../code/modules/learning-state/repository.ts) 以用户 ID 隔离并限制笔记 20,000 字符；[状态 API](../../code/app/api/state/route.ts) 统一 CSRF 校验，前端以 textarea 保存纯 Markdown、不执行 HTML；[rate limiter](../../code/modules/auth/rate-limit.ts) 对写请求按用户限流，repository/data route 测试覆盖隔离、大小和删除边界。

### - [x] T4.6 实现阶段成果与完成约束

**依赖**：T4.1、T4.4  
**规格**：STATE-005、STATE-006、AC-05

- 支持 GitHub 仓库、演示链接和 Markdown 总结三类成果。
- 校验 URL 类型和文本上限。
- 阶段完成前强制至少一条成果记录，并要求显式确认。

**完成证据**：有/无成果、无效链接、撤销完成和删除成果后的状态测试通过。

**实施证据（2026-08-09）**：阶段成果支持 repository/demo/reflection、HTTP(S) URL 和 20,000 字符总结；[stage outcome tests](../../code/modules/learning-state/repository.test.ts) 验证无成果不能确认、显式确认、删除后未完成，[状态 API](../../code/app/api/state/route.ts) 已接入面板。

### - [x] T4.7 实现学习面板

**依赖**：T4.4、T4.5、T4.6  
**规格**：PAGE-006、STATE-009、NFR-001

- 汇总继续阅读、阶段进度、收藏、笔记和成果。
- 空状态提供进入路线和课程目录的明确入口。
- 支持桌面和手机布局。

**完成证据**：新用户、部分学习和多阶段学习三类状态页面验收通过。

**实施证据（2026-08-09）**：[学习面板](../../code/app/components/learning-dashboard.tsx) 汇总继续阅读、任务、收藏、笔记和成果并提供空状态入口；Chrome 移动端走查验证任务勾选后统计从 0 变 1，阅读条目显示已保存位置，390px 页面无横向溢出。

### - [x] T4.8 实现数据导出与删除账户

**依赖**：T4.1、T4.2、T4.5、T4.6  
**规格**：DATA-001—DATA-006、AC-06

- 导出个人数据为 JSON，并以可复用 Markdown 形式提供笔记。
- 排除 Token、会话密钥和其他用户数据。
- 删除账户采用明确的二次确认并级联删除个人记录。
- 删除后使现有会话失效。

**完成证据**：导出内容快照、跨用户隔离和完整删号集成测试通过。

**实施证据（2026-08-09）**：[data export](../../code/modules/learning-state/data-export.ts) 输出个人 JSON/笔记 Markdown 且排除 token、session/account secret；[data route](../../code/app/api/data/route.ts) 要求 CSRF 与 `DELETE MY ACCOUNT` 二次确认并级联删号；HTTP E2E 已验证导出内容和删除后状态为空。

**Phase 4 退出条件**：云端用户跨会话、本地用户跨重启均可恢复完整学习状态，并可导出或删除个人数据。

## 8. Phase 5：本地 Docker 与阅读器

### - [x] T5.1 实现安全本地文件访问层

**依赖**：T3.1  
**规格**：RES-008、RES-009、READ-007、READ-008、SEC-001、AC-03

- 只接受内容目录白名单中的相对路径。
- 使用规范化后的真实路径验证文件与图片仍位于挂载根目录。
- 拒绝路径穿越、绝对路径、空字节和符号链接逃逸。
- 文件访问层保持只读。

**完成证据**：路径安全测试集覆盖正常、编码变体和符号链接攻击。

**实施证据（2026-08-09）**：[Local File Access](../../code/modules/content-resolver/local-file-access.ts) 只提供解析与只读文本读取；[测试](../../code/modules/content-resolver/local-file-access.test.ts) 覆盖相对路径、缺失文件、单/双重编码、绝对路径、反斜杠、空字节、`.`/`..` 和逃逸符号链接，13 项全部通过。

### - [x] T5.2 实现 Local Adapter

**依赖**：T3.1、T5.1  
**规格**：RES-005—RES-010、AC-02

- 本地白名单文件存在时返回站内阅读地址。
- 缺失时回退上游链接，无上游时返回不可用原因。
- 不让调用方感知具体挂载路径。

**完成证据**：存在、缺失、无上游、非法路径和断网场景测试通过。

**实施证据（2026-08-09）**：[Local Adapter](../../code/modules/content-resolver/content-resolver.ts) 已由运行模式选择；[测试](../../code/modules/content-resolver/local-content-resolver.test.ts) 覆盖本地命中、缺失回退上游、无上游、owned/upstream-only 和非法路径。local 模式浏览器走查验证 `Hello-Agents` 导览显示“在站内阅读（本地）”并成功读取本地正文。

### - [x] T5.3 扩展本地阅读器

**依赖**：T2.5、T5.1、T5.2  
**规格**：READ-001—READ-008、AC-02、AC-03

- 读取本地 Markdown/MDX、图片和章节导航。
- 不执行本地 MDX JavaScript。
- 无法安全渲染时提供源码视图与上游链接。
- 接入阅读位置恢复。

**完成证据**：选取不同本地课程格式建立兼容性测试样本并通过验收。

**实施证据（2026-08-09）**：[local document source](../../code/modules/reader/document-source.ts) 读取白名单 Markdown/MDX/Markdown、图片和章节导航，拒绝 PDF/非白名单章节；[local image route](../../code/app/api/local-image/route.ts) 只服务允许引用的图片。无法安全渲染的 allowlisted 文本文件提供纯文本源码视图和上游链接，二进制/过大文件不会被转成 HTML；真实本地章节浏览、移动端目录和位置恢复均已通过；MDX 作为 Markdown 安全渲染，不执行 JavaScript。

### - [x] T5.4 创建 Docker 与 Compose 配置

**依赖**：T3.3、T4.3、T5.2  
**规格**：DEPLOY-001—DEPLOY-005、DEPLOY-010—DEPLOY-015

- 建立多阶段 Dockerfile。
- 创建基础、cloud 和 local Compose 配置。
- local 配置只读挂载素材库，持久化 SQLite，只绑定 `127.0.0.1`。
- 添加存活和就绪健康检查。

**完成证据**：新机器按照文档可一条命令启动 local 模式；容器重建后状态保留。

**实施证据（2026-08-09）**：[Dockerfile](../../code/docker/Dockerfile)、[基础 Compose](../../code/docker/docker-compose.yml)、[Cloud override](../../code/docker/docker-compose.cloud.yml)、[Local override](../../code/docker/docker-compose.local.yml) 和 [部署辅助脚本](../../code/scripts/docker-deploy.sh) 已加入；脚本统一构造 Docker Compose 配置、Local/Cloud/Release 模式和健康检查。隔离 Local Compose 实测构建、健康接口、九路由 HTTP 冒烟和学习状态 HTTP E2E 均通过；`local-courses` bind mount 为 `rw=false`，写入位置 `778` 在容器重启后仍可读取，SQLite 位于命名卷。隔离 Cloud Compose 同样健康且不挂载 Local Material。镜像边界、卷、备份与升级/回滚约定见 [plan.md 第 13.4 节](./plan.md#134-部署容器与数据库运维)。

### - [x] T5.5 建立本地离线验收

**依赖**：T5.3、T5.4  
**规格**：DEPLOY-014、AC-02

- 断网启动本地服务。
- 验证已挂载内容的路线、搜索占位、阅读和学习状态。
- 对需要上游网页的条目显示明确离线提示。

**完成证据**：离线端到端测试记录及已知不支持格式清单。

**实施证据（2026-08-09）**：Docker `--network none` 实测 Local Mode 仍可启动并完成 `/api/health`、本地白名单搜索和本地章节阅读；不支持格式由 reader fallback 明确提示，需上游的条目保留回退状态。

**Phase 5 退出条件**：本地 Docker 覆盖现有阅读器核心能力，无需 GitHub 登录且素材目录保持只读。

## 9. Phase 6：搜索与素材新鲜度

### - [x] T6.1 实现统一搜索索引模型

**依赖**：T1.3、T3.1  
**规格**：SEARCH-001、SEARCH-004、SEARCH-005、SEARCH-007

- 为阶段、课程、自有正文和项目内容建立索引文档。
- 搜索结果接入 resolver，显示访问类型。
- 明确排除私人笔记正文。

**完成证据**：索引内容快照和隐私负向测试通过。

**实施证据（2026-08-09）**：[search index](../../code/modules/search/search-index.ts) 统一阶段、条目、项目和本地章节文档，并由 resolver 标注访问方式；[search tests](../../code/modules/search/search-index.test.ts) 验证自有正文可搜且私人笔记正文永不进入索引。

### - [x] T6.2 实现云端搜索

**依赖**：T6.1、T3.2  
**规格**：SEARCH-001、SEARCH-004—SEARCH-006

- 支持标题、摘要、目标、标签和自有正文搜索。
- 支持阶段、轨道和访问类型过滤。
- 提供无结果和索引不可用状态。

**完成证据**：相关性样例、筛选组合和公开页面端到端测试通过。

**实施证据（2026-08-09）**：[搜索页](../../code/app/search/page.tsx) 支持标题/摘要/目标/标签/自有正文、阶段/轨道/访问方式过滤和空结果；Cloud HTTP smoke 与 Docker clean-room 实测无本地章节，Chrome 搜索 `agent` 返回公开索引且移动 Lighthouse 四项 100。

### - [x] T6.3 实现本地白名单章节索引

**依赖**：T5.1、T6.1  
**规格**：SEARCH-002、SEARCH-003、SEARCH-006、DEPLOY-014

- 仅索引内容目录明确引用的本地章节。
- 不递归扫描整个素材库。
- 处理文件新增、删除、更新和无法解析状态。

**完成证据**：索引边界测试证明未收录白名单外文件；断网搜索可用。

**实施证据（2026-08-09）**：`buildRuntimeSearchIndex` 只通过 catalog `localPath`/`references` 调用 [白名单章节读取](../../code/modules/reader/document-source.ts)，不递归扫描素材根；本地浏览器搜索 `agent` 返回 619 项、431 个章节链接，`--network none` Docker 搜索仍可用。

### - [x] T6.4 实现 `materials check`

**依赖**：T0.1  
**规格**：MAT-001—MAT-003、MAT-008、MAT-009

- 只获取并比较 Git 状态，不修改工作区。
- 区分最新、落后、分叉、本地修改和检查失败。
- 输出素材状态 JSON 快照及人类可读摘要。

**完成证据**：使用干净、落后、分叉和 dirty fixtures 验证分类准确。

**实施证据（2026-08-09）**：[freshness checker](../../code/modules/freshness/materials-check.ts) 与 [materials CLI](../../code/scripts/materials.ts) 只调用 `git status`、分支和 `rev-list`，绝不 pull/修改工作区；测试覆盖 latest/behind/ahead/diverged/dirty/check-failed、嵌套仓库发现和非 Git 引用跳过。真实运行扫描 56 个仓库：latest 44、behind 3、diverged 2、dirty 7，另有 5 组非 Git 文档引用明确跳过。

### - [x] T6.5 实现单课程安全更新

**依赖**：T6.4  
**规格**：MAT-004—MAT-009、AC-07

- 命令只接受内容目录中存在的课程 ID。
- 每次只更新一个仓库，只允许 fast-forward。
- dirty、分叉、未知上游和检查失败时拒绝更新。
- 不提供批量无确认更新。

**完成证据**：三个位于基线 dirty 清单中的仓库会被明确拒绝；所有负向测试不改变工作区。

**实施证据（2026-08-09）**：[safe update](../../code/modules/freshness/materials-check.ts) 只允许 clean、behind 且可 fast-forward 的单仓库执行 `git pull --ff-only`；CLI 要求一个已知 catalog ID 和显式 `--yes`，拒绝 dirty/diverged/no-Git。测试覆盖拒绝时不调用 pull；真实运行 `legacy-course-029`（AutoGPT dirty）返回非零并明确拒绝，工作区未改变。

### - [x] T6.6 实现路径审计与重新索引编排

**依赖**：T1.5、T6.3、T6.5  
**规格**：MAT-002、MAT-007、SEARCH-006

- 更新成功后自动运行内容/路径审计。
- 审计成功后刷新受影响索引；失败时保留旧索引并报告。
- 支持显式 `materials audit` 和 `materials reindex`。

**完成证据**：成功、审计失败和索引失败三种流程均有可恢复结果。

**实施证据（2026-08-09）**：`materials update` 成功后自动执行 Local 内容/路径审计，审计通过才构建索引；[materials CLI](../../code/scripts/materials.ts) 另提供 `materials audit` 与 `materials reindex`，重新索引写入不含正文的机器快照，正文索引仍由应用按当前 catalog/白名单在请求边界构建。真实 `materials reindex` 生成 1091 项（stage 9、item 515、project 20、local-chapter 547），快照确认不含 `text` 字段；审计失败或构建失败发生在写入前，旧快照保持不变。

### - [x] T6.7 实现管理员健康页面

**依赖**：T4.2、T1.5、T6.4、T6.6  
**规格**：ADMIN-001—ADMIN-006、AUTH-007

- 展示内容审计、素材状态、失效链接、数据库、备份和部署版本摘要。
- 只读取状态，不从网站触发 Git 更新。
- 隐藏绝对路径、秘密和私人笔记正文。

**完成证据**：管理员/普通用户权限测试及敏感信息快照检查通过。

**实施证据（2026-08-09）**：[admin health boundary](../../code/modules/admin/admin-health.ts) 通过 GitHub 稳定 ID 白名单区分管理员，匿名/普通用户返回 401/403，健康摘要只返回内容审计、素材状态、数据库、备份和部署的聚合字段，不包含绝对路径、Token 或笔记正文；[管理员页面](../../code/app/admin/page.tsx) 和 `/api/admin/health` 只读展示。Cloud Mode 已用临时管理员会话完成 API、页面和 POST 405 端到端走查，未挂载本地素材时明确显示 not-mounted。

**Phase 6 退出条件**：搜索覆盖策展内容；素材变化可发现、选择性更新、审计并重建索引，且不会覆盖本地改动。

## 10. Phase 7：交付、部署与运维

### - [ ] T7.1 完善 CI 流程

**依赖**：T3.3、T4.8、T5.5、T6.7  
**规格**：NFR-006、NFR-007、DEPLOY-002

- 执行 schema/引用审计、类型、格式、单元、集成、端到端和生产构建。
- 分别验证 cloud-clean-room 与 local fixtures。
- 扫描依赖、秘密和镜像内容边界。

**完成证据**：受保护分支所需检查全部稳定通过。

**当前进展（2026-08-09）**：[quality workflow](../../.github/workflows/quality.yml) 已加入 cloud/local 生产构建后的 HTTP 冒烟、cloud clean-room 镜像边界、依赖审计和明显凭据模式检查；本地已完成对应命令验证，但尚未在受保护分支上运行并确认全部 GitHub Actions 检查稳定通过，因此保留未勾选。

**本机补充验证（2026-08-11）**：`npm run check:cloud --prefix code` 与
`npm run check:local --prefix code` 均通过（123 个 Vitest、11 个 Node 工具测试、内容审计和
生产构建）；新增 [浏览器验收脚本](../../code/tests/e2e/browser-acceptance.mjs) 并完成
Cloud/Local 生产服务器走查。受保护分支的真实 Actions 结果仍未取得，因此不勾选。

**本机续测（2026-08-11）**：按 `cloud-clean-room` 作业规则构建当前镜像，边界扫描确认不含
Local Material、SQLite、备份、`.env` 或运行时测试凭据；容器健康、9 条公开路由和 Chrome
Cloud `full` 均通过。远端受保护分支结果仍未取得，故 T7.1 保持未勾选。

### - [ ] T7.2 建立版本化镜像发布

**依赖**：T5.4、T7.1  
**规格**：DEPLOY-002、DEPLOY-005

- 对版本标签构建并发布不可变镜像。
- 生成构建来源、提交 SHA 和变更说明。
- 禁止生产 Compose 默认跟随 `latest`。

**完成证据**：指定版本可拉取、启动，并可回退到上一个版本。

**当前进展（2026-08-09）**：[release workflow](../../.github/workflows/release.yml) 已按 `vX.Y.Z` 标签发布 GHCR 镜像、长 SHA 标签、SBOM 和构建来源证明；[release Compose override](../../code/docker/docker-compose.release.yml) 清除本地 build 配置并强制要求版本或 digest。尚未从实际 GHCR 拉取镜像并完成回退演练，因此保留未勾选。

### - [ ] T7.3 编写云端部署和回滚流程

**依赖**：T7.2  
**规格**：DEPLOY-004—DEPLOY-009、OPS-005

- 文档化反向代理、HTTPS、OAuth 回调、持久化卷、环境变量和健康检查。
- 升级前备份，升级后执行迁移和冒烟测试。
- 定义失败时应用版本和数据库的恢复步骤。

**完成证据**：从空服务器部署指定版本并完成一次受控回滚演练。

**当前进展（2026-08-09）**：[plan.md 第 13.4 节](./plan.md#134-部署容器与数据库运维) 已补充版本镜像、配置解析、备份前置、健康/冒烟检查、OAuth callback、迁移和回滚边界；本地 `docker compose config` 已验证 release override 不再保留 build。尚未在空服务器、反向代理和 HTTPS 环境完成受控部署/回滚，因此保留未勾选。

**文档与自动化进展（2026-08-11）**：新增[部署与运维入口](../deploy/README.md)、[完全手工生产部署 Runbook](../deploy/production-manual.md) 和 [Lighthouse 自动化 Runbook](../deploy/lighthouse-automation.md)；[Lighthouse 本地脚本](../../code/scripts/lighthouse-deploy.sh) 通过 `ssh tencent-lighthouse` 提供只读预检、Ubuntu 初始化、root-only 秘密上传、升级前原生加密 SQLite 备份、固定镜像部署、Caddy HTTPS、健康验证与应用回滚，并明确把腾讯云防火墙、DNS、快照、异地副本和数据库恢复保留为独立控制面/运维动作。真实 Lighthouse 尚未执行，故 T7.3 仍不勾选。

### - [ ] T7.4 实现 SQLite 备份与保留策略

**依赖**：T4.1  
**规格**：OPS-001—OPS-006、AC-09

- 使用一致性备份方式处理 WAL 数据库。
- 加密并复制到服务器外存储。
- 自动执行 7 个每日、3 个每周保留策略。
- 记录成功、失败、大小、校验和及最近恢复验证时间。

**完成证据**：备份任务、失败告警和保留清理测试通过。

**当前进展（2026-08-11）**：[backup module](../../code/modules/learning-state/backup.ts) 已提供 SQLite 一致性快照、AES-256-GCM 加密、SHA-256 manifest、7 个 daily/3 个 weekly 保留和 `quick_check` 恢复验证；`npm run db:backup --prefix code` 与 `npm run db:restore --prefix code` CLI 已完成成功/失败集成测试。管理员摘要会核对备份文件大小与 SHA-256，并只返回保留数量、时间、大小和状态；不可写输出目录与错误口令均触发匿名 critical 告警。定时调度、服务器外复制和正式恢复演练仍未完成，因此保留未勾选。

### - [ ] T7.5 执行干净环境恢复演练

**依赖**：T7.4、T7.3  
**规格**：OPS-006、AC-09

- 在干净环境恢复备份。
- 运行数据库完整性检查、迁移状态检查和应用冒烟测试。
- 验证用户关联、进度、笔记、收藏和成果。

**完成证据**：保存带日期、版本、耗时和结果的恢复演练记录。

**当前进展（2026-08-09）**：自动化恢复命令和单元测试已验证解密、目标文件防覆盖及 SQLite 完整性检查；尚未在部署环境执行并提交带版本、耗时和结果的正式演练记录。

**本机补充验证（2026-08-11）**：[本机端到端验收报告](../acceptance/local-e2e-2026-08-11.md)
记录了隔离 SQLite 的加密备份、空目标恢复、SHA-256/`quick_check` 验证以及恢复副本上的
浏览器状态、导出和删号回归。它不是空服务器/固定发布镜像的正式恢复演练，故不勾选。

### - [ ] T7.6 建立隐私优先监控

**依赖**：T6.7、T7.3  
**规格**：ADMIN-003—ADMIN-006、NFR-008、SEC-005、PRIV-003

- 记录请求错误、登录失败、数据库健康、备份、审计和更新结果。
- 仅保留不关联个人身份的访问汇总。
- 增加日志脱敏测试和告警规则。
- 运营聚合只能记录固定枚举的事件、范围、结果、计数和最后发生时间；不得写入用户
  ID、IP、Cookie、查询参数、路径参数、错误原文、笔记正文或秘密，并须设置有限保留期。

**完成证据**：故障注入可触发预期告警，日志抽查不含秘密和笔记正文。

**当前进展（2026-08-11）**：已新增 `operational_metrics` schema version 2、
`observability/` 模块、页面匿名聚合路由和管理员聚合摘要；按小时写入固定枚举的事件、范围、
结果、计数和最后发生时间，30 天后清理。页面浏览、健康检查、状态/数据 API 错误和登录失败
已经接入；备份、恢复、内容审计和素材更新 CLI 也会输出固定枚举日志并按配置写入同一聚合库。
单元/集成测试覆盖聚合、脱敏、失败阈值、不可写备份目录、错误恢复口令、拒绝素材更新、跨代理
同源校验和未知路径拒绝，故障注入可产生预期 critical/warning。管理员页面新增加密备份健康卡。
外部日志收集与通知仍须由部署平台接入，且 T7.3 依赖未完成，因此 T7.6 保持未勾选。

### - [ ] T7.7 同步项目文档与运行手册

**依赖**：T5.4、T6.6、T7.3  
**规格**：IA-005、DEPLOY-001、MAT-002

- 重写根 `README.md`：定位、双模式、九阶段、快速启动、架构、隐私和贡献。
- 同步根 `AGENTS.md`、`CONTEXT.md` 以及 `docs/plans/`，使目录、脚本、运行模式和实现证据指向 `code/`。
- 重写 `local-courses/README.md`：本地属性、归属、清单、检查/更新/审计/索引和存储建议。
- 删除原维护者身份信息；保留第三方作者、许可证和上游地址。
- 数量引用改为脚本生成片段或报告链接。
- 合并不再独立维护的专题说明，保留机器可读边界和唯一事实源。

**完成证据**：新用户仅依据 README 可完成 cloud/local 启动；归属抽查通过。

**当前进展（2026-08-09）**：已同步根 [README](../../README.md)、[AGENTS](../../AGENTS.md)、[CONTEXT](../../CONTEXT.md)、[产品方案](./plan.md)、[产品规格](./spec.md)、本任务清单和 [local-courses README](../../local-courses/README.md)，统一指向 `code/`、Docker 双模式、Better Auth、内容归属、素材 check/audit/reindex/update、数据库操作和生成式报告；删除旧维护者身份与手工素材数量。`content-boundaries.md`、`content-model.md`、`database-operations.md`、`deployment.md` 和 `requirements-traceability.md` 已合并到方案/任务事实源，机器可读 `content-boundaries.json` 保留。文档命令已通过 Prettier 检查，Docker release Compose 已通过 `docker compose config`；T7.3 的真实部署演练尚未完成，故保留未勾选。

**本机补充验证（2026-08-11）**：新增根 [Prompt.md](../../Prompt.md) 作为可复用端到端
验收提示词，并更新方案目录、隐私监控和本次验收证据链接；仍等待真实部署/回滚证据，故不勾选。

**生产 Runbook 补充（2026-08-11）**：[`docs/deploy/`](../deploy/README.md) 已补充手工和 Lighthouse 自动化入口，并将命令映射到现有 Compose、固定发布镜像、OAuth、稳定 SQLite 卷、原生备份与恢复工具；文档和脚本静态验证不能替代空服务器 HTTPS、真实 OAuth、异地备份、恢复与回滚演练，因此 T7.7 仍不勾选。

**Phase 7 退出条件**：指定版本可从空服务器部署、监控、备份、恢复和回滚；本地用户也有完整启动文档。

## 11. Phase 8：功能对等与正式切换

### - [x] T8.1 执行新旧站功能对照

**依赖**：T2.5、T4.7、T5.5、T6.3  
**规格**：AC-10

- 对照 T0.1 基线检查路线、课程目录、进度、主题参考和阅读器能力。
- 将缺失项分类为必须补齐、明确取消或后续增强。
- 所有首版必需项必须在切换前关闭。

**完成证据**：评审通过的功能对照表，无未决定的阻断项。

**实施证据（2026-08-09）**：[legacy parity review](../acceptance/legacy-parity-2026-08-09.md) 对照 T0.1 基线报告的七项旧站能力，逐项映射到新站路由、模块测试、HTTP 冒烟和移动端浏览器证据；首版范围内无静默删除项。旧站仍按 T8.5 作为只读迁移基线保留，生产切换不在本任务中提前完成。

### - [ ] T8.2 执行双模式端到端验收

**依赖**：T7.1、T8.1  
**规格**：AC-01—AC-10

- cloud：匿名浏览、第三方跳转、GitHub 登录、学习状态、导出和删号。
- local：免登录、只读素材、阅读、搜索、回退、离线和状态持久化。
- 共用：稳定课程 ID、页面链接、内容 schema 和学习状态规则。

**完成证据**：双模式验收报告覆盖全部十个 AC 场景。

**当前进展（2026-08-09）**：[dual-mode E2E acceptance](../acceptance/dual-mode-e2e-2026-08-09.md) 已覆盖全部十个 AC，并区分了本地应用级验证与仍需部署环境的证据；Local/Cloud 生产 HTTP 冒烟、Local 学习状态生命周期和移动端流程已通过。真实 GitHub 登录跨会话恢复、干净镜像运行、生产备份恢复与版本回滚尚未完成，故保留未勾选。

**本机补充验证（2026-08-11）**：[本机端到端验收报告](../acceptance/local-e2e-2026-08-11.md)
新增 Cloud 匿名、Local seed/resume/fallback/mobile、HTTP E2E、加密备份恢复和浏览器控制台
证据。Docker 重试中，隔离 Local Compose 的镜像内 `npm ci` 在 71.3 秒完成，健康检查、Chrome
状态跨 `local down`/`local up` 恢复以及 Local HTTP E2E 均通过，故 Local Docker 阻塞已解除。
Cloud clean-room 当前镜像的边界、健康、HTTP 和 Chrome `full` 已补测通过。真实 GitHub 两用户
登录、服务器部署/恢复/回滚仍未完成，故 T8.2 保持未勾选。

### - [x] T8.3 执行移动端与无障碍验收

**依赖**：T2.1、T4.7、T5.3、T6.2  
**规格**：PAGE-008、NFR-001—NFR-005、AC-08

- 在常见手机宽度完成路线、搜索、阅读、笔记和成果流程。
- 检查键盘导航、焦点、控件标签、标题结构、颜色对比和错误提示。

**完成证据**：移动端截图/录屏和无障碍问题清单；阻断级问题为零。

**实施证据（2026-08-09）**：[mobile/accessibility acceptance](../acceptance/mobile-accessibility-2026-08-09.md) 在 Chrome 390×844 视口完成路线、搜索、长文阅读、笔记、阶段成果和键盘焦点走查；初次发现的表单标识、对比度和触控尺寸问题已修复。最终搜索/学习面板 Lighthouse 四类均为 100，控制台无错误，横向溢出为零。

### - [ ] T8.4 执行安全与隐私发布审查

**依赖**：T8.2、T8.3  
**规格**：AUTH-005—AUTH-007、SEC-001—SEC-005、PRIV-001—PRIV-004

- 复测越权、CSRF、路径穿越、恶意 Markdown、URL 校验和频率限制。
- 检查构建产物、镜像、日志、导出文件和管理员页面的敏感信息。
- 确认云端无第三方正文和本地路径泄漏。

**完成证据**：发布安全检查表完成，无未接受的高风险问题。

**当前进展（2026-08-11）**：Cloud/Local 全质量门禁、内容边界审计、导出脱敏、CSRF、
路径穿越/符号链接、恶意 Markdown、频率限制和管理员边界测试均通过；生产依赖
`npm audit --omit=dev --audit-level=high` 报告 0 vulnerabilities。当前 Cloud clean-room 镜像
已确认不含 Local Material、SQLite、备份、`.env` 或运行时测试凭据；真实部署日志仍未完成
复查，且 T8.2 依赖未完成，故 T8.4 保持未勾选。

### - [ ] T8.5 切换仓库入口并归档旧站

**依赖**：T7.5、T7.7、T8.4  
**规格**：AC-09、AC-10

- 将根 README、默认启动和部署入口切换到新应用。
- 保留 `learning-site/` 作为只读迁移归档，不再独立演进。
- 发布固定版本并记录回滚版本。
- 观察首轮健康、登录、数据库、备份和内容错误。

**完成证据**：生产冒烟测试通过；回滚路径已验证；旧站归档说明清晰。

### - [x] T8.6 执行全站 UI 走查并修复缺陷

**依赖**：T2.1—T2.5、T4.7、T6.2
**规格**：PAGE-007、PAGE-009—PAGE-012、READ-009—READ-011、NFR-009、NFR-010

- 在 Cloud 与 Local 两种模式、desktop/tablet/mobile 三档视口遍历全部公开路由并抓取全页截图。
- 记录布局缺陷、数据泄漏到界面的问题和功能缺口，逐条修复。
- 把一次性走查沉淀为可重复执行的脚本，并写出面向使用者的使用指南。

**完成证据**：两种模式三档视口零 finding；双模式质量门禁通过；`GUIDE.md` 覆盖模式差异、页面用法和走查命令。

**实施证据（2026-08-11）**：走查覆盖 20 条路由，修复分为四类。

_功能缺陷_

1. **开发服务在 `127.0.0.1` 无法 hydration**——`next dev` 对未列入 `allowedDevOrigins` 的来源返回 403，客户端 bundle 加载失败，"我的学习"永远停在加载态、勾选与收藏无响应；而运行手册和 `local-preview.sh` 给出的正是这个地址。修复：[next.config.ts](../../code/next.config.ts) 列入三种回环写法。（NFR-009）
2. **阅读器把第三方 HTML 转义成可见文本**——原实现检测到 HTML 后调用 `removeEventAttributes`，但随即被 `renderInline` 全量转义，清理逻辑实际未生效；Hello-Agents README 首屏是一整屏尖括号，`&emsp;` 显示为字面量。改为标签/属性 allowlist 通过，并补齐 GFM 表格、分隔线、嵌套列表和任务项。见 [markdown.ts](../../code/modules/reader/markdown.ts)、[markdown.test.ts](../../code/modules/reader/markdown.test.ts)（7 个用例，含注入负向测试）。（READ-009）
3. **目录与搜索不分页**——`/courses` 单页渲染 515 条、高 55,012px，且对每条都调用一次 resolver。新增 [pagination.tsx](../../code/app/components/pagination.tsx)，每页 24 条且只解析当前页；页面高度降到 2,753px。（PAGE-009）
4. **学习面板显示任务 ID**——27 行显示 `stage-0-task-1` 而非任务标题。改为按阶段分组并传入真实标题。（见 [learning/page.tsx](../../code/app/learning/page.tsx)）
5. **课程详情丢失 `references`**——条目声明的本地 README、章节和 GitHub 地址一条都没渲染，现补充"相关入口"区块。

_数据泄漏到界面_

6. schema 枚举（`local-preferred`、`third-party`）、导入占位值 `Unknown` 和内部标签 `legacy-reading` 直接显示给用户；统一收敛到 [content-card.tsx](../../code/app/components/content-card.tsx) 的标签函数。（PAGE-011）
7. 首页概览显示"课程条目 515 / 站内文章 1 / 上游导览 1"，占比 99% 的本地素材没有分项，读起来像算错；补上"本地素材"一项后四数自洽。（PAGE-012）
8. 阅读位置显示"已保存位置 0px"，改为保存时间加可读描述。

_版式与冗余_

9. 窄屏下主导航整体 `display: none` 且无替代，移动端没有任何站内导航；新增 `.compact-nav` 横向滚动条并把断点提前到 860px。（PAGE-010）
10. 标题 `line-height: 0.98` 使中文字形上下相碰；提高到 1.16/1.22 并补 CJK 衬线回退。
11. 阅读器右侧整列留空、目录不跟随；改为两栏并让目录 sticky。（READ-011）
12. 阶段页三栏中 LEARNING GOALS、PRACTICE TASKS 和"维护者提示"渲染同一批字符串，任务标题与摘要也完全相同；改为去重后渲染，阶段进度条 `00 — 09` 的越界上限改为按实际阶段数计算。
13. 项目阶梯把 11 个练习项目和 9 个阶段成果混在一条 20 行列表里，后者标题是占位符 "Stage 0"；拆成 OPEN LADDER 与 STAGE GATES 两段，阶段项改用阶段标题。
14. 卡片 `min-height: 300px` 在正文与标签间留出大片空洞；改为内容驱动高度加三行截断。

_沉淀_

新增 [ui-review.mjs](../../code/scripts/ui-review.mjs)（`npm run audit:ui`）：三档视口全页截图，对 HTTP 错误、横向溢出、页面高度超 12,000px 和控制台报错非零退出。修复后 Cloud 与 Local 各 51 次抓取、0 finding，产物见 `code/reports/ui-review/` 与 `code/reports/ui-review-cloud/`。`npm run check:cloud` 与 `npm run check:local` 均通过（127 单元测试）。使用指南见 [GUIDE.md](../../GUIDE.md)。（NFR-010）

**已知遗留（不在本任务范围）**：

- `/admin` 在 Local Mode 返回 404——`isAdminUser` 要求 `mode === "cloud"`，本地固定单用户不满足。这是既有身份边界，改动需先立 ADR；已在 [plan.md](plan.md) 4.2 记录现状与本地替代手段。
- 514 条导入条目中 496 条没有 `stageIds`，全部 `author`/`license` 为 `Unknown`，阶段任务的 `summary` 与标题重复。界面已如实呈现"待补"，但内容侧补齐属于内容维护任务。
- 项目成果的 `evidenceTypes` 全为空，"建议证据"改为仅在有值时渲染。

### - [x] T8.7 修复阅读器章节导航并建立点击式功能回归

**依赖**：T8.6
**规格**：READ-001、READ-012—READ-014、NFR-011

- 逐页真实点击，而不是只确认页面能打开。
- 修复走查暴露的交互缺陷。
- 把点击流程沉淀为可重复执行的双模式回归脚本。

**完成证据**：Local 20/20、Cloud 19/19 检查通过；站内链接零 404；双模式质量门禁通过。

**实施证据（2026-08-11）**：

_缺陷 1：正文内链全部 404。_ 阅读器把素材里的相对链接原样输出，浏览器按阅读器路由解析，`./docs/chapter1/第一章 初识智能体.md` 变成 `/read/docs/chapter1/…` 并 404。Hello-Agents README 的 16 章目录和"English"切换共 18 条链接全部是死链——正是"打开了第一章却点不到下一章"的现象。新增 [resolveDocumentRelativePath()](../../code/modules/reader/document-source.ts) 按当前文档目录解析（解码百分号编码、剥离锚点与查询、拒绝走出素材根），命中允许章节的改写为站内地址，未命中的降级为纯文本。爬取 136 条站内链接，404 从 18 降到 0。

_缺陷 2：缺少上下章导航。_ READ-001 和 [plan.md](plan.md) 6.5 都要求"上下章"，实现却只有一个平铺章节列表。补上 `.reader-pager`，顺序取自 `listLocalChapters()`，首章无上一章、末章无下一章，并加 `rel="prev"/"next"`。

_缺陷 3：搜索结果泄漏原始枚举。_ T8.6 引入的标签映射漏了 `local-chapter`，且含四个并不存在的键。改为直接对 `SearchDocumentKind` 与 `SearchDocument["accessPolicy"]` 取值，新增枚举成员会在构建期报错而不是渲染成英文。

_沉淀：_ 新增 [functional-regression.mjs](../../code/scripts/functional-regression.mjs)（`npm run audit:functional`），20 项检查覆盖站内链接、主导航、路线下钻与首尾边界、翻页、筛选、空态、搜索、章节切换、上下章往返、正文内链、TOC 锚点、条目引用、收藏与任务勾选的写入—重载—撤销、笔记增删、数据导出。脚本读取模式徽标后分支断言：云端断言匿名访问被拒（面板不渲染、`/api/data` 401、匿名写入被拒）与本地素材不出正文，本地断言完整读写。脚本自身清理其创建的状态。

三项检查最初为 FAIL，其中两项是脚本自身缺陷而非产品缺陷，已一并修正：受控复选框需轮询等待写入往返（实测 138ms）而不能用 `check()` 同步断言；笔记列表在无笔记时不渲染，需等待其出现。同时把 `ui-review.mjs` 的页面高度预算改为按路由区分——长文阅读器的高度由内容决定，12,000px 预算只适用于列表页。

**最终结果**：Local `20/20`、Cloud `19/19`；两种模式 UI 走查各 51 次抓取 0 finding；`npm run check:cloud` 与 `npm run check:local` 通过（130 单元测试）。

### - [ ] T8.8 补齐本地课程的章节声明

**依赖**：T8.7
**规格**：READ-014、CAT 系列

- 逐课程策展 `references`，让主线课程在站内可读到完整章节。
- 排除文档站、i18n、示例目录等噪音，不做全量声明。
- 保持"允许章节由条目显式声明"这一边界不变。

**问题陈述（2026-08-11，T8.7 走查发现）**：512 个 `local-preferred` 条目合计只声明了 547 个 markdown 章节，而这些素材目录下共有约 17,030 个 md 文件；418 个条目声明数远低于实际可用数。表现为 Hello-Agents 这类主线教材在站内只能读到 2 章（README 与前言），其余 16 章虽然文件就在本地却无入口。

T8.7 之后代码行为已正确：已声明章节可读、可上下翻页，未声明的链接降级为纯文本而不是死链。**剩余工作纯属内容策展**，不涉及代码或安全边界。全量声明不可取——CrewAI 一个条目目录下就有 9,776 个 md 文件，多为文档站与 i18n，纳入会污染阅读器与搜索索引。

建议做法：为主线课程按命名规则（如 `docs/chapter*/*.md`）生成候选章节，人工确认后写入条目的 `references`；先覆盖少数旗舰课程，再逐步扩展。注意 `content/courses/legacy-import.json` 由 `npm run convert:legacy` 生成，策展结果需要有对应的保留策略，否则会被重新生成覆盖。

### - [x] T8.9 复查全站界面与交互并修复走查缺陷

**依赖**：T8.7
**规格**：PAGE-002、PAGE-011、PAGE-013—PAGE-019、SEARCH-008、SEARCH-009、READ-014、STATE-004、STATE-005、NFR-010、NFR-011

- 在两种模式下重跑版式走查与功能回归，并逐屏看截图，而不是只看脚本退出码。
- 修复自动化门槛看不见的设计与信息缺陷。
- 把每条修复沉淀为断言，使其不再依赖人工复看。

**完成证据**：Local 23/23、Cloud 22/22 检查通过；两种模式 UI 走查各 51 次抓取 0 finding；`npm run check:cloud` 与 `npm run check:local` 通过（132 单元测试）。

**实施证据（2026-08-12）**：

起点是两份"干净"的报告：T8.7 之后 `audit:ui` 51 抓取 0 finding、`audit:functional` 20/20 全过。下列六项缺陷全部落在这两个脚本的检测面之外，是逐屏看截图看出来的——这也说明版式脚本只覆盖 HTTP 状态、横向溢出、页面高度和控制台报错四类信号，"页面能打开且不溢出"与"页面说得通"是两回事。

_缺陷 1：本地模式搜索结果成对重复（最严重）。_ `agent` 一次查询返回 619 行，肉眼可见每个标题都紧挨着出现两遍：一行标"课程条目"指向 `/courses/<id>`，下一行标"本地章节"指向 `/read/<id>`。根因在导入形态与索引策略的交叉处：514 个条目里有 472 个是 `reading-chapter`——旧站把每个上游章节文件都升格成了独立条目，其唯一 reference 的 label 就是条目标题、localPath 就是条目自身的 localPath。`localChapterReferences()` 按路径去重后恰好剩一个与条目同名的章节，索引再为它单独产出一份 `local-chapter` 文档。改为按章节数分流：单章条目把正文并入条目自身的检索文本，多章条目（Hello-Agents 的 README + 前言）保留逐章结果。副作用是补上了一个空缺——此前只有 `owned` 条目的正文进索引，本地条目仅靠元数据可搜，现在单章条目的正文也可检索，因此结果数落到 478 而非折半的 310。

_缺陷 2：结果行整页塌成同一句占位文案。_ 每行标题下都写着"未关联路线阶段"，因为 515 条里只有 18 条挂了阶段。给 `SearchDocument` 增加 `summary`（条目取摘要、阶段取阶段摘要、章节取所属条目标题），有阶段时显示阶段，否则显示所属合集。顺带修掉阶段结果拿自己的阶段名当定位信息、把标题重复一遍的问题。

_缺陷 3：未知筛选值被当成筛选条件执行并回显。_ `/courses?tag=none` 把 515 条目录变成空网格，同时在结果计数旁边打印"标签：none"。轨道和访问方式早已按目录校验，标签与阶段没有。改为统一校验，不匹配即视为未传，且不带进分页链接。同一处修掉另一个规则违例：标签下拉列出了 `legacy-reading`、`local`、`featured` 这些导入记账标签，而 [AGENTS.md](../../AGENTS.md) 要求它们不出现在界面上——`displayTags()` 此前只管卡片，没管筛选选项。

_缺陷 4：筛选栏被最长的下拉挤变形。_ `.filter-bar` 用 flex 且 `label { min-width: 150px }`，标签下拉的选项文本最长，于是它撑到另外两个的三倍宽，把提交按钮压到"应用筛/选"、把"清除"压成竖排两字。tablet 档尤其明显。改成 `repeat(3, minmax(0, 1fr)) auto auto` 的网格，并给按钮与重置链接加 `white-space: nowrap`。

_缺陷 5：本地模式导航写着"登录"。_ Local Mode 由 `ensureLocalUser()` 自动签入，`/login` 页面本身就写着"你不需要登录"，导航却仍提示登录。改为随模式取值（Cloud"登录" / Local"账户"）。首次改成"本机账户"后 375px 窄屏的导航条把它裁成"本机"，遂缩短为"账户"，并给 `.compact-nav` 和窄屏路线图都加了右边缘淡出——两者都隐藏了滚动条，被裁掉的半个汉字读起来像渲染错误而不是"可以滑动"。九阶段路线在 375px 下只显示 3 站，此前没有任何提示说另外 6 站在右边。

_缺陷 6：不可撤销操作与导出同款样式。_ "删除账户"与"导出 JSON""导出笔记 Markdown"在同一列、同一字号同一颜色，读起来是同一类操作。加分隔线与独立配色；`window.confirm` 二次确认本来就有，保留。

_附带加固：_ 阅读器输出的 `<img>` 统一补 `loading="lazy"`、`decoding="async"`、`referrerpolicy="no-referrer"`。第三方 README 里的徽章与头像多为绝对地址，消毒后仍是绝对地址，请求照样从读者浏览器发往上游主机——Hello-Agents 一页就有几十张、全页高 17,140px。彻底禁止远程图片会改变第三方素材的呈现结果，属于内容政策变更，留待单独 ADR。

_版式收尾：_ 项目阶梯的 11 个练习项目都没有 `evidenceTypes`，却仍按三列布局预留了 190px 的证据列，右侧空了一整条；改为仅在确有证据时保留该列。阶段页"配套资料"因 T8.8 的内容缺口常年只有一张卡片挂在三列网格里，补一条"到课程目录找更多"的出口。

_缺陷 7：路线页没有任何完成情况，PAGE-002 长期未满足。_ PAGE-002 要求路线页显示"九阶段顺序、阶段目标、**完成情况**和轨道分布"，实现只给了静态计数（3 个动作 / 2 项精选阅读 / 1 个验收产物）。数据一直都在——`stage_task_progress` 和 `stage_outcomes` 都已落库，"我的学习"也早就在用——只是从没接到主线上：读者必须离开路线页才能知道自己走到哪。同一处还有一个错位：阶段页把实践动作列出来让人照着做，勾选却只能去仪表盘完成，等于要求用户离开正在工作的页面去别处记录刚做完的事。

新增 [stage-progress.tsx](../../code/app/components/stage-progress.tsx)：`StageProgressProvider` 包住服务端渲染的子树并**只取一次** `/api/state` 快照，`StageProgressBadge`（路线页九行）与 `StageTaskChecklist`（阶段页）从 context 读，避免九行各发一次请求。勾选走乐观更新，响应回来的快照覆盖本地值，写入被拒时自身纠正。

刻意保留的边界：徽标区分四态，动作全勾完只显示"动作已做完 · 待交成果"，只有 `stage_outcomes` 真有记录才显示绿色"已交成果"——STATE-005 把完成的判定权留给用户主动提交的成果，界面不替它下结论。未认证时徽标与勾选框整块不渲染，只留一句"登录后可以在这里直接勾选动作"；快照到达前也不渲染 `0/3`，否则已签入的读者会先看到一个凭空出现又消失的进度。

_沉淀：_ `audit:functional` 从 20 项增至 23 项（Cloud 22 项）。新增"搜索结果不重复"（按 href 而非标题判重——两个上游项目可以合法地各有一个 `AGENTS.md`，标题相同不等于重复）、"未知筛选值被忽略"（同时断言记账标签不出现在下拉里）、"阶段页勾选并在路线页体现"（勾选→重载→回路线页断言 `动作 0/3` → `动作 1/3`，然后复原），以及云端分支的"匿名阶段页保持只读"（0 个勾选框、0 个进度徽标，但动作照常可读且有说明文案）。原有的"空筛选组合有说明"一项在修复后转为 FAIL，因为它正是用 `tag=none` 制造空结果的——改用 `track=aicoding&access=unavailable` 这个真实为空的组合。搜索索引新增两项单测覆盖单章折叠与多章保留。

**最终结果**：Local `23/23`、Cloud `22/22`；两种模式 UI 走查各 51 次抓取 0 finding；`npm run check:cloud` 与 `npm run check:local` 均以 0 退出（132 单元测试）。

**Phase 8 退出条件**：所有上线门槛通过，新站成为仓库唯一推荐入口。

## 12. 上线门槛核对表

- [x] GATE-01 cloud-clean-room 构建和公开流程通过。（2026-08-11 隔离镜像实测）
- [x] GATE-02 local Docker 阅读、搜索和进度保存通过。（2026-08-11 隔离 Compose 实测）
- [x] GATE-03 云端与本地使用相同课程 ID、schema 和状态规则。（双模式同一构建与测试覆盖）
- [ ] GATE-04 登录、笔记、收藏、成果、导出和删号集成测试通过。
- [x] GATE-05 路径回退、穿越保护和恶意 Markdown 测试通过。
- [x] GATE-06 手机端核心学习流程通过。（见 T8.3 验收证据）
- [ ] GATE-07 SQLite 干净环境恢复演练通过。
- [x] GATE-08 新站覆盖旧站首版核心能力。（见 T8.1 对等报告）
- [x] GATE-09 云端镜像不含 `local-courses/`、数据库、备份或秘密。（2026-08-11 镜像扫描）
- [ ] GATE-10 部署、回滚、素材维护和故障恢复文档可由他人复现。

## 13. 需求到任务追踪

| 规格域      | 主要任务                                                        |
| ----------- | --------------------------------------------------------------- |
| IA / PAGE   | T1.2—T1.4、T2.1—T2.4、T4.7、T8.3、T8.6、T8.9                    |
| CAT         | T0.2、T1.2—T1.5、T3.4                                           |
| RES         | T3.1—T3.3、T5.1—T5.3                                            |
| READ        | T2.5、T4.4、T5.1、T5.3、T8.6、T8.7、T8.8、T8.9                  |
| AUTH        | T4.2、T4.3、T4.5、T6.7、T8.4                                    |
| STATE       | T4.1、T4.4—T4.8、T8.9                                           |
| SEARCH      | T6.1—T6.3、T6.6、T8.9                                           |
| MAT         | T6.4—T6.7                                                       |
| DATA        | T4.8                                                            |
| ADMIN       | T6.7、T7.6                                                      |
| DEPLOY      | T0.2、T3.3、T4.3、T5.4、T7.1—T7.3                               |
| SEC / PRIV  | T4.2、T4.5、T4.8、T5.1、T7.6、T8.4、T8.9                        |
| OPS         | T4.1、T7.3—T7.5                                                 |
| NFR         | T0.3、T2.1、T2.5、T7.1、T7.6、T8.3、T8.6、T8.7、T8.9            |
| AC-01—AC-10 | T3.3、T5.2、T5.1、T4.4、T4.6、T4.8、T6.5、T8.3、T7.5、T8.1—T8.2 |

## 14. 推荐首个实施批次

先完成以下任务，不提前进入登录、数据库或部署细节：

1. T0.1 固化仓库基线报告。
2. T0.2 建立内容归属与忽略规则。
3. T0.3 建立质量门禁。
4. T1.1 创建应用骨架。
5. T1.2 定义内容 schema。
6. T1.3 创建内容目录和 Catalog API。
7. T1.4 实现旧数据转换器。
8. T1.5 建立内容审计命令。

该批次完成后，应先评审转换差异和内容归属，再开始 Phase 2。
