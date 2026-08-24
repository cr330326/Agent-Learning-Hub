# Phase 7：交付、部署与运维

**状态**：本地优先；云端交付规划待本地功能和发布前置条件稳定后执行
**维护日期**：2026-08-24  
**任务状态入口**：[docs/plans/tasks.md](../plans/tasks.md#10-phase-7-交付部署与运维)  
**执行入口**：[docs/deploy/README.md](./README.md)

## 1. 文档职责与工作顺序

本文承接原来位于 `docs/plans/tasks.md` 的 Phase 7 详细内容，集中记录交付、部署、备份、恢复、监控和运行手册同步工作。它不是新的需求或数据契约：

- `docs/plans/spec.md` 定义产品需求和验收场景。
- `docs/plans/plan.md` 定义架构、数据、安全和部署边界。
- `docs/plans/tasks.md` 只保留任务状态、依赖、规格映射和本文件入口。
- 本目录的 [`README.md`](./README.md)、[`local-manual.md`](./local-manual.md)、[`production-manual.md`](./production-manual.md) 和 [`lighthouse-automation.md`](./lighthouse-automation.md) 负责可执行路径；本文负责 Phase 7 的拆解和证据汇总。

执行顺序采用本地优先：

1. 先完成并验证 `code/` 的本地功能、Cloud/Local 代码级质量门禁、一次性实例 E2E、浏览器走查和素材边界检查。
2. 再验证本机 Docker 新鲜构建、Local Mode 阅读/搜索/学习状态持久化，以及恢复工具的本地演练。
3. 只有本地证据稳定后，才由维护者本人准备 GHCR、域名、TLS、GitHub OAuth、云主机和服务器外备份等外部条件。
4. 云端部署、真实 OAuth、生产回滚和异地备份是后续独立阶段；本文不会因为本地测试通过而替它们打勾，也不代替维护者执行外部写入。

## 2. Phase 7 退出条件

指定版本可以从空服务器部署、监控、备份、恢复和回滚；本地用户也有完整启动文档。退出必须同时保存真实环境的部署、HTTPS、OAuth、备份、恢复和受控回滚证据，文档或脚本静态验证不能单独关闭 Phase 7。

## 3. 当前复核结论（2026-08-24）

- `check:cloud` 与 `check:local` 已通过；原生生产构建服务的双模式 HTTP E2E、学习状态、鉴权、导出和删号链路已有证据。
- Local 浏览器 UI 走查为 54 captures / 0 findings，点击式功能回归为 23/23；素材边界审计通过，素材 freshness、audit 和 reindex 命令可运行。
- 本轮隔离 Docker 新构建因 BuildKit 超过 3 分钟无输出而停止，未把既有健康容器当作新镜像构建证据；因此本机 Docker 新鲜构建仍需补证。
- 云端主机上的 Cloud Mode 镜像公开冒烟和恢复演练已有历史证据，但公网 DNS/TLS、真实 GitHub OAuth、GHCR 拉取、受控回滚、服务器外备份和外部日志/告警仍未完成。

## 4. T7.1 完善 CI 流程

**状态**：未完成  
**依赖**：T3.3、T4.8、T5.5、T6.7  
**规格**：NFR-006、NFR-007、DEPLOY-002

### 目标

- 执行 schema/引用审计、类型、格式、单元、集成、端到端和生产构建。
- 分别验证 cloud-clean-room 与 local fixtures。
- 扫描依赖、秘密和镜像内容边界。

**完成证据**：受保护分支所需检查全部稳定通过。

### 当前进展

[`quality.yml`](../../.github/workflows/quality.yml) 已加入 cloud/local 生产构建后的 HTTP 冒烟、cloud clean-room 镜像边界、依赖审计和明显凭据模式检查；本地已完成对应命令验证，但尚未在受保护分支上运行并确认全部 GitHub Actions 检查稳定通过，因此保留未完成。

本机补充验证（2026-08-11）：`npm run check:cloud --prefix code` 与 `npm run check:local --prefix code` 均通过（当时 123 个 Vitest、11 个 Node 工具测试、内容审计和生产构建）；新增 [浏览器验收脚本](../../code/tests/e2e/browser-acceptance.mjs) 并完成 Cloud/Local 生产服务器走查。受保护分支的真实 Actions 结果仍未取得。

本机续测：按 `cloud-clean-room` 作业规则构建当前镜像，边界扫描确认不含 Local Material、SQLite、备份、`.env` 或运行时测试凭据；容器健康、9 条公开路由和 Chrome Cloud `full` 均通过。远端受保护分支结果仍未取得。

## 5. T7.2 建立版本化镜像发布

**状态**：未完成  
**依赖**：T5.4、T7.1  
**规格**：DEPLOY-002、DEPLOY-005

### 目标

- 对版本标签构建并发布不可变镜像。
- 生成构建来源、提交 SHA 和变更说明。
- 禁止生产 Compose 默认跟随 `latest`。

**完成证据**：指定版本可拉取、启动，并可回退到上一个版本。

### 当前进展

[`release.yml`](../../.github/workflows/release.yml) 已按 `vX.Y.Z` 标签发布 GHCR 镜像、长 SHA 标签、SBOM 和构建来源证明；[release Compose override](../../code/docker/docker-compose.release.yml) 清除本地 build 配置并强制要求版本或 digest。尚未从实际 GHCR 拉取镜像并完成回退演练，因此保留未完成。

本机补充（2026-08-14）：新增 [image-release.sh](../../code/scripts/image-release.sh) 作为本机构建并推送发布镜像的手工路径：默认交叉构建 `linux/amd64`，拒绝 `latest`，推送前用 `docker buildx imagetools inspect` 检查版本是否已存在，成功后打印可固定到 `APP_IMAGE`/`LIGHTHOUSE_IMAGE` 的 sha256 digest；带 SBOM 与签名溯源的正式发布仍走 release workflow。用法见根 [USER.md](../../USER.md)。从 GHCR 实际拉取指定版本并完成回退演练仍未进行。

## 6. T7.3 编写云端部署和回滚流程

**状态**：未完成  
**依赖**：T7.2  
**规格**：DEPLOY-004—DEPLOY-009、OPS-005

### 目标

- 文档化反向代理、HTTPS、OAuth 回调、持久化卷、环境变量和健康检查。
- 升级前备份，升级后执行迁移和冒烟测试。
- 定义失败时应用版本和数据库的恢复步骤。

**完成证据**：从空服务器部署指定版本并完成一次受控回滚演练。

### 当前进展

[`plan.md` 第 13.4 节](../plans/plan.md#134-部署容器与数据库运维) 已补充版本镜像、配置解析、备份前置、健康/冒烟检查、OAuth callback、迁移和回滚边界；本地 `docker compose config` 已验证 release override 不再保留 build。尚未在空服务器、反向代理和 HTTPS 环境完成受控部署/回滚，因此保留未完成。

文档与自动化入口：[`docs/deploy/README.md`](./README.md)、[完全手工生产部署 Runbook](./production-manual.md) 和 [Lighthouse 自动化 Runbook](./lighthouse-automation.md)。[`lighthouse-deploy.sh`](../../code/scripts/lighthouse-deploy.sh) 提供只读预检、Ubuntu 初始化、root-only 秘密上传、升级前原生加密 SQLite 备份、固定镜像部署、Caddy HTTPS、健康验证与应用回滚；腾讯云防火墙、DNS、快照、异地副本和数据库恢复仍是独立控制面/运维动作。真实 Lighthouse 流程尚未完整执行。

目标主机云端模式验证（2026-08-20）：SSH 恢复后在 `VM-0-9-ubuntu` 上以 Cloud Mode 实跑了发布镜像 `v0.1.0`（linux/amd64，digest `sha256:76da5d2a…`），只绑 `127.0.0.1:3000`，从不对公网暴露；证据见 [cloud-host-verify](../../code/reports/cloud-host-verify/cloud-host-verify.md)。镜像经 `docker save | ssh docker load` 传输，因为 GHCR 包为私有且主机未认证，`docker pull` 返回 `denied`。

通过项目自己的公开冒烟套件（首页、9 条公开路由、健康检查、管理员边界）；匿名对 `/api/state`、`/api/data`、`/api/admin/health` 全部 401；`/api/local-image` 404；`/read/<local-preferred>` 返回安全 fallback，按内容核对零第三方正文泄漏。镜像内不含 `local-courses` 与 `*.sqlite`，在主机上复核了 GATE-09。验证后已拆除占位 OAuth 容器，避免被误认成真实部署。

**遗留**：公网 DNS、Caddy TLS、真实 GitHub OAuth App，以及随之而来的整个鉴权侧（登录、学习状态、导出、删号）在主机上仍未验证；鉴权侧已在开发机与容器拓扑由 `test:e2e:cloud` 覆盖（29/29，见 T8.12）。

## 7. T7.4 实现 SQLite 备份与保留策略

**状态**：未完成  
**依赖**：T4.1  
**规格**：OPS-001—OPS-006、AC-09

### 目标

- 使用一致性备份方式处理 WAL 数据库。
- 加密并复制到服务器外存储。
- 自动执行 7 个每日、3 个每周保留策略。
- 记录成功、失败、大小、校验和及最近恢复验证时间。

**完成证据**：备份任务、失败告警和保留清理测试通过。

### 当前进展

[backup module](../../code/modules/learning-state/backup.ts) 已提供 SQLite 一致性快照、AES-256-GCM 加密、SHA-256 manifest、7 个 daily/3 个 weekly 保留和 `quick_check` 恢复验证；`npm run db:backup --prefix code` 与 `npm run db:restore --prefix code` CLI 已完成成功/失败集成测试。管理员摘要会核对备份文件大小与 SHA-256，并只返回保留数量、时间、大小和状态；不可写输出目录与错误口令均触发匿名 critical 告警。定时调度、服务器外复制和正式恢复演练仍未完成，因此保留未完成。

## 8. T7.5 执行干净环境恢复演练

**状态**：已完成  
**依赖**：T7.4、T7.3  
**规格**：OPS-006、AC-09

### 目标

- 在干净环境恢复备份。
- 运行数据库完整性检查、迁移状态检查和应用冒烟测试。
- 验证用户关联、进度、笔记、收藏和成果。

**完成证据**：保存带日期、版本、耗时和结果的恢复演练记录。

### 当前进展

自动化恢复命令和单元测试已验证解密、目标文件防覆盖及 SQLite 完整性检查。本机隔离验收报告（2026-08-11）记录了加密备份、空目标恢复、SHA-256/`quick_check` 验证，以及恢复副本上的浏览器状态、导出和删号回归；它不是空服务器或固定发布镜像的正式恢复演练。2026-08-20 在腾讯云 Lighthouse 主机 `VM-0-9-ubuntu`（Ubuntu 24.04、x86_64）上执行 `npm run drill:restore`，**16/16 通过，耗时 3.0s**；演练在固定版本维护容器 `node:24.18.0-bookworm` 内运行，与 `lighthouse-deploy.sh backup` 同形；证据见 [本机端到端验收报告](../acceptance/local-e2e-2026-08-11.md) 和 [restore-drill-host](../../code/reports/restore-drill-host/restore-drill.md)，后者记录了日期、耗时、主机平台（`linux/x64`）、node 与应用版本。

覆盖三件事：干净环境恢复（目标目录从未存在过数据库、`-wal`/`-shm` 均不存在）、完整性与迁移检查（`integrity_check` 为 `ok`，再用应用自己的 opener 重开并读出每个用户），以及用户关联与全部私有数据的逐表行数核对（users/accounts/sessions/item_progress/stage_task_progress/notes/bookmarks/stage_outcomes 八张表与源库一致）。三组反向对照——错误口令、被翻掉一个字节的密文、覆盖已有目标——连同缺 `--yes` 的确认门均被正确拒绝。

演练用合成 fixture，不需要生产数据，也不触碰运行中的服务，因此在正式部署之前即可执行。报告里的 `hostname` 是维护容器 ID 而非宿主机名，宿主机身份以本条记录为准。

## 9. T7.6 建立隐私优先监控

**状态**：未完成  
**依赖**：T6.7、T7.3  
**规格**：ADMIN-003—ADMIN-006、NFR-008、SEC-005、PRIV-003

### 目标

- 记录请求错误、登录失败、数据库健康、备份、审计和更新结果。
- 仅保留不关联个人身份的访问汇总。
- 增加日志脱敏测试和告警规则。
- 运营聚合只能记录固定枚举的事件、范围、结果、计数和最后发生时间；不得写入用户 ID、IP、Cookie、查询参数、路径参数、错误原文、笔记正文或秘密，并须设置有限保留期。

**完成证据**：故障注入可触发预期告警，日志抽查不含秘密和笔记正文。

### 当前进展

已新增 `operational_metrics` schema version 2、`observability/` 模块、页面匿名聚合路由和管理员聚合摘要；按小时写入固定枚举的事件、范围、结果、计数和最后发生时间，30 天后清理。页面浏览、健康检查、状态/数据 API 错误和登录失败已经接入；备份、恢复、内容审计和素材更新 CLI 也会输出固定枚举日志并按配置写入同一聚合库。

单元/集成测试覆盖聚合、脱敏、失败阈值、不可写备份目录、错误恢复口令、拒绝素材更新、跨代理同源校验和未知路径拒绝，故障注入可产生预期 critical/warning。管理员页面新增加密备份健康卡。外部日志收集与通知仍须由部署平台接入，且 T7.3 依赖未完成，因此保留未完成。

## 10. T7.7 同步项目文档与运行手册

**状态**：未完成  
**依赖**：T5.4、T6.6、T7.3  
**规格**：IA-005、DEPLOY-001、MAT-002

### 目标

- 重写根 `README.md`：定位、双模式、九阶段、快速启动、架构、隐私和贡献。
- 同步根 `AGENTS.md`、`CONTEXT.md` 以及 `docs/plans/`，使目录、脚本、运行模式和实现证据指向 `code/`。
- 重写 `local-courses/README.md`：本地属性、归属、清单、检查/更新/审计/索引和存储建议。
- 删除原维护者身份信息；保留第三方作者、许可证和上游地址。
- 数量引用改为脚本生成片段或报告链接。
- 合并不再独立维护的专题说明，保留机器可读边界和唯一事实源。

**完成证据**：新用户仅依据 README 可完成 cloud/local 启动；归属抽查通过。

### 当前进展

已同步根 [README](../../README.md)、[AGENTS](../../AGENTS.md)、[CONTEXT](../../CONTEXT.md)、[产品方案](../plans/plan.md)、[产品规格](../plans/spec.md)、[任务清单](../plans/tasks.md) 和 [local-courses README](../../local-courses/README.md)，统一指向 `code/`、Docker 双模式、Better Auth、内容归属、素材 check/audit/reindex/update、数据库操作和生成式报告；删除旧维护者身份与手工素材数量。原先分散的 `content-boundaries.md`、`content-model.md`、`database-operations.md`、`deployment.md` 和 `requirements-traceability.md` 已合并到方案/任务事实源；机器可读 `content-boundaries.json` 保留为事实源。

本机补充（2026-08-11）：新增根 [Prompt.md](../../Prompt.md) 作为可复用端到端验收提示词，并更新方案目录、隐私监控和验收证据链接；真实部署与回滚证据仍未取得，因此不勾选。

已补充 [`docs/deploy/`](./README.md) 的手工和 Lighthouse 自动化入口，并将命令映射到现有 Compose、固定发布镜像、OAuth、稳定 SQLite 卷、原生备份与恢复工具；文档和脚本静态验证不能替代空服务器 HTTPS、真实 OAuth、异地备份、恢复与回滚演练，因此保留未完成。

本机补充（2026-08-14）：新增根 [USER.md](../../USER.md) 作为本地模式快速上手（开发服务器、Docker 双模式切换与并行、本机构建推送镜像），深入用法归 [GUIDE.md](../../GUIDE.md)；配套新增 [mode-switch.sh](../../code/scripts/mode-switch.sh)，在本机 Docker 上以各自 Compose 项目、端口和 SQLite 卷切换或并行运行。T7.3 的真实部署演练仍未完成。

本次文档复核（2026-08-24）：已同步本文件列出的入口和相关文档，项目相关文档链接路径检查、Prettier 和 `git diff --check` 通过；全仓库链接脚本仍会报告 `.agents/` 与 `.claude/` 内既有技能示例的外部/占位链接，未将这些非项目文档混入本次迁移。T7.7 仍未完成，因为完成定义包含依赖 T7.3 的云端流程可复现。

## 11. 本地优先与云端后续清单

### 先完成本地工作

- 使用 [`local-manual.md`](./local-manual.md) 验证开发服务和本机 Docker 两条路径。
- 跑 `npm run check:cloud --prefix code` 与 `npm run check:local --prefix code`，再按风险执行一次性实例 E2E、浏览器走查和素材检查。
- 修复或明确本机 Docker 新鲜构建的 BuildKit 阻塞，确认 Local Mode 只读素材挂载、健康检查和 SQLite 命名卷持久化。
- 运行本地恢复演练时使用临时 fixture 和交互式口令；不要把日常状态库或真实秘密写入文档。

### 本地完成后再规划云端

- 获取维护者本人持有的 GHCR、域名、GitHub OAuth 和云主机访问条件。
- 按 [`production-manual.md`](./production-manual.md) 先理解手工流程，再按 [`lighthouse-automation.md`](./lighthouse-automation.md) 执行受控自动化。
- 保存真实部署、HTTPS、OAuth、固定镜像、备份、服务器外副本、恢复、日志/告警和回滚证据后，才回到 [`tasks.md`](../plans/tasks.md) 更新任务状态。
- 任一外部前置条件缺失时保持 NO-GO，不以本地容器健康或公开 200 替代云端验收。
