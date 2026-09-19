# Agent Learning Hub 实施任务清单

**最近复核**：2026-09-18（按现役 `code/` 重跑双模式质量门禁与生产依赖审计）
**配套**：[产品规格](./spec.md) · [技术方案](./plan.md) · [Phase 7 交付文档](../deploy/phase-7-delivery-deployment-operations.md) · [验收报告](../acceptance/)

## 1. 进度总览

**结论**：核心产品功能已全部实现，并通过本地代码级、原生生产构建和正式本地镜像验收。当前不能上线，原因有两类：

1. **仓库内（可立即处理）**：本次复核新增 5 项，其中 **T8.17 为 P0**——生产依赖审计出现 critical 级 Next.js 安全公告，CI 的依赖审计步骤会因此失败。
2. **仓库外（外部条件阻塞）**：9 项原始任务卡在云主机网络、镜像仓库凭据、域名与 OAuth、受保护分支四类条件上。

| Phase                  | 完成        | 状态                           |
| ---------------------- | ----------- | ------------------------------ |
| 0 基线与实施护栏       | 3 / 3       | ✅                             |
| 1 应用骨架与内容模型   | 5 / 5       | ✅                             |
| 2 公开网站与视觉迁移   | 5 / 5       | ✅                             |
| 3 云端内容模式         | 4 / 4       | ✅                             |
| 4 身份与学习状态       | 8 / 8       | ✅                             |
| 5 本地 Docker 与阅读器 | 5 / 5       | ✅                             |
| 6 搜索与素材新鲜度     | 7 / 7       | ✅                             |
| 7 交付、部署与运维     | 1 / 7       | ⏳ 外部条件阻塞                |
| 8 功能对等与正式切换   | 9 / 17      | ⏳ 3 项外部阻塞 + 5 项复核新增 |
| **合计**               | **47 / 61** | 上线门槛 9 / 10                |

### 1.1 最新证据

| 层级               | 结果                                                                                                    | 日期          | 证据                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:cloud`      | ✅ 155 单测 + 11 工具测试；内容审计 0 errors / 2003 warnings；生产构建通过（6 条非阻塞 Turbopack 警告） | 2026-09-18    | 本次复核                                                                                                                                                                    |
| `check:local`      | ✅ 同上；内容审计 0 errors / 2046 warnings（`local-path-missing` 43 条，见 T8.15）                      | 2026-09-18    | [content-audit-local](../../code/reports/content-audit/content-audit-local.md)                                                                                              |
| 生产依赖审计       | ❌ 1 critical（`next` 16.3.0）+ 1 high（`sharp` 0.35.3），见 T8.17                                      | 2026-09-18    | `npm audit --omit=dev --audit-level=high`                                                                                                                                   |
| 端到端 · Cloud     | ✅ 29/29，原生文件系统与共享卷容器两种拓扑                                                              | 2026-08-20    | T8.12                                                                                                                                                                       |
| 端到端 · Local     | ✅ 状态生命周期、seed/resume/fallback/mobile                                                            | 2026-08-25    | [local-e2e-2026-08-25](../acceptance/local-e2e-2026-08-25.md)                                                                                                               |
| 界面走查 · Local   | ✅ 48 次抓取 / 0 finding                                                                                | 2026-08-28    | [ui-review](../../code/reports/ui-review/ui-review.md)                                                                                                                      |
| 功能回归 · Local   | ✅ 23/23                                                                                                | 2026-08-28    | [functional-regression](../../code/reports/functional-regression/functional-regression.md)                                                                                  |
| 走查与回归 · Cloud | ⚠️ 51 / 0 与 22/22，但早于 08-28 目录收敛（报告中目录仍为 515 条），见 T8.16                            | 2026-08-13/14 | [ui-review-cloud](../../code/reports/ui-review-cloud/ui-review.md) · [functional-regression-cloud](../../code/reports/functional-regression-cloud/functional-regression.md) |
| 正式本地镜像       | ✅ `agent-learning-hub:local-20260825`：命名卷重启、空素材回退、HTTP E2E                                | 2026-08-25    | [local-e2e-2026-08-25](../acceptance/local-e2e-2026-08-25.md)                                                                                                               |
| 目标主机           | ✅ 恢复演练 16/16（含三组反向对照）；Cloud Mode 回环运行通过                                            | 2026-08-20    | [restore-drill-host](../../code/reports/restore-drill-host/restore-drill.md) · [cloud-host-verify](../../code/reports/cloud-host-verify/cloud-host-verify.md)               |
| 目录漂移           | ⚠️ 24 条失效路径（4 可自动搬迁 / 16 待定 / 4 已删除）、5 个未收录仓库、479 个条目无上游回退             | 2026-08-28    | [catalog-drift](../../code/reports/materials/catalog-drift.md)                                                                                                              |

数量类证据都是当日快照；以对应命令重新生成的报告为准。

## 2. 待办与阻塞

### 2.1 仓库内可立即处理（2026-09-18 复核新增）

| 优先级 | 任务  | 问题                                                                                                                                                         | 建议处置                                                                      |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| P0     | T8.17 | `next@16.3.0` 命中两条 RCE 公告（GHSA-p293-qw3h-jr36、GHSA-2xp9-vwfh-vxw4），`sharp@0.35.3` 命中 GHSA-rgj7-g3m4-5g8c；CI 的依赖审计步骤会失败，T8.4 无法通过 | 升级 `next` 与 `eslint-config-next` 至 ≥ 16.3.5，重跑双模式门禁、e2e 与走查   |
| P1     | T8.13 | 首页"课程条目"为全部在役条目，而"本地素材 / 站内文章 / 上游导览"三项漏计 1 个"待处理"条目，分项之和比总数少 1，违反 PAGE-012                                 | 补"待处理"分项，或改为明确说明分项不完备；给首页计数加断言                    |
| P1     | T8.15 | 素材库再次重组：本机审计 `local-path-missing` 由 29 升至 43；漂移报告有 4 条可自动搬迁、16 条待人工决定                                                      | 重跑 `npm run audit:materials`，读报告后 `--apply`，其余逐条人工处理          |
| P2     | T8.16 | Cloud 模式走查与回归证据早于 08-28 目录收敛，未覆盖退场条目转发后的公开页面                                                                                  | 在云端模式一次性实例上重跑 `audit:ui` 与 `audit:functional`，更新报告         |
| P2     | T8.14 | PAGE-003 要求目录可按阶段筛选：`/courses?stage=` 参数可用，但筛选栏没有"阶段"选项，阶段页的"到课程目录找更多"也不带阶段参数                                  | 筛选栏补阶段下拉并让阶段页链接带参数；或修订 PAGE-003 为"可经 URL 按阶段筛选" |

### 2.2 外部条件阻塞

| 任务                    | 差的最后一步                                             | 解除条件 |
| ----------------------- | -------------------------------------------------------- | -------- |
| T7.1 完善 CI 流程       | 受保护分支上的 Actions 结果（另需 T8.17 先修复依赖审计） | ④        |
| T7.2 版本化镜像发布     | 从 GHCR 拉取固定版本并回退                               | ②        |
| T7.3 云端部署与回滚     | 公网 DNS/TLS 与真实 OAuth                                | ①②③      |
| T7.4 备份与保留策略     | 定时调度、异地副本                                       | ①        |
| T7.6 隐私优先监控       | 真实部署日志抽查                                         | ①        |
| T7.7 文档与运行手册同步 | 云端流程随 T7.3 实际执行后复核                           | ①        |
| T8.2 双模式端到端验收   | 真实 GitHub 两用户登录、生产备份恢复与版本回滚           | ①③       |
| T8.4 安全与隐私发布审查 | 真实部署日志复核（另需 T8.17）                           | ①        |
| T8.5 切换入口并归档旧站 | 生产冒烟与回滚路径验证（GATE-10）                        | ①②③      |

四类外部条件（②③④ 按约定由维护者本人操作，自动化脚本不代持凭据，见 [lighthouse-automation 第 1 节](../deploy/lighthouse-automation.md#1-自动化边界)）：

1. **能连上云主机**：2026-08-20 主机与云防火墙均正常，但开发机到主机的网络路径不通；排查方法见两份云端 Runbook，换一个网络是最快的验证。
2. **镜像仓库凭据**：拉取 `ghcr.io/cr330326/agent-learning-hub` 需要 GitHub token。
3. **域名与 GitHub OAuth App**：`LIGHTHOUSE_DOMAIN`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`。
4. **推送权限**：受保护分支的 CI 结果。

## 3. 上线门槛

| 门槛    | 内容                                              | 状态 | 证据                                                                                           |
| ------- | ------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| GATE-01 | cloud-clean-room 构建和公开流程通过               | ✅   | CI clean-room 作业；2026-08-11 隔离镜像实测                                                    |
| GATE-02 | 本地 Docker 阅读、搜索和进度保存通过              | ✅   | 2026-08-11 隔离 Compose；2026-08-25 正式镜像复验                                               |
| GATE-03 | 云端与本地使用相同课程 ID、schema 和状态规则      | ✅   | 双模式同一构建与测试                                                                           |
| GATE-04 | 登录、笔记、收藏、成果、导出和删号集成测试通过    | ✅   | `test:e2e:cloud` 29/29 + `test:e2e:local`（T8.12）                                             |
| GATE-05 | 路径回退、穿越保护和恶意 Markdown 测试通过        | ✅   | `local-file-access.test.ts`、`markdown.test.ts`、`local-content-resolver.test.ts`              |
| GATE-06 | 手机端核心学习流程通过                            | ✅   | [mobile-accessibility-2026-08-09](../acceptance/mobile-accessibility-2026-08-09.md)            |
| GATE-07 | SQLite 干净环境恢复演练通过                       | ✅   | 目标主机 16/16（[restore-drill-host](../../code/reports/restore-drill-host/restore-drill.md)） |
| GATE-08 | 新站覆盖旧站首版核心能力                          | ✅   | [legacy-parity-2026-08-09](../acceptance/legacy-parity-2026-08-09.md)                          |
| GATE-09 | 云端镜像不含 `local-courses/`、数据库、备份或秘密 | ✅   | CI 镜像扫描；2026-08-11 实测                                                                   |
| GATE-10 | 部署、回滚、素材维护和故障恢复文档可由他人复现    | ⏳   | 云端流程尚未在真实主机完整执行（T7.3、T8.5）                                                   |

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
| T7.1 完善 CI 流程           | ⏳   | T3.3、T4.8、T5.5、T6.7 | NFR-006、NFR-007、DEPLOY-002              | 工作流已按模式跑门禁与 e2e；缺受保护分支上的运行结果                     |
| T7.2 版本化镜像发布         | ⏳   | T5.4、T7.1             | DEPLOY-002、DEPLOY-005                    | `v0.1.0` 镜像已构建并在主机运行；缺从 GHCR 拉取固定版本与回退            |
| T7.3 云端部署和回滚流程     | ⏳   | T7.2                   | DEPLOY-004~009、OPS-005                   | Runbook 已就绪；缺公网 HTTPS、真实 OAuth 和回滚演练                      |
| T7.4 SQLite 备份与保留策略  | ⏳   | T4.1                   | OPS-001~006、AC-09                        | 备份工具与保留槽位已实现；缺定时调度与异地副本                           |
| T7.5 干净环境恢复演练       | ✅   | T7.4、T7.3             | OPS-006、AC-09                            | 目标主机 16/16。依赖中未完成的部分（调度、公网部署）不影响演练本身的判定 |
| T7.6 隐私优先监控           | ⏳   | T6.7、T7.3             | ADMIN-003~006、NFR-008、SEC-005、PRIV-003 | 匿名聚合与结构化日志已实现；缺真实部署日志抽查                           |
| T7.7 同步项目文档与运行手册 | ⏳   | T5.4、T6.6、T7.3       | IA-005、DEPLOY-001、MAT-002               | 本地文档已同步；云端流程需在 T7.3 实际执行后复核                         |

### Phase 8：功能对等与正式切换

| 任务                                        | 状态 | 规格                                                                       | 实现与证据 / 差的最后一步                                                                                                                                                                               |
| ------------------------------------------- | ---- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T8.1 新旧站功能对照                         | ✅   | AC-10                                                                      | [legacy-parity-2026-08-09](../acceptance/legacy-parity-2026-08-09.md)：七项旧站能力逐项映射，无静默删除                                                                                                 |
| T8.2 双模式端到端验收                       | ⏳   | AC-01~10                                                                   | 本地证据齐全（[08-09](../acceptance/dual-mode-e2e-2026-08-09.md)、[08-11](../acceptance/local-e2e-2026-08-11.md)、[08-25](../acceptance/local-e2e-2026-08-25.md)）；缺真实 OAuth 两用户、生产恢复与回滚 |
| T8.3 移动端与无障碍验收                     | ✅   | PAGE-008、NFR-001~005、AC-08                                               | [mobile-accessibility-2026-08-09](../acceptance/mobile-accessibility-2026-08-09.md)：390×844 全流程，阻断问题为零                                                                                       |
| T8.4 安全与隐私发布审查                     | ⏳   | AUTH-005~~007、SEC-001~~005、PRIV-001~004                                  | 越权、CSRF、路径穿越、恶意 Markdown、限流、导出脱敏、镜像边界均已通过；缺真实部署日志复核，且需先完成 T8.17                                                                                             |
| T8.5 切换仓库入口并归档旧站                 | ⏳   | AC-09、AC-10                                                               | 根入口已指向 `code/`，旧站已加归档说明；缺固定版本发布、回滚记录与首轮生产观察                                                                                                                          |
| T8.6 全站 UI 走查并修复缺陷                 | ✅   | PAGE-007、PAGE-009~~012、READ-009~~011、NFR-009/010                        | 修复 14 项（回环 hydration、HTML 被转义、目录不分页、枚举外泄等）；沉淀 `ui-review.mjs`（`npm run audit:ui`）                                                                                           |
| T8.7 阅读器章节导航与点击式回归             | ✅   | READ-001、READ-012~014、NFR-011                                            | `resolveDocumentRelativePath()` 消除正文内链 404，补上下章；沉淀 `functional-regression.mjs`（`npm run audit:functional`）                                                                              |
| T8.8 补齐本地课程的章节声明                 | ✅   | READ-014、CAT-008                                                          | [ADR 0008](../adr/0008-chapter-content-has-a-single-owner.md) 单一归属：119 个单章条目退场并转发，重复声明归零并由 schema 强制                                                                          |
| T8.9 复查全站界面与交互                     | ✅   | PAGE-002/011/013~019、SEARCH-008/009、READ-014、STATE-004/005、NFR-010/011 | 修复搜索结果重复、参数回显、导航"登录"、路线页无进度等 9 项；`StageProgressProvider` 单次快照；回归扩到 23 项                                                                                           |
| T8.10 Catalog Drift 对账机制                | ✅   | MAT-010/011、CAT-007、READ-014                                             | [ADR 0006](../adr/0006-catalog-is-hand-maintained.md)、[ADR 0007](../adr/0007-catalog-drift-is-proposed-not-applied.md)；`catalog-drift.ts` + `materials drift`；`catalog-drift.test.ts`                |
| T8.11 脚本按运行位置分类与三份 Runbook      | ✅   | DEPLOY-016~018                                                             | [docs/deploy/README.md](../deploy/README.md#脚本按运行位置分类)、[local-manual.md](../deploy/local-manual.md)；云端两份 Runbook 逐节对应                                                                |
| T8.12 Cloud 登录 e2e 与恢复演练命令         | ✅   | NFR-007/012、OPS-006~008                                                   | `cloud-auth-state-http.mts`（29 项，真实登录）；`restore-drill.ts`（16 步，三组反向对照）；`lighthouse-deploy.sh restore-drill`                                                                         |
| T8.13 修复首页目录规模统计漏计              | ⏳   | PAGE-012                                                                   | 见 2.1                                                                                                                                                                                                  |
| T8.14 课程目录筛选栏补阶段选项              | ⏳   | PAGE-003                                                                   | 见 2.1                                                                                                                                                                                                  |
| T8.15 处理素材库新一轮目录漂移              | ⏳   | MAT-010/011、CAT-007、READ-014                                             | 见 2.1                                                                                                                                                                                                  |
| T8.16 在收敛后的目录上重跑 Cloud 走查与回归 | ⏳   | NFR-010、NFR-011                                                           | 见 2.1                                                                                                                                                                                                  |
| T8.17 升级 Next.js 修复生产依赖安全公告     | ⏳   | SEC-001、DEPLOY-002、NFR-006                                               | 见 2.1（P0）                                                                                                                                                                                            |

## 5. 需求覆盖矩阵

✅ 已实现并有自动化或验收证据 · ⚠️ 部分满足或有未关闭缺陷 · ⏳ 依赖外部环境证据

| 需求                      | 实现任务                            | 主要验证                                                                                       | 状态                                          |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| AUTH-001~007              | T4.2、T4.3、T4.5、T6.7、T8.12       | `better-auth*.test.ts`、`local-auth.test.ts`、`admin-health.test.ts`、Cloud e2e                | ✅ 本地；⏳ 真实 OAuth（T7.3）                |
| IA-001~005                | T1.2、T2.2、T8.8                    | `content-schema.test.ts`、`item-redirect.test.ts`                                              | ✅                                            |
| PAGE-001~019（除下两项）  | T2.1~T2.4、T4.7、T8.6、T8.9         | `audit:functional`、`audit:ui`、移动端验收                                                     | ✅                                            |
| PAGE-003                  | T2.3、T8.14                         | 仅 URL 参数可按阶段筛选                                                                        | ⚠️                                            |
| PAGE-012                  | T8.6、T8.13                         | 首页分项之和比总数少 1                                                                         | ⚠️ 缺陷                                       |
| CAT-001~008               | T0.2、T1.2~T1.5、T8.8、T8.10        | `content-schema.test.ts`、`content-audit.test.ts`、`catalog-api.test.ts`                       | ✅                                            |
| RES-001~010               | T3.1、T3.2、T5.1、T5.2              | `content-resolver.test.ts`、`local-content-resolver.test.ts`、`local-file-access.test.ts`      | ✅                                            |
| READ-001~014              | T2.5、T5.3、T8.6~T8.9               | `markdown.test.ts`、`local-document-source.test.ts`、`local-image.test.ts`、`audit:functional` | ✅                                            |
| STATE-001~011             | T4.1、T4.4~T4.7、T8.9               | `repository.test.ts`、`state-route.test.ts`、双模式 e2e                                        | ✅ 本地；⏳ 真实 OAuth 跨会话（T8.2）         |
| SEARCH-001~009            | T6.1~T6.3、T6.6、T8.9               | `search-index.test.ts`、`audit:functional`（结果不重复）                                       | ✅                                            |
| MAT-001~009               | T6.4~T6.7                           | `materials-check.test.ts`                                                                      | ✅                                            |
| MAT-010~011               | T8.10、T8.15                        | `catalog-drift.test.ts`                                                                        | ✅ 工具；⚠️ 当前漂移待处理                    |
| DATA-001~006              | T4.8                                | `data-export.test.ts`、`data-route.test.ts`、双模式 e2e                                        | ✅                                            |
| ADMIN-001~006             | T6.7、T7.6                          | `admin-health.test.ts`、`privacy-monitor.test.ts`                                              | ✅ 本地；⏳ 真实部署日志（T7.6）              |
| DEPLOY-001~~005、010~~018 | T3.3、T4.3、T5.4、T5.5、T8.11       | CI clean-room、`docker-deploy.sh verify`、Runbook                                              | ✅；⏳ DEPLOY-005 的 GHCR 拉取（T7.2）        |
| DEPLOY-006~009            | T7.3                                | 主机回环运行已验证                                                                             | ⏳ 公网 HTTPS 与 OAuth                        |
| SEC-001~005               | T4.2、T4.5、T4.8、T5.1、T8.4、T8.17 | 注入、CSRF、穿越、限流测试；依赖审计                                                           | ⚠️ 依赖审计失败（T8.17）；⏳ 发布审查（T8.4） |
| PRIV-001~004              | T4.2、T4.5、T7.6                    | Better Auth 最小字段测试、导出脱敏                                                             | ✅                                            |
| OPS-001~~002、006~~008    | T4.1、T7.5、T8.12                   | `backup.test.ts`、`drill:restore`（目标主机 16/16）                                            | ✅                                            |
| OPS-003~005               | T7.3、T7.4                          | —                                                                                              | ⏳ 定时调度、异地副本、升级前快照             |
| NFR-001~005               | T2.1、T8.3                          | 移动端与无障碍验收                                                                             | ✅                                            |
| NFR-006~007、012          | T0.3、T7.1、T8.12                   | quality.yml 双模式门禁与 e2e                                                                   | ✅ 定义；⏳ 受保护分支结果（T7.1）            |
| NFR-008                   | T7.6                                | `operator-monitor.test.ts`、`privacy-monitor.test.ts`                                          | ⚠️ 仅本地                                     |
| NFR-009~011               | T8.6、T8.7、T8.9、T8.16             | `audit:ui`、`audit:functional`                                                                 | ✅ Local；⚠️ Cloud 证据待重跑                 |

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
