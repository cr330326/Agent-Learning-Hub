# Agent Learning Hub 实施任务清单

## T9.10 飞书主导的本机聚合试运行（2026-11-15）

用户已在补充访谈 R4 确认整体方案，ADR 0013 为 accepted。

| 子任务 | 内容 | 状态 |
| ------ | ---- | ---- |
| T9.10a | 同步决策、规格和实施任务，DISC-028～031 | ✅ 已记录 |
| T9.10b | 飞书九表与 openspace 采集结果映射、授权读取与真实历史导入 | ⏳ 实施中 |
| T9.10c | 聚合源内容发布、多来源优先级、URL 修订稳定引用与幂等 | ⏳ 待实施 |
| T9.10d | 五分钟同步、保留筛选的自动刷新、最近同步与异常显示 | ⏳ 待实施 |
| T9.10e | 双模式门禁、独立状态 e2e、UI/功能走查及截图、Docker 周期同步验收 | ⏳ 待验收 |

需求映射为 DISC-028 → b/c，DISC-029 → c，DISC-030 → d，DISC-031 → e。

**最近复核**　2026-11-15 OpenCode 整课连续阅读与 41 个课程入口同类排查完成（T8.21、T8.22），新镜像双模式各 230 单测、Docker E2E、110 页及截图验证通过，已更新本机试运行。此前已补齐日报冻结前人工更正与展示快照（T9.5a），r14 双模式各 225 单测、Docker E2E 和截图复验通过。飞书九表同步、阅读器、模型限额及首轮质量校准、收录格式和 App 真实 PR 创建/幂等已完成。PR #1 未合并，T9.7c 的四文件 CI 修复已由用户确认并追加，远程五项 CI 全部通过；10 条素材副本、供应商账单、合并发布和公网运维仍待完成。
**配套**：[产品规格](./spec.md) · [技术方案](./plan.md) · [Phase 7 交付文档](../deploy/phase-7-delivery-deployment-operations.md) · [验收报告](../acceptance/)

**当前本机运行**　2026-11-15 已将 `agent-learning-hub-trial` 三个容器升级至 `aggregation-20261115-r7`（聚合验收见 T9.10），Local `127.0.0.1:3003`、Cloud `127.0.0.1:3002`。OpenCode 整课 110 个页面、旧链接转发与上下节通过当前 3003 实测；账户和学习记录核验一致。[整课验收](../acceptance/course-continuity-2026-11-15.md) · [此前清理记录](../acceptance/docker-cleanup-and-mac-trial-2026-11-15.md)。

## 1. 进度总览

既有学习产品完成情况见下表及历史证据。2026-11-15 确认资讯与学习双入口、自动采集、摘要、日报、课程收录 PR 与独立资讯库，新增 Phase 9 实施工作。当前资讯扩展已完成四类适配器、摘要预算、发现与日报、个人资讯状态和管理后台的本地实现与容器验证。凭据配置后已验证本机真实 OAuth、飞书九表字段映射和两轮全量同步，以及限定单仓库的 GitHub App 权限；模型费用、PR 发布与长期无人值守运行仍待验收。既有外部上线条件需要在实际发布时重新核实。

下表按当前任务行统计，包含续验子项；父任务尚未满足全部条件时，不因子项完成自动关闭。旧基线的 52/61 属于早期任务范围，不再作为当前总数。Phase 9 逐项证据见第 4 节。

| Phase                  | 完成        | 状态                |
| ---------------------- | ----------- | ------------------- |
| 0 基线与实施护栏       | 3 / 3       | ✅                  |
| 1 应用骨架与内容模型   | 5 / 5       | ✅                  |
| 2 公开网站与视觉迁移   | 5 / 5       | ✅                  |
| 3 云端内容模式         | 4 / 4       | ✅                  |
| 4 身份与学习状态       | 8 / 8       | ✅                  |
| 5 本地 Docker 与阅读器 | 5 / 5       | ✅                  |
| 6 搜索与素材新鲜度     | 7 / 7       | ✅                  |
| 7 交付、部署与运维     | 1 / 7       | ⏳ 外部条件阻塞     |
| 8 功能对等与正式切换   | 18 / 22     | ⏳ 4 项未完成       |
| 9 云端资讯与学习衔接   | 13 / 17     | ⏳ 计费、发布与公网验收 |
| **当前任务合计**       | **69 / 83** | 14 项未完成，含父任务与续验子项 |

### 1.1 历史基线与最新证据

最新阅读器补验见[OpenCode 整课连续阅读](../acceptance/course-continuity-2026-11-15.md)：双模式各 230 单测与 11 工具测试，Docker Cloud E2E 47 项及 Local E2E 通过；点击 Local 29/29、Cloud 24 通过/4 跳过，版式 Local 54 张/Cloud 63 张均 0 finding。当前 3003 的 110 页、上下节及旧链接全部通过，八张专项截图逐张查看。41 个课程入口同类排查完成，20 个候选待逐门策展。

最新补验见[日报人工更正冻结契约复验](../acceptance/edition-editorial-freeze-2026-11-15.md)：r14 双模式各 225 单测、11 工具测试，Cloud Docker E2E 47 项与 Local 状态 E2E 通过；点击 Cloud 27 通过/3 项模式不适用、Local 29/29；Cloud 移动版式 21 张/0 finding，专项六张截图全部实际查看。冻结前人工更正进入历史卡片和详情，之后更正、重算、失败与撤下均有回归，旧格式兼容。

模型与 PR 补验见[真实模型校准与收录预检](../acceptance/model-quality-and-curation-2026-11-15.md)：r13 双模式各 222 单测与 11 工具测试、Cloud Docker E2E 47 项及 Local 状态 E2E 通过；Cloud 版式 63 张/0 finding、点击 Cloud 26 通过/3 项模式不适用、Local 28/28，日报手机日期断行修复并补拍截图；六个最终真实模型/合成对照正常分类并校准日报准入，供应商 16-token 限额实测生效，账单仍未核对。用户确认后由 GitHub App 创建[收录 PR #1](https://github.com/cr330326/Agent-Learning-Hub/pull/1)，重复执行未新增 PR，临时令牌已撤销；首次 CI 的基线问题、修复与远程通过证据见[修复及远程验收](../acceptance/curation-ci-repair-review-2026-11-15.md)。下文同日 r7/r9/r14/r15 保留各自范围。

最新续验见[素材、阅读器与模型限额续验](../acceptance/material-reader-model-recovery-2026-11-15.md)：最终镜像 `verification-20261115-r9`；双模式各 220 单测与 11 工具测试、Cloud E2E 47 项及 Local 状态 E2E 通过；Cloud/Local 版式 63/54 张、均 0 finding；点击回归 Cloud 25 通过/3 项模式不适用、Local 27/27。主文件缺失可读章节与逐章来源已复验。下方同日 r7/r14/r15 记录保留各自当时范围。

| 层级             | 结果                                                                                                                                                                                                               | 日期       | 证据                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:cloud`    | ✅ 158 单测 + 11 工具测试；内容审计 0 errors / 1821 warnings；生产构建通过（6 条非阻塞 Turbopack 警告）                                                                                                            | 2026-10-17 | 本次复核                                                                                                                                                      |
| `check:local`    | ✅ 同上；内容审计 0 errors / 1822 warnings（1 条 `local-material-root-unavailable`，本机未挂载素材库）                                                                                                             | 2026-10-17 | [content-audit-local](../../code/reports/content-audit/content-audit-local.md)                                                                                |
| 生产依赖审计     | ✅ `npm audit --omit=dev --audit-level=high` 报告 0 vulnerabilities（next 16.4.0）                                                                                                                                 | 2026-10-17 | 本次复核；CI 同一命令见 [quality.yml](../../.github/workflows/quality.yml)                                                                                    |
| 端到端 · Cloud   | ✅ 29/29，原生文件系统与共享卷容器两种拓扑                                                                                                                                                                         | 2026-08-20 | T8.12                                                                                                                                                         |
| 端到端 · Local   | ✅ 状态生命周期、seed/resume/fallback/mobile                                                                                                                                                                       | 2026-08-25 | [local-e2e-2026-08-25](../acceptance/local-e2e-2026-08-25.md)                                                                                                 |
| 界面走查 · Local | ✅ 48 次抓取 / 0 finding                                                                                                                                                                                           | 2026-08-28 | [ui-review](../../code/reports/ui-review/ui-review.md)                                                                                                        |
| 功能回归 · Local | ✅ 23/23                                                                                                                                                                                                           | 2026-08-28 | [functional-regression](../../code/reports/functional-regression/functional-regression.md)                                                                    |
| 界面走查 · Cloud | ✅ 48 次抓取 / 0 finding（384 条目录，含 4 列筛选栏后的目录页）                                                                                                                                                    | 2026-10-17 | [ui-review-cloud](../../code/reports/ui-review-cloud/ui-review.md)                                                                                            |
| 功能回归 · Cloud | ✅ 23/23（新增阶段筛选断言；`track=application&access=unavailable` 仍为空组合）                                                                                                                                    | 2026-10-17 | [functional-regression-cloud](../../code/reports/functional-regression-cloud/functional-regression.md)                                                        |
| 正式本地镜像     | ✅ `agent-learning-hub:local-20260825`：命名卷重启、空素材回退、HTTP E2E                                                                                                                                           | 2026-08-25 | [local-e2e-2026-08-25](../acceptance/local-e2e-2026-08-25.md)                                                                                                 |
| 本地 Docker 全量 | ✅ 镜像构建、走查 48 抓取 / 0 finding、回归 21/24（3 条素材缺失跳过）、local e2e、cloud e2e 29/29、卷重启保留                                                                                                      | 2026-10-17 | [docker-local-2026-10-17](../acceptance/docker-local-2026-10-17.md)                                                                                           |
| 目标主机         | ✅ 恢复演练 16/16（含三组反向对照）；Cloud Mode 回环运行通过                                                                                                                                                       | 2026-08-20 | [restore-drill-host](../../code/reports/restore-drill-host/restore-drill.md) · [cloud-host-verify](../../code/reports/cloud-host-verify/cloud-host-verify.md) |
| 目录漂移         | ✅ 0 条失效路径（434 条声明路径：0 可自动搬迁 / 0 待定 / 0 已删除）；⚠️ 432 条目无上游回退、52 个仓库待确认                                                                                                        | 2026-10-10 | [catalog-drift](../../code/reports/materials/catalog-drift.md)                                                                                                |
| 审查修复 R01–R10 | ✅ 双模式 check（177 单测 + 11 工具测试）全绿；Local/Cloud e2e 全过（Cloud 33 项）；`drill:restore` 16/16；audit:ui 48 抓取 / 0 finding；audit:functional 21/24（3 条本机素材缺失跳过）；Docker 镜像构建并回环验证 | 2026-10-24 | 本次修复轮；逐项证据见第 4 节 T8.18 与 [REVIEW.md](../../REVIEW.md) 第 5 节                                                                                   |

数量类证据都是当日快照；以对应命令重新生成的报告为准。

2026-11-15 最新续验见 [本地功能补全与 Docker 复验](../acceptance/local-verification-2026-11-15.md)：飞书首次接入流程补全，真实九表两轮完整分页与幂等通过，T9.2 完成；最终镜像 `verification-20261115-r7`；双模式各 214 单测与 11 工具测试、Cloud e2e 47 项、Local e2e 通过；版式 Cloud/Local 63/54 张，均 0 finding；点击 Cloud 24 通过/2 项模式不适用，Local 25/25；阅读完成状态、笔记清空及截图证据见报告。下方 r14/r15 记录保留其当时范围。

2026-11-15 本轮证据见 [本地验收记录](../acceptance/cloud-discovery-local-2026-11-15.md)：双模式 check 均通过 209 项单测、11 项工具测试及生产构建；Cloud 容器登录与状态 e2e 47 项、Local 状态 e2e 通过；Cloud/Local 版式 57/48 张截图均 0 finding；功能回归为 Cloud 22 通过/2 项模式不适用、Local 25/25。最终本地镜像为 `agent-learning-hub:phase9-20261115-r14`，双库容器恢复及三组反向对照通过；Lighthouse 资讯配置、私钥挂载、整对备份健康、独立维护容器与候选卷恢复已补验，见[维护链路复核](../acceptance/cloud-discovery-operations-local-2026-11-15.md)。真实服务与公网证据另验。

## 2. 待办与阻塞

### 2.1 仓库内实施工作

Phase 9 本轮续验补齐飞书首次字段发现与下拉映射；九个子表已完成真实全表分页和第二轮幂等同步，T9.2 关闭。飞书验收只读上游，配置、资讯和演示学习状态位于隔离测试库，未导入日常实例；后续真实模型调用使用另一个独立验收库，费用与回执见最新补验。[飞书及状态复验](../acceptance/local-verification-2026-11-15.md) 记录最终镜像、双模式门禁、容器 e2e 与截图结果。

本机环境文件仍为 `/Users/vsh9p8q/.agent-learnning/environments/local/.env`，根目录 `.env` 为符号链接。已有 GitHub OAuth、GitHub App 与 DeepSeek 配置证据见[凭据验收](../acceptance/cloud-credentials-local-2026-11-15.md)和[DeepSeek 调用验收](../acceptance/deepseek-live-2026-11-15.md)。日常 worker 尚未重载模型配置，固定 1/4 费率在高峰会低估预算。首轮模型质量和真实 GitHub App PR 创建/幂等已补验；后续仍需供应商账单核对、PR 的合并与版本发布（CI 已修复通过）、上游写表任务持续运行和公网运维证据，T9.4、T9.7～T9.9 保留 ⏳。

当前素材库另有 T8.19：初始 38 条失效路径，前轮修复 21 条；本轮根据原仓库提交人工替换 4 条现行文档、将 3 个已删除实验包明确归档为上游历史入口，剩余 10 条属于整个本地副本缺失。缺失资料已有准确上游回退，物理恢复仍未完成；未以同名文件猜测替换。阅读器与模型限额修复分别见 T8.20、T9.4a。

既有 R01–R10 已于 2026-10-24 关闭，见 T8.18。REVIEW.md 的条件性缺口按原适用条件处理。

### 2.2 外部条件阻塞

| 任务                    | 差的最后一步                                                | 解除条件 |
| ----------------------- | ----------------------------------------------------------- | -------- |
| T7.1 完善 CI 流程 | PR 五项 CI 已通过；main.protected=false，仍需维护者配置保护规则 | ④ |
| T7.2 版本化镜像发布 | 远程无 tag/Release；GHCR 匿名 401/403，仍缺受权拉取固定版本及回退 | ② |
| T7.3 云端部署与回滚     | 公网 DNS/TLS 与真实 OAuth                                   | ①②③      |
| T7.4 备份与保留策略     | 定时调度、异地副本                                          | ①        |
| T7.6 隐私优先监控       | 真实部署日志抽查                                            | ①        |
| T7.7 文档与运行手册同步 | 云端流程随 T7.3 实际执行后复核                              | ①        |
| T8.2 双模式端到端验收   | 真实 GitHub 两用户登录、生产备份恢复与版本回滚              | ①③       |
| T8.4 安全与隐私发布审查 | 真实部署日志复核                                            | ①        |
| T8.5 切换入口并归档旧站 | 生产冒烟与回滚路径验证（GATE-10）                           | ①②③      |

四类外部条件（②③④ 按约定由维护者本人操作，自动化脚本不代持凭据，见 [lighthouse-automation 第 1 节](../deploy/lighthouse-automation.md#1-自动化边界)）：

1. **能连上云主机**：2026-08-20 主机与云防火墙均正常，但开发机到主机的网络路径不通；排查方法见两份云端 Runbook，换一个网络是最快的验证。
2. **固定版本与镜像仓库身份**：2026-11-15 远程 tags/releases 为空，既定 `v0.1.0` 的 GHCR 匿名 manifest/token 请求返回 401/403；仍需维护者确认固定发布版本并完成受权拉取与回退。状态码不作为镜像不存在的证据。[复核记录](../../code/reports/delivery-check-2026-11-15/delivery-check.md)。
3. **域名与 GitHub OAuth App**：`LIGHTHOUSE_DOMAIN`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`。
4. **分支保护**：2026-11-15 API 显示 main.protected=false，需维护者配置保护规则；已创建的 PR 触发 CI 不等于受保护分支验收通过。

资讯扩展已通过三份 Base、九个子表的字段及记录 API 抽样读取，以及目标仓库 GitHub App 签名、安装令牌和单仓库权限验证。九表完整字段映射与两轮分页同步已于本轮补验；首轮真实模型调用及 App PR 创建已补验；仍需既有定时写入任务的持续运行条件、供应商账单、PR 的合并与版本发布（CI 已修复通过），以及公网部署条件。本机单用户 OAuth 成功不替代公网或两用户跨会话验收。

## 3. 上线门槛

下表保留既有学习系统门槛与历史证据。资讯扩展上线还须完成 AC-11～AC-23，逐项结果由 T9.1～T9.9 提供，T9.9 汇总真实接入验收。

| 门槛    | 内容                                              | 状态 | 证据                                                                                                                     |
| ------- | ------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------ |
| GATE-01 | cloud-clean-room 构建和公开流程通过               | ✅   | CI clean-room 作业；2026-08-11 隔离镜像实测                                                                              |
| GATE-02 | 本地 Docker 阅读、搜索和进度保存通过              | ✅   | 2026-08-11 隔离 Compose；2026-08-25 正式镜像复验；2026-10-17 [Docker 全量复验](../acceptance/docker-local-2026-10-17.md) |
| GATE-03 | 云端与本地使用相同课程 ID、schema 和状态规则      | ✅   | 双模式同一构建与测试                                                                                                     |
| GATE-04 | 登录、笔记、收藏、成果、导出和删号集成测试通过    | ✅   | `test:e2e:cloud` 29/29 + `test:e2e:local`（T8.12）                                                                       |
| GATE-05 | 路径回退、穿越保护和恶意 Markdown 测试通过        | ✅   | `local-file-access.test.ts`、`markdown.test.ts`、`local-content-resolver.test.ts`                                        |
| GATE-06 | 手机端核心学习流程通过                            | ✅   | [mobile-accessibility-2026-08-09](../acceptance/mobile-accessibility-2026-08-09.md)                                      |
| GATE-07 | SQLite 干净环境恢复演练通过                       | ✅   | 目标主机 16/16（[restore-drill-host](../../code/reports/restore-drill-host/restore-drill.md)）                           |
| GATE-08 | 新站覆盖旧站首版核心能力                          | ✅   | [legacy-parity-2026-08-09](../acceptance/legacy-parity-2026-08-09.md)                                                    |
| GATE-09 | 云端镜像不含 `local-courses/`、数据库、备份或秘密 | ✅   | CI 镜像扫描；2026-08-11 实测                                                                                             |
| GATE-10 | 部署、回滚、素材维护和故障恢复文档可由他人复现    | ⏳   | 云端流程尚未在真实主机完整执行（T7.3、T8.5）                                                                             |

## 4. 任务清单

状态：✅ 完成 · ⏳ 未完成。"规格"列为覆盖的 [spec.md](./spec.md) 需求或验收场景。

### Phase 0：基线与实施护栏

| 任务                        | 状态 | 规格                                  | 实现与证据                                                                                                        |
| --------------------------- | ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| T0.1 固化仓库基线报告       | ✅   | IA-005、CAT-004、AC-10                | `npm run audit:baseline` → [baseline](../../code/reports/baseline/baseline.md)；`baseline-report.test.mjs`        |
| T0.2 建立内容归属与忽略规则 | ✅   | CAT-001/002/005、DEPLOY-002、PRIV-001 | [content-boundaries.json](../content-boundaries.json) + `npm run audit:boundaries`；`content-boundaries.test.mjs` |
| T0.3 建立需求追踪和质量门禁 | ✅   | NFR-006、NFR-007                      | [testing-strategy.md](../testing-strategy.md)；[quality.yml](../../.github/workflows/quality.yml) 双模式矩阵      |

### Phase 1：应用骨架与内容模型

| 任务                            | 状态 | 规格                         | 实现与证据                                                                                                 |
| ------------------------------- | ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| T1.1 创建 Next.js 应用骨架      | ✅   | DEPLOY-001、NFR-004、NFR-006 | `code/` 工程与 [modules/README.md](../../code/modules/README.md)；`runtime-config.test.ts`、首页 HTTP 冒烟 |
| T1.2 定义内容 schema            | ✅   | IA-001~~005、CAT-001~~007    | `content-schema.ts`（Zod，类型同源）；`content-schema.test.ts`                                             |
| T1.3 创建内容目录和 Catalog API | ✅   | CAT-001~007、PAGE-003/004    | `catalog-api.ts`（`listItems`/`getItem`/`getStage`）；`catalog-api.test.ts`                                |
| T1.4 实现旧数据转换器           | ✅   | CAT-004、IA-005、AC-10       | `convert-legacy-content.mjs` + `legacy-content-converter.test.mjs`；已按 ADR 0006 废弃，仅作溯源           |
| T1.5 建立内容审计命令           | ✅   | CAT-007、ADMIN-001、IA-005   | `npm run audit:content`；`content-audit.test.ts`、`content-audit-cli.test.mjs`                             |

### Phase 2：公开网站与视觉迁移

| 任务                    | 状态 | 规格                                  | 实现与证据                                                                          |
| ----------------------- | ---- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| T2.1 全局布局与视觉系统 | ✅   | PAGE-001/007/008、NFR-001~005         | `site-chrome.tsx`、`globals.css`；移动端走查与 Lighthouse 无障碍 100                |
| T2.2 首页与九阶段路线页 | ✅   | IA-001~003、PAGE-001/002              | `app/page.tsx`、`app/roadmap/`；公开页面 HTTP 冒烟                                  |
| T2.3 课程目录与导览页   | ✅   | PAGE-003/004/007、CAT-005             | `app/courses/`，访问按钮统一取自 resolver                                           |
| T2.4 项目阶梯           | ✅   | IA-003、PAGE-005、STATE-005/006       | `app/projects/page.tsx`                                                             |
| T2.5 自有内容阅读器     | ✅   | READ-001、READ-004~~006、NFR-002~~005 | `markdown.ts` 白名单渲染；`markdown.test.ts` 含注入负向用例（渲染策略于 T8.6 修订） |

### Phase 3：云端内容模式

| 任务                            | 状态 | 规格                           | 实现与证据                                                                    |
| ------------------------------- | ---- | ------------------------------ | ----------------------------------------------------------------------------- |
| T3.1 定义 Content Resolver 接口 | ✅   | RES-001~010、DEPLOY-001        | `content-resolver.ts` 判别联合；访问策略表驱动测试                            |
| T3.2 实现 Cloud Adapter         | ✅   | RES-001~004、AC-01             | `content-resolver.test.ts` 覆盖四种访问策略                                   |
| T3.3 "无 local-courses"云端验证 | ✅   | RES-003、DEPLOY-002/008、AC-01 | `.dockerignore`；quality.yml 的 cloud-clean-room 作业构建无素材镜像并扫描边界 |
| T3.4 内容政策与贡献页面         | ✅   | CAT-005/006、RES-002、PRIV-003 | `/content-policy`、`/contribute`，全局页脚可达                                |

### Phase 4：身份与学习状态

| 任务                          | 状态 | 规格                                                | 实现与证据                                                                                                             |
| ----------------------------- | ---- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| T4.1 SQLite、迁移与数据访问层 | ✅   | STATE-010/011、OPS-001/002、DEPLOY-007/012          | `database.ts` 事务迁移、外键、WAL 版本校验；`database.test.ts`、`repository.test.ts`                                   |
| T4.2 云端 GitHub 登录         | ✅   | AUTH-001~003、SEC-003/004、PRIV-001/002             | Better Auth，仅 `read:user`，不存 provider token，会话 token 只存哈希；`better-auth*.test.ts`、`github-oauth*.test.ts` |
| T4.3 本地单用户身份           | ✅   | AUTH-004/005、DEPLOY-010/013                        | `local-auth.ts`；非回环绑定拒绝启动（`runtime-config.test.ts`、`local-auth.test.ts`）                                  |
| T4.4 进度与阅读位置           | ✅   | STATE-001~~004、STATE-009~~011、READ-002/003、AC-04 | `repository.ts`、`/api/state`；`state-route.test.ts`，容器重启后位置恢复                                               |
| T4.5 收藏与私人笔记           | ✅   | STATE-007/008、AUTH-006/007、PRIV-004、SEC-002      | 用户隔离、笔记 20,000 字符上限、CSRF、写请求限流；`rate-limit.test.ts`、`request-auth.test.ts`                         |
| T4.6 阶段成果与完成约束       | ✅   | STATE-005/006、AC-05                                | 无成果不能确认、删除成果后回到未完成；`repository.test.ts`                                                             |
| T4.7 学习面板                 | ✅   | PAGE-006、STATE-009、NFR-001                        | `learning-dashboard.tsx`，空状态入口与移动端布局                                                                       |
| T4.8 数据导出与删除账户       | ✅   | DATA-001~006、AC-06                                 | JSON / 笔记 Markdown 导出排除秘密；`DELETE MY ACCOUNT` 确认后级联删号；`data-export.test.ts`、`data-route.test.ts`     |

### Phase 5：本地 Docker 与阅读器

| 任务                        | 状态 | 规格                                      | 实现与证据                                                                                                     |
| --------------------------- | ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| T5.1 安全本地文件访问层     | ✅   | RES-008/009、READ-007/008、SEC-001、AC-03 | `local-file-access.ts`；13 项测试覆盖编码变体、绝对路径、空字节、`..`、符号链接逃逸                            |
| T5.2 Local Adapter          | ✅   | RES-005~010、AC-02                        | `local-content-resolver.test.ts`：命中、缺失回退、无上游、非法路径                                             |
| T5.3 扩展本地阅读器         | ✅   | READ-001~008、AC-02/03                    | `document-source.ts`、`/api/local-image`；源码视图退化；`local-document-source.test.ts`、`local-image.test.ts` |
| T5.4 Docker 与 Compose 配置 | ✅   | DEPLOY-001~~005、DEPLOY-010~~015          | `code/docker/` + `docker-deploy.sh`；只读素材挂载、命名卷持久化、健康检查                                      |
| T5.5 本地离线验收           | ✅   | DEPLOY-014、AC-02                         | Docker `--network none` 下健康检查、白名单搜索与本地阅读通过                                                   |

### Phase 6：搜索与素材新鲜度

| 任务                        | 状态 | 规格                           | 实现与证据                                                                 |
| --------------------------- | ---- | ------------------------------ | -------------------------------------------------------------------------- |
| T6.1 统一搜索索引模型       | ✅   | SEARCH-001/004/005/007         | `search-index.ts`；`search-index.test.ts` 断言私人笔记不进索引             |
| T6.2 云端搜索               | ✅   | SEARCH-001、SEARCH-004~006     | `/search` 关键词与阶段/轨道/访问方式过滤；clean-room 实测无本地章节        |
| T6.3 本地白名单章节索引     | ✅   | SEARCH-002/003/006、DEPLOY-014 | 只经条目声明读取章节，不扫描素材根；断网可搜                               |
| T6.4 `materials check`      | ✅   | MAT-001~003、MAT-008/009       | `materials-check.ts` 只读 Git 状态；`materials-check.test.ts` 覆盖六种分类 |
| T6.5 单课程安全更新         | ✅   | MAT-004~009、AC-07             | 只允许 clean + fast-forward + 显式 `--yes`；dirty 仓库实测被拒且工作区不变 |
| T6.6 路径审计与重新索引编排 | ✅   | MAT-002/007、SEARCH-006        | 更新后自动审计再重建索引；失败时保留旧快照                                 |
| T6.7 管理员健康页面         | ✅   | ADMIN-001~006、AUTH-007        | `admin-health.ts` 白名单鉴权，只返回聚合字段；`admin-health.test.ts`       |

### Phase 7：交付、部署与运维

详细目标、证据和"本地先行、云端后置"的顺序见 [Phase 7 交付文档](../deploy/phase-7-delivery-deployment-operations.md)。

| 任务                        | 状态 | 依赖                   | 规格                                      | 说明                                                                     |
| --------------------------- | ---- | ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| T7.1 完善 CI 流程 | ⏳ | T3.3、T4.8、T5.5、T6.7 | NFR-006、NFR-007、DEPLOY-002 | 真实 App PR 的计数和旧依赖基线已修复，远程五项 CI 全部通过（T9.7c）；2026-11-15 分支 API 返回 main.protected=false，保护规则仍待维护者配置。 |
| T7.2 版本化镜像发布 | ⏳ | T5.4、T7.1 | DEPLOY-002、DEPLOY-005 | 历史 `v0.1.0` 本地/主机构建保留原范围。2026-11-15 远程无 tag/Release，GHCR 匿名 401/403；缺受权拉取固定版本与回退，未发布新版本。[只读复核](../../code/reports/delivery-check-2026-11-15/delivery-check.md) |
| T7.3 云端部署和回滚流程     | ⏳   | T7.2                   | DEPLOY-004~009、OPS-005                   | Runbook 已就绪；缺公网 HTTPS、真实 OAuth 和回滚演练                      |
| T7.4 SQLite 备份与保留策略  | ⏳   | T4.1                   | OPS-001~006、AC-09                        | 备份工具与保留槽位已实现；缺定时调度与异地副本                           |
| T7.5 干净环境恢复演练       | ✅   | T7.4、T7.3             | OPS-006、AC-09                            | 目标主机 16/16。依赖中未完成的部分（调度、公网部署）不影响演练本身的判定 |
| T7.6 隐私优先监控           | ⏳   | T6.7、T7.3             | ADMIN-003~006、NFR-008、SEC-005、PRIV-003 | 匿名聚合与结构化日志已实现；缺真实部署日志抽查                           |
| T7.7 同步项目文档与运行手册 | ⏳   | T5.4、T6.6、T7.3       | IA-005、DEPLOY-001、MAT-002               | 本地文档已同步；云端流程需在 T7.3 实际执行后复核                         |

### Phase 8：功能对等与正式切换

| 任务                                        | 状态 | 规格                                                                       | 实现与证据 / 差的最后一步                                                                                                                                                                                                                                    |
| ------------------------------------------- | ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T8.1 新旧站功能对照                         | ✅   | AC-10                                                                      | [legacy-parity-2026-08-09](../acceptance/legacy-parity-2026-08-09.md)：七项旧站能力逐项映射，无静默删除                                                                                                                                                      |
| T8.2 双模式端到端验收                       | ⏳   | AC-01~10                                                                   | 本地证据齐全（[08-09](../acceptance/dual-mode-e2e-2026-08-09.md)、[08-11](../acceptance/local-e2e-2026-08-11.md)、[08-25](../acceptance/local-e2e-2026-08-25.md)）；缺真实 OAuth 两用户、生产恢复与回滚                                                      |
| T8.3 移动端与无障碍验收                     | ✅   | PAGE-008、NFR-001~005、AC-08                                               | [mobile-accessibility-2026-08-09](../acceptance/mobile-accessibility-2026-08-09.md)：390×844 全流程，阻断问题为零                                                                                                                                            |
| T8.4 安全与隐私发布审查                     | ⏳   | AUTH-005~~007、SEC-001~~005、PRIV-001~004                                  | 越权、CSRF、路径穿越、恶意 Markdown、限流、导出脱敏、镜像边界均已通过；缺真实部署日志复核                                                                                                                                                                    |
| T8.5 切换仓库入口并归档旧站                 | ⏳   | AC-09、AC-10                                                               | 根入口已指向 `code/`，旧站已加归档说明；缺固定版本发布、回滚记录与首轮生产观察                                                                                                                                                                               |
| T8.6 全站 UI 走查并修复缺陷                 | ✅   | PAGE-007、PAGE-009~~012、READ-009~~011、NFR-009/010                        | 修复 14 项（回环 hydration、HTML 被转义、目录不分页、枚举外泄等）；沉淀 `ui-review.mjs`（`npm run audit:ui`）                                                                                                                                                |
| T8.7 阅读器章节导航与点击式回归             | ✅   | READ-001、READ-012~014、NFR-011                                            | `resolveDocumentRelativePath()` 消除正文内链 404，补上下章；沉淀 `functional-regression.mjs`（`npm run audit:functional`）                                                                                                                                   |
| T8.8 补齐本地课程的章节声明                 | ✅   | READ-014、CAT-008                                                          | [ADR 0008](../adr/0008-chapter-content-has-a-single-owner.md) 单一归属：119 个单章条目退场并转发，重复声明归零并由 schema 强制                                                                                                                               |
| T8.9 复查全站界面与交互                     | ✅   | PAGE-002/011/013~019、SEARCH-008/009、READ-014、STATE-004/005、NFR-010/011 | 修复搜索结果重复、参数回显、导航"登录"、路线页无进度等 9 项；`StageProgressProvider` 单次快照；回归扩到 23 项                                                                                                                                                |
| T8.10 Catalog Drift 对账机制                | ✅   | MAT-010/011、CAT-007、READ-014                                             | [ADR 0006](../adr/0006-catalog-is-hand-maintained.md)、[ADR 0007](../adr/0007-catalog-drift-is-proposed-not-applied.md)；`catalog-drift.ts` + `materials drift`；`catalog-drift.test.ts`                                                                     |
| T8.11 脚本按运行位置分类与三份 Runbook      | ✅   | DEPLOY-016~018                                                             | [docs/deploy/README.md](../deploy/README.md#脚本按运行位置分类)、[local-manual.md](../deploy/local-manual.md)；云端两份 Runbook 逐节对应                                                                                                                     |
| T8.12 Cloud 登录 e2e 与恢复演练命令         | ✅   | NFR-007/012、OPS-006~008                                                   | `cloud-auth-state-http.mts`（29 项，真实登录）；`restore-drill.ts`（16 步，三组反向对照）；`lighthouse-deploy.sh restore-drill`                                                                                                                              |
| T8.13 修复首页目录规模统计漏计              | ✅   | PAGE-012                                                                   | 计数抽到 `modules/catalog/catalog-summary.ts`，首页补"待处理"分项；`catalog-summary.test.ts` 断言分项之和等于总数。实测 370+1+9+4 = 384                                                                                                                      |
| T8.14 课程目录筛选栏补阶段选项              | ✅   | PAGE-003                                                                   | `/courses` 增加阶段下拉与"阶段：…"回显；阶段页"到课程目录找更多"带 `?stage=`。筛选取 `item.stageIds` ∪ `stage.learningItemIds`，避免跳转后漏掉刚看过的卡片                                                                                                   |
| T8.15 处理素材库新一轮目录漂移              | ✅   | MAT-010/011、CAT-007、READ-014                                             | 2026-10-10 路径整理已完成（`c48079b`）；2026-11-15 素材再次变化，最新修复及缺口见 T8.19。本条历史完成状态不代表当前素材齐备。 |
| T8.16 在收敛后的目录上重跑 Cloud 走查与回归 | ✅   | NFR-010、NFR-011                                                           | 384 条目录、cloud 模式一次性实例（`127.0.0.1:3100` + 独立 SQLite）：[走查](../../code/reports/ui-review-cloud/ui-review.md) 48 次抓取 / 0 finding，[回归](../../code/reports/functional-regression-cloud/functional-regression.md) 23/23（新增阶段筛选断言） |
| T8.17 升级 Next.js 修复生产依赖安全公告     | ✅   | SEC-001、DEPLOY-002、NFR-006                                               | `next` 16.3.0 → 16.4.0（`3482ab2`）；`npm audit --omit=dev --audit-level=high` 报 0 vulnerabilities，CI 同一命令通过                                                                                                                                         |
| T8.18 按 REVIEW.md 修复 R01–R10 并复验      | ✅   | SEC-001~~005、STATE-003/007/008、OPS-006、AUTH-004/005、NFR-006/007        | 逐项见下表；回归断言已入各模块测试与 e2e 脚本，验证于 2026-10-24                                                                                                                                                                                             |
| T8.19 素材目录最新漂移复核 | ⏳ | MAT-010、MAT-011、RES-003 | 初始 38 条，前轮修复 21 条，本轮按原仓库提交替换 4 条现行文档、归档 3 个历史实验包；余下 10 条为本地仓库副本缺失，已补准确上游地址，恢复未完成；自动阈值与第三方工作区不变。[策展证据](../acceptance/material-reader-model-recovery-2026-11-15.md) · [目录漂移](../../code/reports/materials/catalog-drift.md) |
| T8.20 部分课程与章节来源回退 | ✅ | RES-005～010、READ-014、NFR-011 | 主文件缺失时按现有章节顺序打开可读章节；明确章节只解析自身路径与来源，正文出处随章变化，未知路径和逃逸仍拒绝。单测、r9 双模式 Docker E2E、浏览器断言及桌面/手机截图通过。[续验证据](../acceptance/material-reader-model-recovery-2026-11-15.md) |
| T8.21 OpenCode 整课连续阅读 | ✅ | READ-001、READ-012～014、CAT-008、NFR-011 | 按作者顺序补齐 108 个教学/附录页面与 2 个导览，九个旧 ID 转发；长目录、上下节、双模式 Docker、110 页实测与八张截图通过，已更新本机 3003。[验收](../acceptance/course-continuity-2026-11-15.md) |
| T8.22 本地课程同类断链审计 | ✅ | READ-012～014、CAT-008、MAT-010 | 41 个有效旧站课程卡完成声明、仓库边界和独立课节排查；20 个候选待逐门核对作者顺序，5 个集合与 6 个无可读基线单列，OpenCode 已修复。[逐项结果](../../code/reports/course-navigation-2026-11-15/other-course-audit.md) |

#### T8.22 运行补验与开放缺陷（2026-11-15）

按用户追加要求，当前 3003 实测全部 358 个本地条目、41 个课程入口和 518 个可读页面，24 个多页条目浏览器前后点击通过，八张截图已查看。除 OpenCode 外，40 个课程入口为 22 个多页、12 个单页、6 个无站内正文。详见[完整运行验证](../acceptance/local-course-navigation-audit-2026-11-15.md)。

作者目录核对确认五门主线课程仍待整改，T8.22 的审计完成状态只覆盖排查及记录。

- Hello-Agents 课程只声明 README 和前言，16 章正文独立打开时缺少上下节。
- claw0 只接入 README 和 s01，s02～s10 的九节尚未归入课程。
- learn-claude-code 的旧 12 节能翻页，作者当前 17 节中文目录尚未接入，需核对新版与旧版归属。
- Learn Harness Engineering 仅 README，14 讲正文需要补齐课程归属，其中新增两讲还未声明。
- 《驾驭工程：从 CC 到 AI Coding》仅 README 和前言，作者 SUMMARY 的 45 页中有 44 页尚未归入课程，其中四页尚未被目录声明。

#### T8.18 逐项关闭证据（2026-10-24）

| 编号 | 修复                                                                                                                        | 关闭证据                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01  | `dev:local` 等开发命令显式 `--hostname 127.0.0.1`；新增 `middleware.ts` 本地模式 Host 门禁 + `request-auth` 请求级回环校验  | `lsof` 仅 `127.0.0.1:3419`；伪造 Host `review.invalid:3419` 被 403、合法回环正常；`request-host.test.ts`、`request-auth.test.ts`、local e2e 原始探测 |
| R02  | `quality.yml` 增加 `workflow_call`；`release.yml` 发布 job `needs` 同 SHA 质量门禁，写权限收敛到 publish job                | 工作流 YAML 静态验证 + prettier 解析通过；真实 tag 触发需推送 GitHub 后验证（T7.1/外部条件 ④）                                                       |
| R03  | `next` 16.4.0 → 16.4.3、`zod` 4.1.12 → 4.6.7（精确版本），`playwright` 声明为 devDependency；`npm ci` 重建安装树            | `npm audit --omit=dev` 0 vulnerabilities；`npm ls --omit=dev` 退出 0 无 invalid；双模式 check、e2e、Docker 镜像、演练均在新安装树重跑                |
| R04  | 适配器实现事务：`BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` + AsyncLocalStorage 事务上下文 + 非事务调用排队，嵌套用 SAVEPOINT     | `better-auth-adapter.test.ts`：中途失败零残留、成功全提交、并发失败不回滚他人写入、事务期间外部写在其后执行、嵌套 savepoint 只回滚内层               |
| R05  | 认证查询下推参数化 SQL（字段白名单映射、token 哈希查找、LIKE 转义），不可映射条件回退 JS 路径                               | `EXPLAIN QUERY PLAN` 命中唯一索引（2,000 会话规模）；`buildAdapterWhereSql` 断言无字段名拼接；会话生命周期测试保持                                   |
| R06  | 写入对照目录校验（退场 ID 兼容）；笔记 200 条 / 512K 字、成果 100 条 / 256K 字累计预算；请求体 256KiB 流式上限              | `state-route.test.ts`（伪造 ID 400 且不落库、超大请求拒绝）、`repository.test.ts` 预算用例；双模式 e2e 新增伪造 ID 拒绝断言                          |
| R07  | 备份健康新增年龄/恢复验证阈值（默认 48h / 90 天，`BACKUP_MAX_AGE_HOURS`、`BACKUP_MAX_RESTORE_VERIFICATION_AGE_DAYS` 可调）  | `admin-health.test.ts` 可控时钟覆盖最新/超时/未来/无效时间/无备份/未验证/已验证；admin 页显示中文降级原因                                            |
| R08  | 恢复安装改为 `link()` 原子 no-clobber；拒绝带 `-wal`/`-shm`/`-journal` 侧车的目标                                           | `backup.test.ts`：并发恢复仅一个成功、被拒目标逐字节不变、侧车目标拒绝；`drill:restore` 16/16（三组反向对照保留）                                    |
| R09  | 新建状态库目录 0700、库与 WAL/SHM 0600（仅限本进程新建文件，已有库不动）                                                    | `state-store.test.ts` umask 0 下实测 0700/0600；既有库权限不被改写；维护容器同卷备份恢复经演练验证                                                   |
| R10  | 全局 `nosniff`/`X-Frame-Options: DENY`/CSP `frame-ancestors 'none'`；state/data/session/auth/admin 响应 `private, no-store` | 生产构建实测响应头；public smoke 断言 HTML 三头；双模式 e2e 断言 state 200/401/400 均不可缓存；`next start` 3417/3418 与 Docker 实例复验             |

### Phase 9 云端资讯与学习衔接

本轮按已确认方案开发。任务状态以当前代码与验证范围填写，真实接入条件另列。

| 任务                        | 状态 | 需求与场景                                                                                                 | 实施与验收证据要求                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T9.0 确认设计并同步事实源   | ✅   | DISC-001～027                                                                                              | 2026-11-15 完成 Q1–Q16、规格、架构、规则、术语及 ADR 同步；11 份文档链接路径、28 个本地章节引用、27 项需求任务覆盖、13 个验收场景与 16 项决定映射校验通过，`git diff --check` 通过。验证范围为文档                                                                                                                                                |
| T9.1 资讯数据与任务基础     | ✅   | DISC-019、DISC-020；AC-19                                                                                  | `modules/discovery/database.ts`、`jobs.ts` 与 `jobs.test.ts` 已实现并验证迁移重开、唯一键、跨连接领取、过期租约隔离、阶段进度恢复与预算等待；Cloud worker 容器健康通过                                                                                                                                                                            |
| T9.2 飞书接入与历史同步     | ✅ | DISC-002、DISC-003、DISC-004、DISC-005、DISC-007、DISC-008、DISC-026；AC-12、AC-13                         | 首次空映射读取字段、中文下拉选择和稳定 ID 保存已实现，切换 Base/子表清除旧选项；真实九表每轮 31 页、11419 条来源记录、11416 个版本，第二轮版本不增加，宿主机及独立 Docker 卷复验通过；断点、修订与删除核对保留既有测试。[本轮证据](../acceptance/local-verification-2026-11-15.md) |
| T9.3 公开信源与内容身份     | ✅   | DISC-002、DISC-006、DISC-009、DISC-026；AC-12、AC-13、AC-14                                                | 四类适配器、确定性身份、多来源、指标观测、出站校验与维护者确认的相似事件合并已有实现和测试；最终镜像 worker 实采 Anthropic 24 条、LangChain 20 条卡片（16 条唯一原文），均完成列表分页与持久化；当前覆盖可访问列表，不宣称网站全部历史                                                                                                            |
| T9.4 摘要、评估与发布处理 | ⏳ | DISC-010、DISC-011、DISC-012、DISC-021、DISC-022；AC-14、AC-19、AC-20 | 处理、回执与预算已实现；首轮六样本真实质量与日报准入已校准，供应商限额实测通过（T9.4a/b）。余额查询尚未形成账单扣费证明，实际费用核对待完成。[最新证据](../acceptance/model-quality-and-curation-2026-11-15.md) |
| T9.4a 模型输出限额请求修复 | ✅ | DISC-021；AC-19、AC-20 | 默认 `max_tokens`，显式兼容字段、非法配置保护、2048 token 预算与请求一致；请求体、部署传输与双模式门禁通过，后续供应商 16-token 限额实测生效，见 T9.4b。账单核对仍独立待验收。[修复](../acceptance/material-reader-model-recovery-2026-11-15.md) · [真实探针](../acceptance/model-quality-and-curation-2026-11-15.md) |
| T9.4b 首轮真实模型与日报准入校准 | ✅ | DISC-010、DISC-011、DISC-012、DISC-021；AC-14、AC-15、AC-19 | 三篇真实文章和三条合成对照复验；中文标题、原文依据、空主题 off-topic、注入忽略、回执复用及准入筛选通过，三篇实文入选、低证据对照排除；16-token 供应商限额生效。账单差值未形成费用证明，父任务保留 ⏳。[实际样本](../acceptance/model-quality-and-curation-2026-11-15.md) |
| T9.5 发现、日报与搜索界面   | ✅   | IA-001、PAGE-001、SEARCH-001、DISC-001、DISC-013、DISC-014、DISC-015、DISC-026；AC-11、AC-15、AC-16、AC-23 | 双入口、主题、详情、中文筛选分页、固定日报、历史归档和撤下引用已有实现；主题地址解码及手机日期断行已修复。最新 r13 Cloud 版式 63 张/0 finding、点击 26 通过/3 项模式不适用，冻结摘要和低证据候选排除通过；桌面/手机已补拍并实际查看。[界面复验](../acceptance/model-quality-and-curation-2026-11-15.md#r13-截图复核与最终本地镜像)                                                                                                              |
| T9.5a 日报冻结前人工更正与展示快照 | ✅ | DISC-007、DISC-015；AC-15、AC-16 | 新期冻结有效人工字段、评分及状态；后续更正、模型重算/失败和撤下不改写或泄露旧期，旧两字段格式兼容，同摘要版本不跨期重复。新增回归先失败后通过；r14 双模式各 225 单测、容器 E2E、点击 Cloud 27/30（3 项模式不适用）/Local 29/29及六张实际查看截图通过。[复验](../acceptance/edition-editorial-freeze-2026-11-15.md) |
| T9.6 资讯个人状态与兼容迁移 | ✅   | DISC-001、DISC-016；AC-11、AC-17                                                                           | 学习状态迁移 v3，`discovery-state.ts` 与 `/api/state/discovery`，JSON 导出 v2、Markdown、用户隔离与删号级联；容器 Cloud e2e 47 项及 Local 状态 e2e 已通过，旧课程流程同时覆盖                                                                                                                                                                     |
| T9.7 管理后台与课程收录 PR | ⏳ | PRIV-002、DISC-003、DISC-017、DISC-018、DISC-025；AC-18、AC-23 | 后台信源、审核、预算、队列、收录预填与发布状态已有实现；真实 App 创建 PR #1 和重复执行幂等已通过，令牌撤销（T9.7b）。CI 基线修复已完成（T9.7c），维护者合并与固定版本上线仍待完成，不能以 PR 已创建代替发布。[真实验收](../acceptance/curation-review-2026-11-15.md) |
| T9.7a 收录 JSON 格式与最小差异 | ✅ | DISC-017；AC-18 | 复用仓库格式配置，保留原课程成员顺序与来源；预览由 10658 行降至 63 行，完整 schema、格式、回归与生产镜像内格式器通过。[预检](../acceptance/curation-review-2026-11-15.md) |
| T9.7b 真实 GitHub App PR 创建与幂等 | ✅ | DISC-017、DISC-018；AC-18 | 用户确认两文件预览后，App bot 创建 PR #1；第二次复用同一 PR，新增 PR 请求为 0，令牌 HTTP 204 撤销。未合并、未发布；CI 和版本上线分别保留待验收。[真实事件](../../code/reports/curation-review-2026-11-15/live-pr.json) |
| T9.7c 收录 PR 的 CI 基线修复 | ✅ | NFR-006、SEC-001、DISC-017；AC-18 | 用户确认后由 App 追加四文件至 PR #1，新提交 `a803bb7`；六文件逐字比对、令牌撤销。远程 CI 43707283649 五项全部通过，双模式各 177 单测/11 工具测试、Cloud 33 项/Local 状态 E2E、生产审计 0 漏洞及 clean-room 镜像均通过。未合并、未发布。[实际验收](../acceptance/curation-ci-repair-review-2026-11-15.md) |
| T9.8 单域名部署与两库恢复   | ⏳   | RES-004、DISC-018、DISC-019、DISC-023、DISC-024；AC-20、AC-21、AC-22                                       | Cloud 网页与 worker、独立命名卷、两库共同批次备份及恢复已实现；三组反向对照测试通过，两份 Runbook 与脚本分类已同步；Lighthouse 配置上传、私钥挂载、升级前双库备份与演练已接入；209 项单测含部署传输、库对保留、健康和失败演练保护。固定镜像的独立维护容器及恢复候选站点已本地通过，记录主机、容器、版本与耗时；公网 DNS/TLS、真实权限与回退待验收 |
| T9.9 综合与真实接入验收     | ⏳   | DISC-027；AC-11～AC-23                                                                                     | 双模式 check、一次性实例 e2e、UI/功能走查与截图、Docker、三份 Base 和九个表映射、公开信源、模型预算、真实登录与 PR、备份恢复                                                                                                                                                                                                                      |
| T9.9a 本地功能与 UI 续验 | ✅ | DISC-003、DISC-013、DISC-016、DISC-027；AC-11、AC-12、AC-17、AC-23 | 字段接入 UI、公开状态文案、双模式 check、隔离 Docker e2e、版式与点击回归及截图；真实外部发布仍由 T9.9 汇总。[本轮证据](../acceptance/local-verification-2026-11-15.md) |

## 5. 需求覆盖矩阵

✅ 已实现并有自动化或验收证据 · ⚠️ 部分满足或有未关闭缺陷 · ⏳ 待实施、待验收或依赖外部环境证据

2026-11-15 扩展矩阵如下。下方既有矩阵记录学习基线证据；IA-001、PAGE-001、RES-004、SEARCH-001、PRIV-002 的新增行为按本矩阵验收。

| 需求                                                       | 实现任务               | 验收场景                   | 状态                              |
| ---------------------------------------------------------- | ---------------------- | -------------------------- | --------------------------------- |
| DISC-001、DISC-013、DISC-014、DISC-015                     | T9.5、T9.6             | AC-11、AC-15、AC-16、AC-23 | ✅ 本地实现与容器验收             |
| DISC-026                                                   | T9.2、T9.3             | AC-12、AC-23               | ✅ 默认调度；⏳ 真实飞书时序      |
| DISC-002、DISC-003、DISC-004、DISC-005、DISC-007、DISC-008 | T9.2、T9.3、T9.7 | AC-12、AC-13、AC-23 | ✅ 真实飞书映射与双轮分页；⏳ PR 验收见 T9.7 |
| DISC-006、DISC-009                                         | T9.3                   | AC-13、AC-14               | ✅ 测试与公开来源容器验收         |
| DISC-010、DISC-011、DISC-012、DISC-021、DISC-022 | T9.4、T9.4a/b | AC-14、AC-19、AC-20 | ✅ 首轮真实质量、限额与回执；⏳ 供应商账单 |
| DISC-016                                                   | T9.6                   | AC-17                      | ✅ 双用户隔离、兼容导出与删号验证 |
| DISC-017、DISC-018、DISC-025 | T9.7、T9.7a/b/c、T9.8 | AC-18、AC-22、AC-23 | ✅ 真实 App PR、幂等与 CI；⏳ 合并发布及公网 |
| DISC-019、DISC-020、DISC-023                               | T9.1、T9.8             | AC-19、AC-21、AC-22        | ✅ 本地持久化、队列与双库恢复     |
| DISC-024                                                   | T9.8                   | AC-21、AC-22               | ✅ 本地 Compose；⏳ 公网条件      |
| DISC-027                                                   | T9.9                   | AC-11～AC-23               | ⏳ 待验收                         |
| IA-001、PAGE-001、RES-004、SEARCH-001、PRIV-002 的云端扩展 | T9.3、T9.5、T9.7、T9.8 | AC-11、AC-14、AC-18、AC-23 | ✅ 本地容器、UI 与点击；⏳ 公网及完整发布 |

| 需求                      | 实现任务                            | 主要验证                                                                                       | 状态                                   |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| AUTH-001~007              | T4.2、T4.3、T4.5、T6.7、T8.12       | `better-auth*.test.ts`、`local-auth.test.ts`、`admin-health.test.ts`、Cloud e2e                | ✅ 本地；⏳ 真实 OAuth（T7.3）         |
| IA-001~005                | T1.2、T2.2、T8.8                    | `content-schema.test.ts`、`item-redirect.test.ts`                                              | ✅                                     |
| PAGE-001~019（除下两项）  | T2.1~T2.4、T4.7、T8.6、T8.9         | `audit:functional`、`audit:ui`、移动端验收                                                     | ✅                                     |
| PAGE-003                  | T2.3、T8.14                         | 筛选栏阶段下拉、阶段页链接与 URL 参数一致                                                      | ✅                                     |
| PAGE-012                  | T8.6、T8.13                         | 分项之和等于总数（`catalog-summary.test.ts`）                                                  | ✅                                     |
| CAT-001~008               | T0.2、T1.2~T1.5、T8.8、T8.10        | `content-schema.test.ts`、`content-audit.test.ts`、`catalog-api.test.ts`                       | ✅                                     |
| RES-001~010               | T3.1、T3.2、T5.1、T5.2              | `content-resolver.test.ts`、`local-content-resolver.test.ts`、`local-file-access.test.ts`      | ✅                                     |
| READ-001~014              | T2.5、T5.3、T8.6~T8.9               | `markdown.test.ts`、`local-document-source.test.ts`、`local-image.test.ts`、`audit:functional` | ✅                                     |
| STATE-001~011             | T4.1、T4.4~T4.7、T8.9               | `repository.test.ts`、`state-route.test.ts`、双模式 e2e                                        | ✅ 本地；⏳ 真实 OAuth 跨会话（T8.2）  |
| SEARCH-001~009            | T6.1~T6.3、T6.6、T8.9               | `search-index.test.ts`、`audit:functional`（结果不重复）                                       | ✅                                     |
| MAT-001~009               | T6.4~T6.7                           | `materials-check.test.ts`                                                                      | ✅                                     |
| MAT-010~011               | T8.10、T8.15、T8.19 | `catalog-drift.test.ts`、`audit:materials`                                                     | ✅ 机制；⏳ 当前素材恢复见 T8.19 |
| DATA-001~006              | T4.8                                | `data-export.test.ts`、`data-route.test.ts`、双模式 e2e                                        | ✅                                     |
| ADMIN-001~006             | T6.7、T7.6                          | `admin-health.test.ts`、`privacy-monitor.test.ts`                                              | ✅ 本地；⏳ 真实部署日志（T7.6）       |
| DEPLOY-001~~005、010~~018 | T3.3、T4.3、T5.4、T5.5、T8.11       | CI clean-room、`docker-deploy.sh verify`、Runbook                                              | ✅；⏳ DEPLOY-005 的 GHCR 拉取（T7.2） |
| DEPLOY-006~009            | T7.3                                | 主机回环运行已验证                                                                             | ⏳ 公网 HTTPS 与 OAuth                 |
| SEC-001~005               | T4.2、T4.5、T4.8、T5.1、T8.4、T8.17 | 注入、CSRF、穿越、限流测试；依赖审计 0 漏洞                                                    | ⏳ 发布审查（T8.4）                    |
| PRIV-001~004              | T4.2、T4.5、T7.6                    | Better Auth 最小字段测试、导出脱敏                                                             | ✅                                     |
| OPS-001~~002、006~~008    | T4.1、T7.5、T8.12                   | `backup.test.ts`、`drill:restore`（目标主机 16/16）                                            | ✅                                     |
| OPS-003~005               | T7.3、T7.4                          | —                                                                                              | ⏳ 定时调度、异地副本、升级前快照      |
| NFR-001~005               | T2.1、T8.3                          | 移动端与无障碍验收                                                                             | ✅                                     |
| NFR-006~007、012          | T0.3、T7.1、T8.12                   | quality.yml 双模式门禁与 e2e                                                                   | ✅ 定义；⏳ 受保护分支结果（T7.1）     |
| NFR-008                   | T7.6                                | `operator-monitor.test.ts`、`privacy-monitor.test.ts`                                          | ⚠️ 仅本地                              |
| NFR-009~011               | T8.6、T8.7、T8.9、T8.16             | `audit:ui`、`audit:functional`                                                                 | ✅ 双模式                              |

| 验收场景 | 任务       | 状态                          | 验收场景 | 任务 | 状态            |
| -------- | ---------- | ----------------------------- | -------- | ---- | --------------- |
| AC-01    | T3.3       | ✅                            | AC-06    | T4.8 | ✅              |
| AC-02    | T5.2、T5.3 | ✅                            | AC-07    | T6.5 | ✅              |
| AC-03    | T5.1       | ✅                            | AC-08    | T8.3 | ✅              |
| AC-04    | T4.4、T8.2 | ✅ 本地；⏳ 真实 OAuth 两用户 | AC-09    | T7.5 | ✅ 目标主机演练 |
| AC-05    | T4.6       | ✅                            | AC-10    | T8.1 | ✅              |

## 6. 规则

**完成定义**：实现符合关联需求且不扩大首版范围；新增或修改的行为有可在 CI 与本地重复运行的测试；类型、格式、测试和生产构建通过；配置、命令、部署或内容维护的变化已同步文档；不提交 Token、数据库、备份、本地素材正文或其他秘密；涉及数据库的任务包含迁移与恢复说明；涉及双模式的任务验证两种模式，或说明为何只适用于一种。

**维护方式**：

- 任务完成时把状态改为 ✅，在"实现与证据"列写明代码位置和测试或报告链接；重大复核结论更新第 1 节，不追加流水账。
- 本地测试通过不能替代外部环境证据；外部条件未满足的任务保持 ⏳。
- 发现规格冲突时先修订 spec、plan 或 ADR，不在代码里形成隐式决定。
- 新增需求或任务时同步第 5 节矩阵。

**历史记录**：2026-09-18 之前的逐任务实施叙述（缺陷根因、排查过程、当时的中间数字）已从本文精简，完整版本见 `git show 1ed29d5:docs/plans/tasks.md`；决策依据见 [ADR](../adr/)，阶段性验收见 [docs/acceptance/](../acceptance/)。
