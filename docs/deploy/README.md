# 部署与运维入口

本目录把 [`plan.md` 第 13 节](../plans/plan.md#13-运行隐私备份与监控)定义的架构和安全边界，转换成可由运维人员逐步执行的生产 Runbook。规格、架构和任务状态仍分别以 [`spec.md`](../plans/spec.md)、[`plan.md`](../plans/plan.md) 和 [`tasks.md`](../plans/tasks.md) 为准；这里不另建第二套产品或数据契约。

## 选择入口

| 场景                                              | 文档                                                | 执行入口                                 |
| ------------------------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| 从空白 Ubuntu 主机逐条安装、配置、上线和恢复      | [完全手工生产部署与运维](./production-manual.md)    | 人工执行每一条命令并保存演练证据         |
| 腾讯云 Lighthouse 专用主机，通过本机 SSH 自动部署 | [Lighthouse 自动化部署](./lighthouse-automation.md) | `code/scripts/lighthouse-deploy.sh`      |
| 仅在开发机运行 Local Mode                         | [根 README 的 Docker 章节](../../README.md#docker)  | `code/scripts/docker-deploy.sh local up` |

## 共同生产边界

- 只部署固定版本标签或 `sha256` digest，禁止 `latest`。
- Cloud 镜像不包含、不挂载、不代理 `local-courses/`。
- 应用端口仅监听 `127.0.0.1`；公网只开放反向代理的 `80/443`。
- SQLite、WAL 和共享内存文件位于同一个持久化卷；运行中不得只复制主数据库文件。
- 升级前执行项目原生的一致性加密备份；每日备份还必须复制到服务器之外。
- 应用回滚与数据库恢复是两个不同动作。旧镜像能否读取新 schema 必须先确认；不能确认时恢复升级前备份到新卷。
- Lighthouse 系统盘快照是额外的主机级保护，不替代应用一致性备份、异地副本或恢复演练。
- 文档或脚本执行成功不等于 Phase 7 已验收；必须保存真实主机上的部署、HTTPS、OAuth、备份、恢复和受控回滚证据。

## 推荐执行顺序

1. 先阅读手工文档，理解域名、OAuth、秘密、卷、备份和回滚边界。
2. 在腾讯云控制台完成人工控制面准备：实例、SSH 密钥、防火墙、DNS 和必要快照。
3. 运行自动化脚本的 `preflight` 与 dry-run，确认目标主机和固定镜像。
4. 首次执行 `bootstrap`、`configure`、`deploy`，随后完成公开页面、OAuth 与管理员边界验收。
5. 配置每日 `backup` 和服务器外复制，执行一次干净卷恢复演练。
6. 将日期、镜像 digest、备份 manifest、耗时和结果写入新的 `docs/acceptance/` 证据；确认真实结果后再按项目流程更新任务状态。

## 官方平台参考

- [腾讯云：管理 Lighthouse 实例防火墙](https://cloud.tencent.com/document/product/1207/44577/)
- [腾讯云：管理 SSH 密钥](https://cloud.tencent.com/document/product/1207/44573)
- [腾讯云：管理快照](https://cloud.tencent.com/document/product/1207/48546/)
- [Docker：在 Ubuntu 安装 Docker Engine](https://docs.docker.com/engine/install/ubuntu/)
- [Caddy：安装](https://caddyserver.com/docs/install)与[自动 HTTPS](https://caddyserver.com/docs/automatic-https)
- [GitHub：创建 OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
