# 本地功能补全与 Docker 复验

同日后续复核修复了模型输出限额字段、部分课程缺主文件及章节出处问题，并完成 r9 镜像复验；最新结果见[素材、阅读器与模型限额续验](./material-reader-model-recovery-2026-11-15.md)。下文保留 r7 阶段的原始范围与结果。

日期：2026-11-15（北京时间）。本轮延续已有 Phase 9 工作区，未提交代码、推送、创建真实 PR 或部署公网。测试使用独立 Compose 项目 `alh-verification-20261115`：Cloud `127.0.0.1:3322`、Local `127.0.0.1:3323`，学习状态、资讯和临时内容均与维护者日常实例分卷。

## 本轮补全

- 首次飞书接入原来必须先填字段 ID 才能试抓，无法通过界面发现字段。新增管理员 `source-fields` 操作，只读字段元数据；界面按名称选择标题、原文链接等字段，保存稳定 ID，切换 Base/子表后隐藏旧选项。高级 JSON 映射保留，字段读取不保存、启用或发布信源。
- 字段读取沿用管理员身份、CSRF、限流、出站校验和审计；测试覆盖首次空映射、凭据注入、无记录导入、权限拒绝及非飞书来源拒绝。先失败后通过的证据为 [onboarding-red](../../code/reports/verification-2026-11-15/onboarding-red.txt)。
- 公开卡片与详情使用“摘要待补”，模型配置提示只在管理后台展示。功能回归增加公开文案断言。
- 个人资讯按钮复用站点的主按钮/描边按钮样式；已完成或阅读中的资讯不再显示重复的“开始阅读”。“清空笔记与收藏”保留阅读完成状态，浏览器回归覆盖保存、完成、清空、刷新及明确重新阅读。
- `audit:functional` 可使用仓库外的一次性管理员 storageState 和停用、人工审核的飞书配置，实际点击读取字段、下拉映射、试抓与保存，再验证切换子表不保留旧字段。登录由 Better Auth 签发，仅打桩 GitHub token/profile 端点；会话文件不进入仓库。

## 飞书真实读取

使用现有应用身份，只读三份 Base 的九个子表，不写飞书；无视图过滤，范围为该身份可获取的全表记录。字段 ID 映射保存到隔离资讯库；同一来源完整同步两轮，验证分页与重复读取幂等。没有调用模型、公开内容或将测试来源导入日常实例。

| 子表 | 每轮页数 | 保存的来源记录 | 每轮拒收 |
| --- | ---: | ---: | ---: |
| AI 专家动态 | 5 | 1898 | 355 |
| AI 开发动态 | 8 | 2926 | 645 |
| AI 专家文章 | 3 | 1040 | 2 |
| Harness YouTube | 2 | 655 | 0 |
| Harness B站 | 2 | 825 | 0 |
| ClawHub Skills | 2 | 696 | 13 |
| Skills B站 | 3 | 1056 | 2 |
| Skills GitHub | 2 | 636 | 0 |
| Skills YouTube | 4 | 1687 | 0 |
| 合计 | 31 | 11419 | 1017 |

11419 条来源记录对应 11416 个内容版本，第二轮版本数不增加；同原文的跨来源身份按既有规则归一。拒收表示没有有效标题、记录 ID 或可接受的原文链接，不将这些记录计作导入成功，也未通过放宽校验接受它们。不是飞书所有记录都能成为可发布资讯。

宿主机首先完成两轮，随后在 Linux builder 容器内对独立 Docker 资讯卷复验。首次容器请求出现一次超时，分页检查点已保留；重新领取任务后完成，未清空或手工搬运 SQLite 文件。结构化结果见 [feishu-sync.json](../../code/reports/verification-2026-11-15/feishu-sync.json)，容器输出见 [feishu-container-sync.txt](../../code/reports/verification-2026-11-15/feishu-container-sync.txt)，停用的配置见 [feishu-sources.json](../../code/reports/verification-2026-11-15/feishu-sources.json)。上述字段配置不含访问凭据。

## 素材目录复核

`audit:materials` 发现 38 条失效路径。先读取漂移报告，`materials drift --apply` 仅应用 20 条有多路径共同印证的搬迁（21 个条目、42 处主路径与引用）；另按 `openhanako` 的既有 sourceUrl、目标 Git remote 与 README 身份，人工确认搬迁到 `Agentic/Harness/PI/openhanako/`，修复 1 条路径。目录应用时发现退场条目的 `redirect.chapter` 未随素材搬迁，导致 schema 校验失败；已修复同步转发路径并在写入前验证完整目录，先失败后通过的测试见 [drift-redirect-red](../../code/reports/verification-2026-11-15/drift-redirect-red.txt) / [green](../../code/reports/verification-2026-11-15/drift-redirect-green.txt)。第三方素材、旧站和自动改写阈值均未改动。

修复后的旧 OpenClaw 章节 ID 转发、openhanako 及 AutoGPT 搬迁文档均在最终 Local 容器返回 200 和阅读正文，见 [moved-reader-smoke](../../code/reports/verification-2026-11-15/moved-reader-smoke.json)。

最终仍有 17 条缺失路径（11 条存在同名候选但无法证明搬迁、6 条无同名候选），以及未策展仓库和上游回退地址缺口。特别是 pi-mono 的 server/client 不能指向 openwork、opencode 或 deepseek 的同名包。相关内容恢复/退场须基于原仓库证据，T8.19 保持 ⏳；独立素材审计退出 1，代码门禁和浏览器核心流程通过不替代此结果。[修复前](../../code/reports/verification-2026-11-15/catalog-drift-before.json) · [自动应用记录](../../code/reports/verification-2026-11-15/materials-apply.txt) · [当前漂移](../../code/reports/materials/catalog-drift.md)。

## 最终验证

最终本地 arm64 镜像为 `agent-learning-hub:verification-20261115-r7`，镜像 ID / 本地 manifest digest 为 `sha256:64742ebf7de6415106f8c7471ffc55c0f162f50b872683c365ec9ed4cf982a88`。Cloud app、Local app 与 worker 均健康，端口只绑定回环；未发布 GHCR。构建日志见 [docker-build-r7](../../code/reports/verification-2026-11-15/docker-build-r7.txt)，实际容器见 [containers](../../code/reports/verification-2026-11-15/containers.txt)。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Cloud / Local 代码门禁 | 各 214 项单测、11 项工具测试、格式、lint、类型、内容审计与生产构建通过 | [Cloud](../../code/reports/verification-2026-11-15/check-cloud.txt) · [Local](../../code/reports/verification-2026-11-15/check-local.txt) |
| 新修复定向测试 | 飞书管理 4 项、目录漂移 11 项，共 15 项通过 | [fixes-tests](../../code/reports/verification-2026-11-15/fixes-tests.txt) |
| Cloud 容器 HTTP E2E | 47 项通过；含登录、资讯发布/撤下、个人状态、导出、删号级联 | [Cloud e2e](../../code/reports/verification-2026-11-15/cloud-e2e.txt) |
| Local 容器 HTTP E2E | 公开页面、健康与状态生命周期通过 | [Local e2e](../../code/reports/verification-2026-11-15/local-e2e.txt) |
| Cloud 版式 | 桌面、平板、手机 63 张，0 finding；含课程详情、阅读器回退 | [UI Cloud](../../code/reports/verification-2026-11-15/ui-cloud/ui-review.md) |
| Local 版式 | 三档视口 54 张，0 finding；含本地阅读器 | [UI Local](../../code/reports/verification-2026-11-15/ui-local/ui-review.md) |
| Cloud 点击回归 | 24 项通过、2 项本地多章节检查不适用、0 失败；含真实字段 API 的接入点击和个人资讯清空进度回归 | [功能 Cloud](../../code/reports/verification-2026-11-15/functional-cloud/functional-regression.md) |
| Local 点击回归 | 25/25 通过 | [功能 Local](../../code/reports/verification-2026-11-15/functional-local/functional-regression.md) |
| 镜像交付边界 | Linux arm64、Node 24.22.3；没有本地素材、reports、docs 或环境文件 | [image-boundaries](../../code/reports/verification-2026-11-15/image-boundaries.json) |
| 文档 | 9 份目标文档相对路径检查通过；README.md 与 Readme.md 在本机为同一个文件，未创建重复入口 | [doc-links](../../code/reports/verification-2026-11-15/doc-links.txt) |

两种状态 E2E 都在新的 r7 一次性命名卷上运行，测试端与服务端共享 Linux 文件系统，最终删号；浏览器演示使用另外的预览卷，未将其指向维护者记录。生产构建仍有既有 Turbopack 动态文件追踪与 middleware 弃用提示；内容审计 warning（包括缺失路径）保留在日志中，不能当作已解决。

已按路由和视口查看截图，复核导航、标题换行、筛选、分页、空状态、阅读器、匿名提示，以及管理员字段映射和个人记录。空状态截图改用实际无结果的组合；阅读位置恢复及点击后长截图先滚回顶部，避免固定导航出现在截图中段。GUIDE 的桌面/手机首页、发现列表、资讯详情已重拍，位于 `docs/images/guide/`。UI 数据明确标注“验收示例”，仅属于一次性实例。截图索引： [发现列表](../images/guide/discover-desktop.png) · [资讯个人记录](../images/guide/discovery-mobile.png) · [飞书字段桌面](../../code/reports/verification-2026-11-15/functional-cloud/feishu-fields-desktop.png) · [飞书字段手机](../../code/reports/verification-2026-11-15/functional-cloud/feishu-fields-mobile.png)。脚本后续只调整空状态抓取地址与截图滚动归位，格式/ESLint 补验见 [screenshot-followup-lint](../../code/reports/verification-2026-11-15/screenshot-followup-lint.txt)。

## 保留的验收边界

T9.2 的字段映射与完整分页同步已取得真实只读证据。既有飞书每日写表任务持续运行、长期无人值守调度仍随 T9.9 验收。真实模型费用和筛选质量（T9.4）、真实 GitHub App 收录 PR 及版本上线（T9.7）、公网 DNS/TLS、双用户 OAuth、异地备份与生产回退（T9.8、Phase 7/8）继续保留未完成状态。已有本机真实 OAuth 和最小模型调用证据保留原验证范围，本轮不重启日常模型 worker。
