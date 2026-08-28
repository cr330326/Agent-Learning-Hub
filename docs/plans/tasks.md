# Agent Learning Hub 实施任务清单

**状态**：实施中（核心产品功能、原生双模式验收和本地 Docker 正式镜像验收已完成；T8.8 章节归属决策与主线课程策展已于 2026-08-28 落地，完整云端/外部运维仍待完成）
**版本**：1.0  
**日期**：2026-08-25
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

## 2.1 2026-08-24 系统复核结论（历史快照，已由 2.2 更新）

本次以 `code/package.json` 的 scripts 为事实源，重新对实现、测试、生成报告和任务状态做了交叉检查。结论不是“全部完成”：核心功能在原生生产构建服务上为 GO；T8.8 仍是非云端的内容策展阻塞；云端发布和外部运维仍不能由本地证据代替。

| 复核范围                  | 当前结果           | 证据与边界                                                                                                                                                                                                  |
| ------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 代码级质量门禁            | GO                 | `check:cloud`、`check:local` 均通过；11 个 Node 工具测试、144 个 Vitest、内容审计 0 errors、生产构建通过。构建有 6 条非阻塞 Turbopack 动态文件系统追踪 warning，保留为生产评估项。                          |
| 生产依赖审计              | GO                 | `npm audit --omit=dev --audit-level=high --prefix code` 报告 0 vulnerabilities；不替代镜像来源和生产主机审查。                                                                                              |
| 原生 Cloud/Local HTTP E2E | GO（一次性实例）   | Local 学习状态生命周期通过；Cloud 29 项登录、鉴权、状态、导出和删号检查通过。Cloud 使用 Better Auth 自己的 API 和 GitHub 端点测试桩，不是现实 OAuth 凭据验收。                                              |
| Local 浏览器验收          | GO                 | `audit:ui` 54 captures / 0 findings，`audit:functional` 23/23；报告指向一次性 `http://127.0.0.1:3210` 实例。                                                                                                |
| 内容边界与素材维护命令    | GO（漂移另行判定） | `audit:boundaries` PASS；`materials check` 为 42 latest、3 behind、2 diverged、7 dirty、0 missing；内容 audit 为 0 errors / 2003 warnings；reindex 生成 621 个文档。                                        |
| Catalog Drift             | NO-GO/待人工策展   | `materials drift` 按设计非零：当前 0 条失效路径、4 个未收录仓库、479 个条目没有上游回退。漂移不是 freshness，也不是应用启动失败；详见 [catalog-drift 报告](../../code/reports/materials/catalog-drift.md)。 |
| 本地 Docker 新鲜构建      | 本轮未取得证据     | 隔离项目构建超过 3 分钟无 BuildKit 输出，已停止；未操作既有 `agent-learning-hub-local-app-1`。既有容器健康不能替代本轮新镜像构建证据。                                                                      |

**功能完成判定**：路线、目录、阅读器、搜索、Local/Cloud 访问边界、学习状态、收藏、笔记、阶段成果、导出、删号、内容审计和素材维护工具均已实现并有本地证据。T8.8 仍未完成：当前目录存在 74 个重复声明路径，必须先决定课程条目与旧站单章条目的唯一拥有者，再继续补齐章节；不能把重复 references 当作完成。其余未完成项主要是受保护分支、固定发布镜像、真实 DNS/TLS/OAuth、异地备份/调度/告警、生产日志和回滚等外部交付证据。

**证据口径**：报告中的课程、仓库和索引数量由命令动态生成，历史实施证据中的旧数字保留为历史快照，不应反向改写当前目录。完整 GO/NO-GO 列表见本文件第 12 节。

## 2.2 2026-08-25 本地全量复核

本轮按 [Prompt.md](../../Prompt.md) 对当前工作树重新执行了质量门禁、素材审计、原生生产服务器浏览器流程、HTTP E2E、正式 Docker 镜像构建和镜像运行验收。完整记录见 [本地全量端到端验收报告](../acceptance/local-e2e-2026-08-25.md)。

| 复核范围                  | 当前结果     | 证据与边界                                                                                                                               |
| ------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud/Local 代码质量门禁  | GO           | `check:cloud`、`check:local` 均通过；0 errors、11 个工具测试、144 个 Vitest、生产构建通过；保留 6 条 Turbopack tracing warning。         |
| 原生生产服务器 E2E        | GO（本地）   | Local `seed/resume/fallback/mobile` 全部通过；Local HTTP E2E 通过；Cloud HTTP 鉴权 29/29 通过，但 GitHub 仍为测试桩。                    |
| 正式本地 Docker 镜像      | GO           | `agent-learning-hub:local-20260825` 构建并以 `--no-build` 运行；镜像 ID `sha256:477882a3…`；内容不含 `local-courses`、`.env` 或 SQLite。 |
| 正式镜像 Local 验收       | GO           | 命名卷重启、空素材回退、HTTP E2E、UI 48 captures / 0 findings、功能回归 23/23 均通过。                                                   |
| 正式镜像 Cloud clean-room | GO（本地）   | 假 OAuth 配置下公开浏览、9 条路由、health/admin 边界通过；不等于真实云端部署。                                                           |
| 本地试运行                | GO           | 同一正式镜像已在 `http://127.0.0.1:3345` 以全新命名卷启动，健康状态 `healthy`、模式为 Local。                                            |
| 非云端剩余工作            | NO-GO/待决策 | T8.8 仍需确定课程条目与旧站单章条目的唯一章节拥有者；74 个重复声明不能自动全量补齐。                                                     |

**本轮没有执行云端部署、镜像推送、真实 OAuth、真实服务器回滚或外部备份操作。**

## 2.3 2026-08-28 章节归属决策与策展复核

本轮只动了内容目录与目录校验，没有改运行模式、身份、数据库或部署边界。完整记录见 T8.8 实施证据与 [ADR 0008](../adr/0008-chapter-content-has-a-single-owner.md)。

| 复核范围                   | 当前结果 | 证据与边界                                                                                                                        |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 目录唯一归属               | GO       | 514 → 395 条课程条目，119 个单章条目退场并携带 `redirect`；重复声明路径归零，由 schema 永久强制。                                 |
| 质量门禁                   | GO       | `check:cloud`、`check:local` 均以 0 退出，155 个单元测试；`audit:content` 双模式 0 errors，warnings 与改动前持平（2003 / 2032）。 |
| 旧链接兼容                 | GO       | 退场条目的 `/courses/<id>` 与 `/read/<id>` 由路由转发到拥有者；`stage-1`/`stage-2` 阅读列表改指拥有课程卡。                       |
| 素材库与 Freshness         | 未动     | 本轮不改 `local-courses/`、不跑 `materials update`；`materials drift` 的未收录仓库与上游回填仍按 2.2 节口径另行处理。             |
| 云端/外部运维（T7.1—T8.5） | 未动     | 与 2.2 节相同，仍卡在四类外部前置条件，本地证据不能替代。                                                                         |

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

**实施证据（2026-08-09）**：[convert-legacy-content.mjs](../../code/scripts/convert-legacy-content.mjs) 可重复把 `learning-site/data.js` 转为结构化阶段、课程与章节条目、[项目阶梯](../../code/content/catalog/project-outcomes.json) 与完整旧数据快照；前两者当时写入 `content/stages/legacy-import.json` 和 `content/courses/legacy-import.json`，T8.10 后已改名为 [stages.json](../../code/content/stages/stages.json) 与 [courses.json](../../code/content/courses/courses.json) 并转为人手维护；各条转换记录保留 `legacyImport.raw`，完整源数据保留在快照中。[legacy-conversion.json](../../code/reports/legacy-conversion/legacy-conversion.json) 对照基线确认 4 轨、9 阶段、42 课程卡、38 分组、472 章节和路径引用；[待补全报告](../../code/reports/legacy-conversion/legacy-conversion.md) 明确列出 488 个缺失上游地址及 514 个未知作者/许可证，未猜测值。[legacy-content-converter.test.mjs](../../code/tests/legacy-content-converter.test.mjs) 断言转换可重复、数量与基线一致。

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

Phase 7 的详细目标、依赖、规格映射、实施证据和本地优先执行顺序已移至 [Phase 7：交付、部署与运维](../deploy/phase-7-delivery-deployment-operations.md)。本文件只保留任务状态与需求追踪，避免把本地功能开发和云端部署操作混在同一章。

| 任务                            | 状态       | 依赖                   | 规格                                            | 详细内容                                                                                                    |
| ------------------------------- | ---------- | ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| T7.1 完善 CI 流程               | [ ] 未完成 | T3.3、T4.8、T5.5、T6.7 | NFR-006、NFR-007、DEPLOY-002                    | [Phase 7 文档第 4 节](../deploy/phase-7-delivery-deployment-operations.md#4-t71-完善-ci-流程)               |
| T7.2 建立版本化镜像发布         | [ ] 未完成 | T5.4、T7.1             | DEPLOY-002、DEPLOY-005                          | [Phase 7 文档第 5 节](../deploy/phase-7-delivery-deployment-operations.md#5-t72-建立版本化镜像发布)         |
| T7.3 编写云端部署和回滚流程     | [ ] 未完成 | T7.2                   | DEPLOY-004—DEPLOY-009、OPS-005                  | [Phase 7 文档第 6 节](../deploy/phase-7-delivery-deployment-operations.md#6-t73-编写云端部署和回滚流程)     |
| T7.4 实现 SQLite 备份与保留策略 | [ ] 未完成 | T4.1                   | OPS-001—OPS-006、AC-09                          | [Phase 7 文档第 7 节](../deploy/phase-7-delivery-deployment-operations.md#7-t74-实现-sqlite-备份与保留策略) |
| T7.5 执行干净环境恢复演练       | [x] 已完成 | T7.4、T7.3             | OPS-006、AC-09                                  | [Phase 7 文档第 8 节](../deploy/phase-7-delivery-deployment-operations.md#8-t75-执行干净环境恢复演练)       |
| T7.6 建立隐私优先监控           | [ ] 未完成 | T6.7、T7.3             | ADMIN-003—ADMIN-006、NFR-008、SEC-005、PRIV-003 | [Phase 7 文档第 9 节](../deploy/phase-7-delivery-deployment-operations.md#9-t76-建立隐私优先监控)           |
| T7.7 同步项目文档与运行手册     | [ ] 未完成 | T5.4、T6.6、T7.3       | IA-005、DEPLOY-001、MAT-002                     | [Phase 7 文档第 10 节](../deploy/phase-7-delivery-deployment-operations.md#10-t77-同步项目文档与运行手册)   |

**Phase 7 退出条件**：指定版本可从空服务器部署、监控、备份、恢复和回滚；本地用户也有完整启动文档。详细条件和“本地先行、云端后置”的执行顺序见 [Phase 7 独立文档](../deploy/phase-7-delivery-deployment-operations.md)。

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

**当前本地全量复验（2026-08-25）**：按 [本地验收报告](../acceptance/local-e2e-2026-08-25.md)
重新执行原生生产服务器和正式 Docker 镜像。Local `seed/resume/fallback/mobile`、Local
HTTP E2E、Docker 命名卷重启、空素材回退、UI 48 captures / 0 findings 和功能回归 23/23
均通过；Cloud 本地 clean-room 公开流程也通过。T8.2 仍不勾选，因为真实 GitHub OAuth
两用户、生产备份恢复和版本回滚仍是外部证据。

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

**部分完成（2026-08-20）**：四项要求里，「旧站归档说明清晰」已落实——[learning-site/README.md](../../learning-site/README.md) 原本仍把自己描述成在用的单页应用（含 41 门课程、427 篇章节等数字），与根 README 和 AGENTS.md 直接矛盾，新人打开会误以为那是现役站点。现已在顶部加归档横幅：指向 `code/`、说明本目录是迁移基线、不再独立演进，并声明其中数字只代表归档当时的状态。根 README 与部署入口早已指向 `code/`，这一项本来就成立。

剩下两项——发布固定版本并记录回滚版本、观察首轮健康/登录/数据库/备份/内容错误——都需要真实生产部署，仍随 GATE-10 阻塞。

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

### - [x] T8.8 补齐本地课程的章节声明

**依赖**：T8.7
**规格**：READ-014、CAT 系列

- 逐课程策展 `references`，让主线课程在站内可读到完整章节。
- 排除文档站、i18n、示例目录等噪音，不做全量声明。
- 保持"允许章节由条目显式声明"这一边界不变。

**问题陈述（2026-08-11，T8.7 走查发现）**：512 个 `local-preferred` 条目合计只声明了 547 个 markdown 章节，而这些素材目录下共有约 17,030 个 md 文件；418 个条目声明数远低于实际可用数。表现为 Hello-Agents 这类主线教材在站内只能读到 2 章（README 与前言），其余 16 章虽然文件就在本地却无入口。

T8.7 之后代码行为已正确：已声明章节可读、可上下翻页，未声明的链接降级为纯文本而不是死链。**剩余工作纯属内容策展**，不涉及代码或安全边界。全量声明不可取——CrewAI 一个条目目录下就有 9,776 个 md 文件，多为文档站与 i18n，纳入会污染阅读器与搜索索引。

建议做法：为主线课程按命名规则（如 `docs/chapter*/*.md`）生成候选章节，人工确认后写入条目的 `references`；先覆盖少数旗舰课程，再逐步扩展。

**保留策略已由 T8.10 解决（2026-08-15）**：目录不再由 `convert:legacy` 生成，`content/courses/courses.json` 就是权威事实源，策展结果不会被覆盖。这条前置阻塞已解除。

**实施证据（2026-08-20）**：先按建议做法为 7 门旗舰课程（`featured`）生成了 110 条章节声明，随后发现**其中 94 条是重复的**，已回退。最终净增 **16 条**，站内可读章节 456 → 472。

_问题陈述本身有一处不准确。_ 原文说 Hello-Agents「其余 16 章虽然文件就在本地却无入口」。实际不然：旧站导入已把每个上游章节文件变成独立条目，那 16 章分别由 `legacy-reading-02-003`…`legacy-reading-04-*` 等条目声明，本来就打得开。它们缺的不是入口，而是**在课程条目内作为章节被连续阅读**的能力。

_为什么不能两边都声明。_ `buildRuntimeSearchIndex()` 给章节文档建的键是 `itemId#relativePath`（[search-index.ts:132](../../code/modules/search/search-index.ts)），跨条目不做路径去重。同一个文件挂在两个条目下，就会产出两条内容完全相同的结果——一条来自课程条目的逐章文档，一条来自单章条目折叠进正文的条目文档。这直接违反「一条结果只代表一个可打开的目标」。

_落盘规则。_ **绝不声明已被其他条目拥有的文件。** 按此逐条核对 110 条：

| 条目                                        | 提议 | 重复（已回退） |   净增 |
| ------------------------------------------- | ---: | -------------: | -----: |
| legacy-course-008 learn-claude-code         |   12 |              0 | **12** |
| legacy-course-039 cc-switch                 |    7 |              4 |      3 |
| legacy-course-024 驾驭工程                  |   38 |             37 |      1 |
| legacy-course-001 Hello-Agents              |   16 |             16 |      0 |
| legacy-course-004 claw0                     |    9 |              9 |      0 |
| legacy-course-016 OpenClaw                  |   16 |             16 |      0 |
| legacy-course-022 Learn Harness Engineering |   12 |             12 |      0 |

只有 learn-claude-code 的 12 章是真正没有任何入口的，全部保留。

_附带产出。_ 逐课定规则的做法本身是对的（七门课命名互不相同且都带 en/ja 孪生，统一规则会把 i18n 副本拖进来），规律已记录在上表对应的课程里，供后续决策后复用。另修正 H1 提取：必须跳过围栏代码块，否则会把代码里的 `# 注释` 当标题——Hello-Agents 第三章一度被标成「示例语料库，与上方案例讲解中的语料库保持一致」。

_验收。_ `audit:content` 在改动前后同为 **0 errors / 2003 warnings**。

_顺带修掉的走查脆弱点。_ 策展后跑 `audit:functional` 出现 7 项失败，全部是 `page.goto: Timeout 30000ms exceeded`。查明与本次改动无关：脚本用 `networkidle` 等页面，而 Hello-Agents 的 README（改动前就已声明、且仍是默认打开的第一章）嵌了 8 张远程徽章图，其中 `contrib.rocks` 当时不可达，浏览器 8 张图全部 `complete:false`，网络永不空闲。服务端本身只用 33ms 返回。已把 `goto`/`reload` 的等待条件改为 `domcontentloaded`——这些断言看的是 DOM 与状态往返，不需要图片加载完——之后 23/23 通过。约定写入 [AGENTS.md](../../AGENTS.md)。

**已存在的重复（2026-08-20 实测）**：回退之后又做了一次全目录审计，发现**74 个文件本来就被一个以上的条目声明**，与本次策展无关——旧站导入同时把文件挂到了课程条目和它自己的单章条目下。例如 `Learning/hello-agents/README.md` 同时属于 `legacy-course-001` 与 `legacy-reading-02-001`。

这不是纸面问题。拿 README 正文里的一句话去搜，返回两条指向同一段内容的结果：

```
/read/legacy-course-001?chapter=Learning/hello-agents/README.md
/courses/legacy-reading-02-001
```

成因就是上面那条索引规则：课程条目是多章的，于是为 README 产出逐章文档；`legacy-reading-02-001` 是单章的，于是把同一段正文折叠进条目文档。「一条结果只代表一个可打开的目标」因此在当前目录里已被违反 74 次。本次回退没有修好它，只是没有让它扩大到 168 次。

**当前盘点（2026-08-25）**：直接读取权威目录 `code/content/courses/courses.json` 复核得到 514 个条目、475 个不同的本地路径和 74 个重复路径；其中 66 个路径由两条目声明、8 个路径由三条目声明。73 个重复路径是课程条目与单章条目重叠，另有 1 个路径由两个单章条目重叠；共影响 38 个课程条目和 82 个单章条目。若选 (a)，预计先退场 80 个与课程路径重复的单章条目，再单独解决剩余的单章—单章重复；若选 (b)，预计从课程条目移除 73 条重复 references，并保留单章条目作为正文拥有者。当前 schema 没有 redirect/archive 字段，而 IA-004 又要求已发布 ID 稳定，因此 (a) 不能简单删除条目，必须同时设计旧 ID 兼容策略。数字是本次审计快照，实际落盘前仍需重新运行唯一目标审计。

**遗留**：把「课程条目内可连续阅读完整章节」这件事做完，需要一个先于策展的**目录决策**——同一份正文该由课程条目拥有，还是由旧站导入产生的单章条目拥有。两者只能选一个，否则必然重复。可选方向：(a) 课程条目拥有章节，相应的 `legacy-reading-*` 条目退场；(b) 维持现状，课程条目只保留 README 与少量入口。这属于目录归属的架构决定，应先落一条 ADR 再动数据，不适合在策展中顺手定。第二波扫描已确认 `legacy-course-034`（17/18 已被 `legacy-reading-23-*` 声明）与 `legacy-course-023`（18/18 已被 `legacy-reading-17-*` 声明）同样受此阻塞。

其余约 500 个 `local-preferred` 条目多为工具仓库、文档站或资源索引，本就不存在「完整章节」这一说，不追求全量。

**实施证据（2026-08-28，目录归属决策落地并完成策展）**：阻塞本任务两轮的目录归属决策已按 [ADR 0008](../adr/0008-chapter-content-has-a-single-owner.md) 落定：**一份本地素材正文的完整检索与阅读归属，只能属于一个未退场条目**。课程卡拥有主线章节（保留翻页、目录与正文内链的课程语境）；与课程章节重叠的单章条目退场，携带 `redirect: { itemId, chapter? }` 把旧 ID 永久转发到拥有者——带章节的进入拥有者的阅读器，其余进入课程导览。IA-004 的 ID 稳定因此不受影响。

_机制（schema 强制，非审计建议）。_ `learningItemSchema` 新增可选 `redirect` 字段；`contentCatalogSchema` 拒绝四类目录：同一路径被多个未退场条目声明、redirect 指向不存在的条目、redirect 章节未被目标声明、自指 redirect；Stage 阅读列表引用退场条目同样报错。这些是目录内部一致性错误，与重复 stable ID 同级——违反时加载、构建、审计全部失败，不适用 Catalog Drift 的"另报不挡门禁"。退场条目被 `listItems()`、搜索索引、首页计数、学习面板和目录筛选整体排除；`getItem()` 仍能找到，供 `/courses/[itemId]` 与 `/read/[itemId]` 转发。

_数据落盘分三批。_

| 批次     | 处理                                                                                                                                                                                                                                                                                                        | 数量 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: |
| 存量重复 | 73 个课程卡↔单章重叠路径上被遮蔽的单章条目退场；`Agentic/Harness/deepagents/AGENTS.md` 的两个单章条目保留标题更具描述性的 `legacy-reading-31-008`（「DeepAgents 工程约定」）；`Agentic/openchamber/README.md` 的双卡重叠裁决给专用卡 `legacy-course-033`，生态卡 `legacy-course-018` 移除该条重复 reference |   81 |
| 策展收编 | `legacy-course-034`（AI Agent Deep Dive）收编 `docs/01–16` 共 16 章；`legacy-course-023`（Harness Books 双册）按 Book 1/Book 2 阅读顺序收编 22 章                                                                                                                                                           |   38 |
| 阶段引用 | `stage-1`/`stage-2` 阅读列表改指拥有课程卡（`legacy-course-004`/`legacy-course-025`），两卡补上对应 `stageIds`                                                                                                                                                                                              |    2 |

落盘后课程目录从 514 条收敛到 395 条，重复声明路径**归零**，`legacy-course-023` 与 `legacy-course-034` 的"逐章连续阅读"阻塞解除。此前标记重复来源与"为什么不能两边都声明"的索引机制说明保留为历史记录；新的唯一归属不变量同时写入了 [AGENTS.md](../../AGENTS.md)、[spec.md](./spec.md)（CAT-008）与 [plan.md](./plan.md) 6.1/6.6。

_验证。_ `check:cloud` 与 `check:local` 均以 0 退出（155 个单元测试，较此前净增 11 个：schema 归属 7 项、索引排除 1 项、redirect 路由 3 项、目录计数更新）；`audit:content` 双模式 0 errors（云端 warnings 与改动前同为 2003，本机同为 2032）；`catalog-api.test.ts` 的目录计数断言随目录更新为 396/353。

_剩余工作。_ 主线课程的连续阅读已打通；对约 400 个工具仓库、文档站类条目维持"不做全量声明"的非目标。后续若有课程需要扩展章节，模式是固定的：单章条目退场 redirect 到课程卡，课程卡显式声明章节——schema 会在声明重叠时当场拒绝。

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

**实施证据（2026-08-24，Local Mode 全页面复查）**：在本地 Docker 部署（`http://127.0.0.1:3001`）上逐页走查并留存截图 16 张（`code/reports/ui-walkthrough/`，01-home 至 15-admin 为走查记录，16-content-policy-fixed 为修复后复核），覆盖首页、路线与阶段页、课程目录（筛选/分页/非法参数）、课程详情、单章与多章阅读器（章节切换、图片 `loading="lazy"`/`decoding="async"`/`referrerpolicy="no-referrer"` 属性）、搜索、项目阶梯、学习面板（任务勾选往返、收藏往返、笔记增删、阶段成果提交/确认/删除、JSON 与笔记 Markdown 导出）、`/login`、`/content-policy`、`/contribute` 与 `/admin`（非管理员 404）。发现并修复两处缺陷（修复后重建镜像复核通过，`npm run check:local` 以 0 退出）：

_缺陷 1：三个静态页面的模式徽标被构建期固化。_ `/content-policy`、`/contribute` 与 `not-found` 此前没有 `export const dynamic`，构建时被静态预渲染，header 的模式徽标与末项导航按构建期默认值输出，本地 Docker 部署里这三页错误显示“云端模式 + 登录”。`next dev` 按请求渲染所以此前未暴露，只有构建产物会固化默认值。三个页面补上 `export const dynamic = "force-dynamic"`，与项目内其余全部页面一致；约定已写入 [AGENTS.md](../../AGENTS.md)。（PAGE-007、PAGE-015）

_缺陷 2：学习面板把成果类型枚举原样渲染。_ `/learning` 的阶段成果列表直接显示 schema 枚举 `repository`/`demo`/`reflection`，违反 PAGE-011。新增 `outcomeKindLabels` 映射（GitHub 仓库 / 演示链接 / Markdown 总结），与成果表单下拉文案一致；枚举示例已同步进 [AGENTS.md](../../AGENTS.md) 与 [plan.md](plan.md) 4.3 的标签映射约定。

**正式镜像复验（2026-08-25）**：使用 `agent-learning-hub:local-20260825` 在独立命名卷
以 `--no-build` 运行，UI 走查 48 captures / 0 findings，`audit:functional` 23/23，
Local 浏览器四阶段和 Cloud clean-room 公开流程通过；当前试运行实例为
`http://127.0.0.1:3345`。验收工具的上游链接定位也补为“至少存在一个目标链接”，避免
合法的“打开上游”和“GitHub”两个相同 href 触发脚本 strict locator 误报。

**Phase 8 退出条件**：所有上线门槛通过，新站成为仓库唯一推荐入口。

### - [x] T8.10 建立 Catalog Drift 对账机制并修复目录路径漂移

**依赖**：T8.7
**规格**：CAT 系列、READ-014、NFR-010

- 让目录声明的本地路径与素材库实际内容之间的偏差可发现、可提候选、可选择性落盘。
- 修复素材库重组造成的既有漂移。
- 把"素材库随时会变"确立为常态而不是异常。

**问题陈述（2026-08-15）**：`local-courses/Agentic/` 新增聚合目录 `Harness/`，若干素材被收编其下，`langchain/` 与 `langgraph/` 被删除。目录里 465 个 distinct `localPath` 有 119 条失效，导致 514 个条目里 **133 个的主路径与全部章节引用同时失效**——阅读器整条打不开，其中 130 个没有 `sourceUrl`，落到"暂不可用"。

同时暴露三个先前不可见的缺陷：

1. **`check:local` 在 CI 里结构性失败**。`local-courses/**` 被 gitignore 但 `README.md` 被追踪，CI 检出后目录存在、素材为空；`auditLocalPaths` 的"未挂载则跳过"只在**根目录不存在**时触发，于是 511 条全判失效。Quality 工作流最近 5 次全 FAIL，`local quality` 恒定 `Content audit failed: 511 errors`。判定信号用错了：目录存在 ≠ 素材挂载。
2. **审计只检 `item.localPath`，不检 `references[].localPath`**。本次两者恰好同步失效才没暴露。
3. **`materials check` 把死路径静默归为 `no-git:` 跳过**，跳过数从 5 涨到 56、退出码仍是 0。

**决定**：见 [ADR 0006](../adr/0006-catalog-is-hand-maintained.md)（目录改为人手维护，`convert:legacy` 废弃）与 [ADR 0007](../adr/0007-catalog-drift-is-proposed-not-applied.md)（漂移由工具提候选、由人确认）。新术语 **Catalog Drift** 已入 [CONTEXT.md](../../CONTEXT.md)，与既有 Freshness Status 明确分家。

**实施证据（2026-08-15）**：

_事实源与命名。_ `content/courses/legacy-import.json` → `courses.json`，`content/stages/legacy-import.json` → `stages.json`。`convert-legacy-content.mjs` 加废弃告警但仍写死旧文件名——误跑会产出重复 stable ID 被 `Duplicate stable ID` 校验当场拦下，而不是静默覆盖策展成果。

_对账机制。_ 新增 [catalog-drift.ts](../../code/modules/freshness/catalog-drift.ts) 与 `materials drift` 子命令（`npm run audit:materials`），产出 [JSON](../../code/reports/materials/catalog-drift.json) 与 [Markdown](../../code/reports/materials/catalog-drift.md)，三块内容：失效路径与候选、未收录的独立仓库（自动排除嵌套在已收录仓库内的 vendoring）、`sourceUrl` 缺口按仓库分组。非零退出，**不进** `npm run check`。

_候选匹配的两道守卫。_ 先按最长路径后缀收敛候选（`README.md` 单独匹配 1713 个文件，路径尾缀才是信号），再要求隐含的目录改写被多条路径共同印证。第二道守卫的第一版仍然失效：让**所有**候选参与投票时，`langchain/AGENTS.md` 的 127 个候选里恰好有一个隐含了同一条改写，把 `langchain/libs/README.md → deepagents/libs/README.md` 凑成了"已印证"。改为**只有后缀收敛后唯一命中的路径才有背书资格**——匹配上百个同名文件的路径并不知道自己去了哪。修正后 113 moved / 6 uncertain / 0 gone，与人工推导的 5 条重命名规则**零分歧**，且 6 条真删除全部落在 `uncertain`。

_落盘。_ `materials drift --apply` 改写 252 处路径、覆盖 125 个条目，diff 为 252 增 252 删且**每一行都是 `localPath`**；`legacyImport.raw` 的历史路径未动。写回经 Prettier 归一——先给 Prettier 缩进过的 JSON 而不是压平的，否则它会折叠所有能放进行宽的对象，把 113 处改动淹没在全文件重排里。

_真删除。_ langchain / langgraph 消失，8 个完全依赖它们的条目改为 `upstream-only` + `blob/HEAD/` 上游地址（`HEAD` 而非分支名，本地三个仓库在 `dev` 上）；混合条目 `legacy-course-026` 主文档改指唯一存活的 DeepAgents 章节，两条死引用转上游。6 个上游地址逐一实测 200。

_缺陷修复。_ `isLocalMaterialMounted()` 改判"根下是否存在素材目录"；审计扩展到 `references[].localPath`；`local-path-missing` 降为 warning（`local-path-escape` 与 `local-path-not-file` 仍是 error）；`materials check` 区分"非 Git 引用"与"路径不存在"，后者非零退出并指向 `materials drift`。

_`sourceUrl` 缺口。_ 479 个条目无上游回退，其中 470 个可从 `git remote` 推导，8 个不在任何仓库内（PDF 与手写文档）。54 组样例逐一实测：**52 组 200，2 组真 404**——`multica` 仓库在但本地副本声明的 `README.zh-CN.md` 上游没有，`CodexSwitch` 整个仓库 404。这两组共 14 个条目，正是"按仓库人工确认"而非全自动回填的实证依据。报告已注明样例链接"派生而未验证"。落盘待用户按仓库确认。

_验证。_ `materials drift` 从 119 失效降到 **0**；`materials check` 从 47 仓库 / 56 跳过恢复为 54 仓库 / 5 跳过；[catalog-drift.test.ts](../../code/modules/freshness/catalog-drift.test.ts) 10 项单测覆盖后缀收敛、印证通过、孤证拒绝、高候选数不得投票、gone、选择性落盘、vendoring 排除、未挂载短路、SSO 形式 remote 解析与 HEAD 固定；`npm run check:cloud` 与 `npm run check:local` 均以 0 退出（144 单元测试）。

**当时遗留（2026-08-15）**：`sourceUrl` 的 470 条回填待按 54 个仓库确认后落盘；当时报告列出 3 个未收录仓库，待策展决定。

**上一轮复核（2026-08-24）**：最新 [catalog-drift 报告](../../code/reports/materials/catalog-drift.md) 列出 4 个未收录仓库（新增 `Agentic/HelloAgents`），0 条失效路径；数量随素材库变化，以报告为准。T8.10 的工具和边界仍然有效，但不替代人工目录归属决定。本轮最新状态见第 2.2 节。

### - [x] T8.11 按运行位置梳理脚本并补齐三条路径的 Runbook

**依赖**：T8.10
**规格**：DEPLOY-016、DEPLOY-017、DEPLOY-018

- 给 `code/scripts/` 的每个脚本确定执行位置、作用对象和硬依赖。
- 补上缺失的"本机运行本地服务"Runbook，让三条运行路径各有一份可独立执行的文档。
- 让云端两份文档互相可定位，脚本失败时能回到手工流程的对应步骤。

**问题陈述（2026-08-15）**：`code/scripts/` 有 13 个脚本，文档里是一张平铺的命令表，没有区分"在哪台机器上执行"和"作用于什么"。这两件事不一样——`image-release.sh` 和 `lighthouse-deploy.sh` 都在开发机上跑，作用对象却是云端；`docker-deploy.sh` 三种模式跨两台机器。同时 `docs/deploy/` 只覆盖云端两条路径，"在本机跑起来学习"这条最常用的路径没有对应文档，散落在 USER.md 和 GUIDE.md 里且没有验证点。

**实施证据（2026-08-15）**：

_分类。_ 逐脚本读 usage 并扫描硬依赖（docker / ssh / playwright / local-courses / 运行中的服务 / git / registry），归为三类：本机→本机 9 个、本机→本机 Docker 3 个、作用于云端 4 个（`docker-deploy.sh` 同时出现在后两类，因为 `release` 模式在云主机执行，由 `lighthouse-deploy.sh` 打包上传——已核对该脚本确实把 `docker-deploy.sh`、`database.ts`、`modules/` 和四个 Compose 文件一起 scp 到远端）。分类表写入 [docs/deploy/README.md](../deploy/README.md#脚本按运行位置分类)，并在 [README](../../README.md#维护命令)、[AGENTS](../../AGENTS.md#脚本约定) 和 [plan 13.5](./plan.md#135-脚本的运行位置) 保持一致。

_新增文档。_ [local-manual.md](../deploy/local-manual.md)：两条本机路径（开发服务器 / 本机 Docker）的对比与选择、素材库准备与挂载验证、逐步验证点、学习状态存放位置与加密备份、走查命令、素材变动后的对账流程、9 类故障处置表。文中的 state 路径（`code/.data/learning-state.sqlite` 及 `-wal`/`-shm`）、口令变量（`BACKUP_PASSPHRASE`）和 Docker 卷名（`agent-learning-hub-local_learning-state`）均实机核对。

_云端两份互相定位。_ [production-manual.md](../deploy/production-manual.md) 新增第 0 节（三条路径定位、分阶段时间预算、8 项前置检查清单、本文涉及的脚本在哪执行）与第 16 节（14 行逐节 ↔ action 映射，并列出脚本永远不做的三件事：腾讯云控制面、数据库恢复与切卷、异地备份副本）。[lighthouse-automation.md](../deploy/lighthouse-automation.md) 新增第 0 节（路径定位、执行位置示意、九个 action 的幂等性/是否改服务器/必需环境变量速查、可选环境变量表，含两个破窗开关的使用约束）与第 15 节（按失败 action 回指手工文档章节）。

_规格。_ spec.md 新增 DEPLOY-016（脚本必须登记运行位置）、DEPLOY-017（依赖素材库或浏览器的脚本不得上生产、不进 `check`）、DEPLOY-018（三条路径各有 Runbook，云端两份须可互相定位）。

**遗留**：文档描述的云端流程仍未在真实主机执行过，GATE-10 保持未勾选。

### - [x] T8.12 补齐 Cloud Mode 登录端到端测试与恢复演练命令

**依赖**：T8.11
**规格**：NFR-007、NFR-012、OPS-006、OPS-007、OPS-008

- 让 Cloud Mode 的准入路径（登录）进入端到端测试，而不是只有模块级 mock。
- 把"干净环境恢复演练"从一段照做的文档变成一条自带判定的命令。
- 让云端自动化路径能在目标主机上执行同一套演练。

**问题陈述（2026-08-19）**：GATE-04 和 GATE-07 卡了很久，原因是两处缺口都不在实现里，而在**验证方式**上。

其一，`learning-state-http.mjs` 覆盖了笔记、收藏、成果、导出和删号，但它只在 Local Mode 跑——那个模式**自动签入固定单用户，压根没有登录这一步**。Cloud Mode 的登录只有 `better-auth.test.ts` 的模块级 mock。于是 GATE-04 要求的六件事里，"登录"从未跨过 HTTP 边界被验证过，而登录恰恰是 Cloud Mode 全部访问规则的入口：匿名拒绝、CSRF、删号后会话失效，都挂在它后面。CI 的 cloud 分支只跑三个公开页面 smoke，这个缺口在流水线里是看不见的。

其二，`lighthouse-deploy.sh` 有 `backup` 但**没有任何恢复入口**，`rollback` 明确写着"never restores data"。恢复演练只存在于 `production-manual.md` 第 14.2 节的一串手工命令里。没跑过的备份只是一个假设，而这串命令没人跑过，也没有判定标准——照着敲完，你并不知道它算不算通过。

**实施证据（2026-08-19）**：

_Cloud Mode 端到端。_ 新增 [`code/tests/e2e/cloud-auth-state-http.mts`](../../code/tests/e2e/cloud-auth-state-http.mts)，28 项断言，覆盖：匿名对 `/api/state`（读/写）、`/api/data`（导出/删号）四个入口全部 401；登录跳转 GitHub；回调签发会话且不落盘任何 provider token；会话解析到正确身份并签发 CSRF；缺失与不匹配的 CSRF 各自 403；进度/笔记/收藏/成果/阶段确认五种写入；快照回读；JSON 与 Markdown 导出；未确认删号 400；删号成功后会话不再认证、8 张私有表全部清空、用户行消失、公开目录不受影响；原始会话 token 从不出现在数据库文件里。

会话不是伪造的：测试用 Better Auth **自己的 API** 在服务端同一个 SQLite 文件上走一遍 `signInSocial` → 回调，只打桩 GitHub 的 token 与 profile 两个端点。服务器认这个 cookie 是因为它由同一个库、同一个 secret 签发，而不是因为测试重新实现了签名。负向对照已验证：把 `BETTER_AUTH_SECRET` 换成别的值，测试在"session resolves to the GitHub identity"处失败。测试可重复执行——末尾删号，下次运行重新建号。

新增 `npm run test:e2e:cloud`；[quality.yml](../../.github/workflows/quality.yml) 改为按模式调用 `test:e2e:${mode}`，让 package.json 保持命令事实源，cloud 分支不再只跑公开 smoke。

_恢复演练。_ 新增 [`code/scripts/restore-drill.ts`](../../code/scripts/restore-drill.ts)（`npm run drill:restore`），16 步：建库或快照实库 → `db:backup` → 在从未存在过数据库的目录里 `db:restore` → `integrity_check`、schema 比对、8 张私有表逐表行数比对、用应用自己的 opener 重开并读出每个用户 → manifest 的 `restoreVerifiedAt` 被写上。三组反向对照证明恢复路径确实会失败：错误口令、翻掉一个字节的密文（GCM 认证标签拒绝）、往已存在的库上恢复。另加"缺 `--yes`"的确认门。演练走的是 `db:backup`/`db:restore` 两条真实 CLI，不是直接调模块，所以 CLI 层的回归也会被它抓到。

`--source` 用 SQLite **在线备份 API** 取快照而非 `cp`：live 库的已提交页可能还在 `-wal` 里，文件拷贝会得到撕裂或过期的快照。这一条使得把演练指向生产卷是安全的。

_云端入口。_ `lighthouse-deploy.sh` 新增第十个 action `restore-drill`，与 `backup` 同形：同一个维护容器、只读挂载状态卷、只写自己的演练目录，不停服、不碰运行中的发布。`restore-drill.ts` 一并进入发布 bundle。

_实测发现（已写入文档）。_ 生产备份在**只读**挂载的状态卷上打开数据库。实测确认：`-shm` 存在时（应用运行中或非正常退出）只读打开与在线备份都正常；但 `-wal` 非空而 `-shm` 缺失时，只读打开直接 `SQLITE_CANTOPEN`，报错里不提任何文件名。这解释了"手工搬运库文件"为什么是危险操作，症状已补进三份 Runbook 的故障表。另确认容器 `docker stop` 后 `-wal`/`-shm` 都保留，因此停服状态下的备份路径成立。

_发布镜像实测（2026-08-20）_。把 `test:e2e:cloud` 打到将要上云的那个镜像（`ghcr.io/cr330326/agent-learning-hub:v0.1.0`，linux/amd64，digest `sha256:76da5d2a…23af3c`）上，验证了三种拓扑：

| 拓扑                                  | 结果                           |
| ------------------------------------- | ------------------------------ |
| 容器 + 状态放在 macOS bind mount      | 前 24 项通过，删号级联断言失败 |
| 容器 + 容器共享命名卷（与云主机同构） | 29/29                          |
| 开发机原生文件系统                    | 29/29                          |

第一行**不是应用缺陷**。定位过程：容器内查询与宿主查询结果一致（排除陈旧读）；容器日志时间线证明残留的 user/account/session 三行来自测试开头的登录、而非删号后重建；镜像内 `foreign_keys=1` 且 `DELETE FROM users` 级联正常（直接探针验证）。根因是测试为了签发会话必须成为服务端 SQLite 文件的**第二个写入者**，而 SQLite 的 WAL 锁经由内存映射的 `-shm` 协调，这个映射跨 macOS/VM 边界不相干。

已加护栏：测试中段新增第 29 项断言「the database file agrees with the server about the note just written」，在这种环境下直接点名文件系统问题，而不是让它以幻影级联 bug 的形式在末尾爆掉。约束同时写入测试文件头与 [testing-strategy.md](../testing-strategy.md)。

_端到端测试的破坏性（2026-08-20）_。把 `test:e2e:local` 指向正在用的本地预览时暴露了一个隐患：该测试**以删号收尾**，而 Local Mode 只有一个用户就是维护者本人。实测中它在失败前已向真实学习状态写入 1 条笔记、1 条收藏、1 条进度和 1 条成果（已逐条还原，进度 9 / 收藏 2 / 笔记 0 / 成果 0 与运行前一致）；若它通过了中途的回读断言，末尾就会清空全部阅读进度、笔记与收藏。危险之处在于中途每一条断言针对的都是测试自己刚写的数据，全程看不出异常。已在 `learning-state-http.mjs` 开跑前加检查：目标已有学习状态即拒绝运行，除非显式 `E2E_ALLOW_DESTRUCTIVE=1`。CI 始终从空库起步，因此不受影响（干净实例上 `test:e2e:local` 仍通过）。约束写入 [AGENTS.md](../../AGENTS.md) 与 [testing-strategy.md](../testing-strategy.md)。

**遗留**：三条命令均已实测通过（cloud e2e 29/29 × 原生与容器两种拓扑、local e2e、演练 16/16 合成 fixture 与真实本地库各一次）。GATE-04 因此勾选。GATE-07 要求的是**目标主机上**的演练证据，GATE-10 要求云端流程被真实执行过——两者在 2026-08-20 都因**开发机出网异常**未能执行，与云端无关。

排查记录（这次的教训主要是**测量方法**，不是结论）：现象是 `ssh tencent-lighthouse` 超时。中途得出过两个错误结论，都被后续数据推翻，记在这里以免重来：

1. ~~腾讯云防火墙拦截~~ —— 控制台规则明确放行 TCP 22（全部 IPv4）、3000、6080、8080、27408 与 ICMP。
2. ~~所在网络封了直连出网~~ —— 由一次 `nc -G 6` 的坏测量得出；改用 `-w` 重测，直连到 baidu / qq / aliyun 的 443 全部成功。

最终确认的事实：主机侧 `ufw` inactive、未装 fail2ban、`sshd` active、`*:22` 在监听；**主机对全网可达**——OrcaTerm 里看到 13:47 与 13:51 仍有其他 IP 正常连入 22。而本机无论直连还是经代理都到不了这台主机（代理访问其 8080/3000 返回 502），同一分钟内 `nc` 报 `Connection refused`、`ssh` 报 `Operation timed out`。昨晚 23:16–23:24 的成功会话来自出口 `183.128.47.100`（主机安全里记为 10 条「异常登录」），此后本机出口已变。

结论：主机与云端配置都正常，问题在本机到该主机的这条**网络路径**上，不是项目配置问题。可复用的方法沉淀进了两份云端 Runbook 的排查小节，核心是**先从服务器侧确认别人还连不连得进来**，以及四个容易骗过人的观测（`ping` 通≠TCP 通、`curl` 读 `HTTP_PROXY` 而 `ssh`/`nc` 不读、`refused` 与 `timed out` 并存说明路径被干预、直连可能只对部分目的地有效）。换一个网络（手机热点）是最快的验证手段。

## 12. 上线门槛核对表

- [x] GATE-01 cloud-clean-room 构建和公开流程通过。（2026-08-11 隔离镜像实测）
- [x] GATE-02 local Docker 阅读、搜索和进度保存通过。（2026-08-11 隔离 Compose 实测）
- [x] GATE-03 云端与本地使用相同课程 ID、schema 和状态规则。（双模式同一构建与测试覆盖）
- [x] GATE-04 登录、笔记、收藏、成果、导出和删号集成测试通过。（2026-08-20，`test:e2e:cloud` 29 项 + `test:e2e:local`；已在发布镜像上按云主机拓扑复跑，见 T8.12）
- [x] GATE-05 路径回退、穿越保护和恶意 Markdown 测试通过。
- [x] GATE-06 手机端核心学习流程通过。（见 T8.3 验收证据）
- [x] GATE-07 SQLite 干净环境恢复演练通过。（2026-08-20 在目标主机 `VM-0-9-ubuntu` 上 16/16 通过，含三组反向对照；见 T7.5 与 [restore-drill-host](../../code/reports/restore-drill-host/restore-drill.md)）
- [x] GATE-08 新站覆盖旧站首版核心能力。（见 T8.1 对等报告）
- [x] GATE-09 云端镜像不含 `local-courses/`、数据库、备份或秘密。（2026-08-11 镜像扫描）
- [ ] GATE-10 部署、回滚、素材维护和故障恢复文档可由他人复现。

## 12.1 剩余工作与解除条件（2026-08-25 核实）

当前有 9 个未完成任务。T7.5（GATE-07）与 T8.8 已经完成——T8.8 的目录归属决策按 [ADR 0008](../adr/0008-chapter-content-has-a-single-owner.md) 于 2026-08-28 落地并完成策展，证据见该任务的实施记录；其余 9 个卡在仓库之外的四类前置条件上。实现与本地测试证据已经分开记录，不能把外部条件隐含标记为完成：

| 任务                               | 差的最后一步                                                             | 解除条件                                                         |
| ---------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| T7.1 完善 CI 流程                  | 受保护分支上的 Actions 结果                                              | 推送到受保护分支并跑通                                           |
| T7.2 版本化镜像发布                | 从 GHCR 拉取固定版本并回退                                               | GHCR 凭据（本机 `403`、主机 `denied`；镜像本身已在主机实跑通过） |
| T7.3 云端部署与回滚                | 公网 DNS/TLS 与真实 OAuth（Cloud Mode 本身已在主机实跑通过，2026-08-20） | ②③                                                               |
| T7.4 备份与保留策略                | 定时调度、异地副本                                                       | ①                                                                |
| T7.6 隐私优先监控                  | 真实部署日志抽查                                                         | ①                                                                |
| T7.7 文档与运行手册同步            | 本地文档已同步；云端流程仍依赖 T7.3                                      | ①                                                                |
| T8.2 双模式端到端验收              | 真实 GitHub 登录、生产备份恢复与回滚                                     | ①③                                                               |
| T8.4 安全与隐私发布审查            | 真实部署日志复核                                                         | ①                                                                |
| T8.5 切换入口并归档旧站（GATE-10） | 生产冒烟与回滚路径验证                                                   | ①②③                                                              |

四类前置条件：

1. **能连上云主机。** 2026-08-20 实测：主机健康、云防火墙放行 22、外部 IP 仍在正常连入，但开发机到它的路径不通。排查方法见 T8.12 与两份云端 Runbook；换一个网络是最快的验证。
2. **镜像仓库凭据。** 拉取 `ghcr.io/cr330326/agent-learning-hub` 需要 GitHub token。
3. **域名与 GitHub OAuth App。** `LIGHTHOUSE_DOMAIN`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`。Cloud Mode 的登录链路没有真实凭据就起不来，站点公开可访问也需要维护者本人决定。
4. **推送权限。** 受保护分支的 CI 结果。

前置条件 2、3、4 按约定由维护者本人操作，自动化脚本不代持凭据、不动腾讯云控制面（见 [lighthouse-automation 第 1 节](../deploy/lighthouse-automation.md#1-自动化边界)）。

## 13. 需求到任务追踪

| 规格域      | 主要任务                                                        |
| ----------- | --------------------------------------------------------------- |
| IA / PAGE   | T1.2—T1.4、T2.1—T2.4、T4.7、T8.3、T8.6、T8.9                    |
| CAT         | T0.2、T1.2—T1.5、T3.4、T8.8、T8.10                              |
| RES         | T3.1—T3.3、T5.1—T5.3                                            |
| READ        | T2.5、T4.4、T5.1、T5.3、T8.6、T8.7、T8.8、T8.9                  |
| AUTH        | T4.2、T4.3、T4.5、T6.7、T8.4、T8.12                             |
| STATE       | T4.1、T4.4—T4.8、T8.9                                           |
| SEARCH      | T6.1—T6.3、T6.6、T8.9                                           |
| MAT         | T6.4—T6.7                                                       |
| DATA        | T4.8                                                            |
| ADMIN       | T6.7、T7.6                                                      |
| DEPLOY      | T0.2、T3.3、T4.3、T5.4、T7.1—T7.3、T8.11                        |
| SEC / PRIV  | T4.2、T4.5、T4.8、T5.1、T7.6、T8.4、T8.9                        |
| OPS         | T4.1、T7.3—T7.5、T8.12                                          |
| NFR         | T0.3、T2.1、T2.5、T7.1、T7.6、T8.3、T8.6、T8.7、T8.9、T8.12     |
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
