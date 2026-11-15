# 收录 PR 的 CI 最小修复与验收

日期：2026-11-15。状态：**用户已确认追加，远程 PR 六份文件的五项 CI 全部通过**。原两份目录保持逐字不变，另追加下述四份最小修复；保持未合并、未发布。

## 原因与四份附加文件

1. `code/modules/catalog/catalog-api.test.ts`：公开目录数量写死为 384，新增条目后失败。改为依据加载后的有效目录验证数量、ID 集合与顺序，保留退场排除、旧 ID 转发和标签筛选断言；没有删除测试或把 384 简单改成 385。
2. `code/package.json`：Better Auth `^1.6.26` → `^1.7.25`，与已通过本地容器验收的版本一致。
3. `code/package-lock.json`：锁定升级后的认证依赖；其余应用依赖不作整批升级。`npm audit --omit=dev --audit-level=high` 返回 0 漏洞。
4. `code/modules/auth/better-auth.ts`：适配新版本的 GitHub 最小 profile 类型。移除 provider user 中不再允许的 `id`，保留 `data.id` 与既有用户创建钩子中的稳定 ID 映射；不新增权限、邮箱采集或账户绑定。

远程失败的原始证据见[收录验收](./curation-review-2026-11-15.md)。[相关官方公告](https://github.com/advisories/GHSA-44jh-23m7-hpcf)描述的是 PostgreSQL 适配器数据库限流条件；本站使用自定义 SQLite 适配器，本补丁解决依赖门禁，不声称已发生该公告中的漏洞利用。

四文件补丁为 **108 行增加、121 行删除**，主要来自 lockfile：[查看完整差异](../../code/reports/curation-review-2026-11-15/ci-repair-preview.patch)。没有加入本地尚未提交的 Phase 9 功能代码、运维配置、私钥或环境文件。

## 隔离验证

隔离检出 `/tmp/alh-ci-repair-20261115` 基于 PR 的 main 基线，先应用已确认的两份目录文件，再应用上述四份修复。安装独立依赖，不使用日常学习数据库。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Cloud check | 177 单测、11 工具测试、格式、lint、类型、内容审计与生产构建通过 | [Cloud](../../code/reports/curation-review-2026-11-15/ci-fix-check-cloud.txt) |
| Local check | 同上，通过 | [Local](../../code/reports/curation-review-2026-11-15/ci-fix-check-local.txt) |
| 生产依赖审计 | 0 vulnerabilities | [audit](../../code/reports/curation-review-2026-11-15/ci-fix-audit.txt) |
| Cloud 状态 E2E | 33 项，含真实 Better Auth 会话流程与删号，通过 | [Cloud E2E](../../code/reports/curation-review-2026-11-15/ci-fix-e2e-cloud.txt) |
| Local 状态 E2E | 公开页面、健康与状态生命周期通过 | [Local E2E](../../code/reports/curation-review-2026-11-15/ci-fix-e2e-local.txt) |

E2E 使用 `127.0.0.1:3352` / `3353` 和新建的一次性状态目录，测试端与服务端共享本机文件系统；测试最后删号，服务器和临时目录已清理。两套门禁基于远程 main 的既有工程，不能与本地 Phase 9 工作区的 222 项单测混计。

用户确认“追加这 4 份 CI 修复”后，已仅在 PR #1 分支追加这四份文件并更新说明；不更改 main、不合并、不发布。

## 真实追加与远程 CI

新提交为 `a803bb717454a2c344665ff036cf62759d3154b2`，父提交为原两文件收录提交 `8e007d71c1a0bb458839252cbc62f73149f43cd0`。GitHub 返回的提交身份为 `agent-learning-hub-cr330326[bot]`。追加提交仅四文件，原两份目录未重写；最终六份文件已通过远程内容逐字比对，临时安装令牌 HTTP 204 撤销。没有将本地 Phase 9 功能、文档或运维配置推入该分支。

[实际追加及六文件比对](../../code/reports/curation-review-2026-11-15/ci-repair-live.json) · [PR 说明](../../code/reports/curation-review-2026-11-15/ci-repaired-pr-body.md) · [执行脚本快照](../../code/reports/curation-review-2026-11-15/ci-repair-live.mjs.txt)。

[远程 CI 43707283649](https://github.com/cr330326/Agent-Learning-Hub/actions/runs/43707283649) 五项作业均为 `completed / success`，T9.7c 已完成。[逐项结果](../../code/reports/curation-review-2026-11-15/ci-repair-ci.json)。

| 作业 | 实际结果 |
| --- | --- |
| Repository guards | 仓库交付边界检查通过 |
| dependency and secret guards | 生产依赖审计 0 vulnerabilities，凭据模式检查通过 |
| cloud quality | 格式、lint、类型、内容审计、177 单测、11 工具测试及构建通过，Cloud 33 项 E2E 通过 |
| local quality | 同一代码门禁通过，Local 公开页面、健康和状态生命周期 E2E 通过 |
| cloud clean-room image | 干净镜像构建、镜像边界及 Cloud 容器公开冒烟通过 |

日志摘录：[Cloud](../../code/reports/curation-review-2026-11-15/ci-repair-job-132790978003.json)、[Local](../../code/reports/curation-review-2026-11-15/ci-repair-job-132790977994.json)、[依赖](../../code/reports/curation-review-2026-11-15/ci-repair-job-132790978034.json)、[镜像](../../code/reports/curation-review-2026-11-15/ci-repair-job-132790977793.json)。GitHub PR 作业检出合成 merge commit `f9476045433a5954790412d4adb3ff70ed27dcfd`，对应已核对的 head `a803bb7` 与 main 基线，不是发布版本。

完整安装树的 `npm ci` 输出仍提示 10 项依赖警报（9 moderate、1 high），而本次规定的 `--omit=dev` 生产审计为 0；本补丁没有声称开发依赖已全部消警，也没有批量升级批准范围之外的依赖。

最终 PR 共六文件、增加 145 行/删除 123 行；本次追加提交为四文件、增加 108 行/删除 121 行。未合并、未打 tag、未发布，main 分支保护、后续维护者合并和固定版本上线继续单独验收。
