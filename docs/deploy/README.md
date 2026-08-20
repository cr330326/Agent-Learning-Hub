# 部署与运维入口

本目录把 [`plan.md` 第 13 节](../plans/plan.md#13-运行隐私备份与监控)定义的架构和安全边界，转换成可由运维人员逐步执行的 Runbook。规格、架构和任务状态仍分别以 [`spec.md`](../plans/spec.md)、[`plan.md`](../plans/plan.md) 和 [`tasks.md`](../plans/tasks.md) 为准；这里不另建第二套产品或数据契约。

## 选择入口

| 场景                                              | 文档                                                | 执行入口                            |
| ------------------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| 在自己电脑上跑起来读素材、学习、改代码            | [本机手动运行本地服务](./local-manual.md)           | `npm run dev:local` 或本机 Docker   |
| 从空白 Ubuntu 主机逐条安装、配置、上线和恢复      | [完全手工生产部署与运维](./production-manual.md)    | 人工执行每一条命令并保存演练证据    |
| 腾讯云 Lighthouse 专用主机，通过本机 SSH 自动部署 | [Lighthouse 自动化部署](./lighthouse-automation.md) | `code/scripts/lighthouse-deploy.sh` |

后两份文档做的是**同一件事**，只是一份逐条手工、一份脚本化。第一次上线建议先通读手工文档理解每一步在做什么，再用自动化脚本执行——脚本失败时你需要知道它卡在手工流程的哪一步。两者的步骤对应关系见 [production-manual 第 16 节](./production-manual.md#16-与自动化脚本的对应关系)。

## 脚本按运行位置分类

`code/scripts/` 下 14 个脚本，按**在哪台机器上执行**和**作用于什么**分三类。区分这两件事很重要：`image-release.sh` 和 `lighthouse-deploy.sh` 都在你自己电脑上跑，但作用对象是云端。

### 甲、本机运行、作用于本机（学习与开发）

不需要 Docker，也不接触任何远程主机。

| 脚本                           | npm 入口                                | 用途                                                                               | 硬依赖                       |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| —                              | `npm run dev:local`                     | **学习和读素材的默认方式**，热更新                                                 | Node 22+、`local-courses`    |
| —                              | `npm run dev:cloud`                     | 公开视角预览，第三方素材只给出处                                                   | Node 22+                     |
| `audit-content.ts`             | `npm run audit:content`                 | 内容 schema、来源、许可证、本地路径校验                                            | 进 `npm run check`           |
| `materials.ts`                 | `npm run materials` / `audit:materials` | 素材新鲜度、目录漂移对账、安全更新、重索引                                         | `local-courses`、git         |
| `audit-content-boundaries.mjs` | `npm run audit:boundaries`              | Git/Docker/CI 的内容边界审计                                                       | 也在 CI 跑                   |
| `baseline-report.mjs`          | `npm run audit:baseline`                | 旧站能力基线（迁移期历史工具）                                                     | `learning-site/`             |
| `ui-review.mjs`                | `npm run audit:ui`                      | 三档视口版式走查                                                                   | **运行中的服务**、Playwright |
| `functional-regression.mjs`    | `npm run audit:functional`              | 真实点击的功能回归                                                                 | **运行中的服务**、Playwright |
| `restore-drill.ts`             | `npm run drill:restore`                 | 备份→干净环境恢复演练，附错误口令/篡改/覆盖三组反向对照                            | `BACKUP_PASSPHRASE`          |
| `convert-legacy-content.mjs`   | ~~`npm run convert:legacy`~~            | **已废弃**，见 [ADR 0006](../adr/0006-catalog-is-hand-maintained.md)，仅作溯源保留 | —                            |

`audit:ui` 和 `audit:functional` 需要运行中的服务和浏览器，因此**不进** `npm run check`；`audit:materials` 依赖仓库之外的素材库，同样不进。三者都自己非零退出，各自作为独立门禁使用。

### 乙、本机运行、作用于本机 Docker（预演与对照）

跑的是和云端一模一样的产物，但只绑回环地址。

| 脚本               | 用途                                                  | 备注                                        |
| ------------------ | ----------------------------------------------------- | ------------------------------------------- |
| `local-preview.sh` | 一条命令构建镜像 + 启动 Local Mode + 健康验证         | 委托给 `docker-deploy.sh`，只绑 `127.0.0.1` |
| `mode-switch.sh`   | 本机切换或**并行**跑 Local/Cloud 两种模式             | 各自独立的 Compose 项目、端口和 SQLite 卷   |
| `docker-deploy.sh` | Compose 生命周期底层入口（`local`/`cloud`/`release`） | 上面两个脚本的实现；需要精细控制时直接用    |

> 想同时对照两种模式**只能走 Docker**：Next.js 16 对同一工程目录只允许一个 `next dev` 实例，第二个会以 "server is already running" 退出。

### 丙、作用于云端

| 脚本                   | 在哪执行   | 作用于        | 用途                                                                     |
| ---------------------- | ---------- | ------------- | ------------------------------------------------------------------------ |
| `image-release.sh`     | **本机**   | 镜像仓库      | 交叉构建 `linux/amd64` 并推送固定版本，拒绝 `latest`                     |
| `lighthouse-deploy.sh` | **本机**   | 云主机（SSH） | 预检、装机、传秘密、部署、备份、恢复演练、回滚、验证、状态、日志         |
| `docker-deploy.sh`     | **云主机** | 云主机        | `release` 模式跑固定镜像；由 `lighthouse-deploy.sh` 打包上传             |
| `database.ts`          | **云主机** | 生产 SQLite   | 加密备份与恢复；在维护容器里执行，不用 `cp` 复制运行中的库               |
| `restore-drill.ts`     | **云主机** | 生产 SQLite   | 由 `lighthouse-deploy.sh restore-drill` 在维护容器里执行；只读挂载状态卷 |

`restore-drill.ts` 同时出现在甲、丙两类：本机跑的是合成 fixture（不需要任何生产数据，任何人都能复现），云主机跑的是**当前生产数据**的真实演练。两者跑的是同一段代码和同一组反向对照。

正式发布优先走 `v*.*.*` Git tag 触发的 [`release.yml`](../../.github/workflows/release.yml)——同一个 Dockerfile，额外附带 SBOM 和签名溯源。`image-release.sh` 是 CI 到不了的镜像仓库或主机时的手工路径。

### 哪些脚本永远不该碰生产

`baseline-report.mjs`、`convert-legacy-content.mjs`、`ui-review.mjs`、`functional-regression.mjs`、`materials.ts` 都不应在生产主机运行：前两个是迁移期工具，中间两个需要浏览器，最后一个需要 `local-courses`——而云端镜像**根本不包含也不挂载**素材库。

## 共同生产边界

- 只部署固定版本标签或 `sha256` digest，禁止 `latest`。
- Cloud 镜像不包含、不挂载、不代理 `local-courses/`。
- 应用端口仅监听 `127.0.0.1`；公网只开放反向代理的 `80/443`。
- SQLite、WAL 和共享内存文件位于同一个持久化卷；运行中不得只复制主数据库文件。漏掉 `-shm` 的后果已实测：`-wal` 非空而 `-shm` 缺失时，只读挂载下打开数据库会直接 `SQLITE_CANTOPEN`，备份和演练一起失败。始终走 `db:backup`（内部用 SQLite 在线备份 API）。
- 升级前执行项目原生的一致性加密备份；每日备份还必须复制到服务器之外。
- 应用回滚与数据库恢复是两个不同动作。旧镜像能否读取新 schema 必须先确认；不能确认时恢复升级前备份到新卷。
- Lighthouse 系统盘快照是额外的主机级保护，不替代应用一致性备份、异地副本或恢复演练。
- 文档或脚本执行成功不等于 Phase 7 已验收；必须保存真实主机上的部署、HTTPS、OAuth、备份、恢复和受控回滚证据。

## 推荐执行顺序

1. 先在本机把站点跑通（[local-manual.md](./local-manual.md)），确认内容与素材边界符合预期。
2. 通读手工文档，理解域名、OAuth、秘密、卷、备份和回滚边界。
3. 在腾讯云控制台完成人工控制面准备：实例、SSH 密钥、防火墙、DNS 和必要快照。
4. 运行自动化脚本的 `preflight` 与 dry-run，确认目标主机和固定镜像。
5. 首次执行 `bootstrap`、`configure`、`deploy`，随后完成公开页面、OAuth 与管理员边界验收。
6. 配置每日 `backup` 和服务器外复制，执行一次干净环境恢复演练（`code/scripts/lighthouse-deploy.sh restore-drill`，或手工文档第 14.2 节）。
7. 将日期、镜像 digest、备份 manifest、耗时和结果写入新的 `docs/acceptance/` 证据；确认真实结果后再按项目流程更新任务状态。

## 官方平台参考

- [腾讯云：管理 Lighthouse 实例防火墙](https://cloud.tencent.com/document/product/1207/44577/)
- [腾讯云：管理 SSH 密钥](https://cloud.tencent.com/document/product/1207/44573)
- [腾讯云：管理快照](https://cloud.tencent.com/document/product/1207/48546/)
- [Docker：在 Ubuntu 安装 Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy：安装](https://caddyserver.com/docs/install)与[自动 HTTPS](https://caddyserver.com/docs/automatic-https)
- [GitHub：创建 OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
