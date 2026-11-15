# 素材、阅读器与模型限额续验

日期：2026-11-15（北京时间）。延续[本地功能补全验收](./local-verification-2026-11-15.md)，继续处理 T8.19 与 T9.4 中可在本机验证的缺陷。未提交、推送或发布公网；日常实例及第三方素材工作区未改动。

## 修复与目录策展

- 模型请求原来只发送 `max_completion_tokens`，与 DeepSeek 的参数不匹配。按[官方集成文档](https://api-docs.deepseek.com/zh-cn/quick_start/agent_integrations/oh_my_pi)改为默认 `max_tokens`，允许通过 `DISCOVERY_MODEL_TOKEN_LIMIT_FIELD` 显式选择兼容字段，非法值不发起模型调用。请求与原子预算预留共用 2048 token 上限，回执价格版本记录字段选择，已有未知付费回执不重新提交。环境示例、worker Compose、Lighthouse 传输允许清单与两份 Runbook 已同步。本轮只验证实际发送的请求体，未新增付费调用或证明供应商账单与强制限额。
- 多章课程主文件缺失时，原来整个阅读入口不可用；现在按 `listLocalChapters()` 的既有顺序打开首个可读章节。明确指定章节时，只使用该章自己的上游地址；未声明路径与符号链接逃逸仍拒绝。Cloud 只选择对应来源，不访问本地文件。正文上方的出处链接随当前章节变化，未知来源不借用另一项目的地址。浏览器断言覆盖 Claude 插件课程的缺主文件、明确选择 Claude Mem、未知路径及 Claudian 出处。
- DeepAgents 的三个旧 openwiki 文档，依据原仓库重组提交与新正文，人工策展到现行会话、评估、开发发布及测试指南。OpenChamber 的旧命令片段文档改为同仓库的聊天输入指南。PI 三个已删除的实验包保留稳定 ID，明确标注历史版本，仅链接删除前提交。缺失的 openworker、Claude Mem、OpenClaw 与 Lark 副本补全逐文件、固定提交的上游入口；ACP 使用原仓库现行指南。未复制第三方正文或放宽自动漂移规则。

本轮消除 7 条失效声明：4 条现行文档替换、3 条明确历史归档；接续上一轮 21 条修复，漂移从初始 38 条降为 **10 条**。这 10 条均属于整个本地副本缺失，已提供准确上游回退，但物理副本未恢复，T8.19 保持未完成。`audit:materials` 因此仍退出 1；未收录仓库及其他条目的上游缺口也继续在报告中展示。不是代码门禁失败，也不能当作素材库齐备。

策展来源、迁移/删除提交和条目明细见 [catalog-curation.json](../../code/reports/recovery-2026-11-15/catalog-curation.json)。缺陷先失败的证据：[模型限额](../../code/reports/recovery-2026-11-15/model-limit-red.txt)、[阅读器](../../code/reports/recovery-2026-11-15/reader-fallback-red.txt)。最终回归包含在双模式门禁中。

## 最终本地验证

镜像：`agent-learning-hub:verification-20261115-r9`，本地 manifest digest / image ID：`sha256:8afacc4859c8a68151bdb5706cd996549c89dbd625c477117e45de313194ce58`。Cloud、Local、worker 均健康，沿用独立预览卷，入口为 `127.0.0.1:3322` / `127.0.0.1:3323`。构建记录：[runner](../../code/reports/recovery-2026-11-15/docker-build-r9.txt)、[builder](../../code/reports/recovery-2026-11-15/docker-builder-r9.txt)。未发布镜像仓库。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Cloud / Local 门禁 | 各 220 项单测、11 项工具测试，格式、lint、类型、内容审计及生产构建通过 | [Cloud](../../code/reports/recovery-2026-11-15/check-cloud.txt) · [Local](../../code/reports/recovery-2026-11-15/check-local.txt) |
| Docker HTTP E2E | Cloud 47 项通过；Local 公开页面、健康与完整状态生命周期通过 | [Cloud](../../code/reports/recovery-2026-11-15/cloud-e2e.txt) · [Local](../../code/reports/recovery-2026-11-15/local-e2e.txt) |
| 三档视口版式 | Cloud 63 张、Local 54 张，均 0 finding | [Cloud](../../code/reports/recovery-2026-11-15/ui-cloud/ui-review.md) · [Local](../../code/reports/recovery-2026-11-15/ui-local/ui-review.md) |
| 浏览器交互 | Cloud 25 通过、3 项模式不适用、0 失败；Local 27/27 | [Cloud](../../code/reports/recovery-2026-11-15/functional-cloud/functional-regression.md) · [Local](../../code/reports/recovery-2026-11-15/functional-local/functional-regression.md) |
| 章节来源 | 桌面、手机均打开 Claudian，不再显示 Claude Mem 的错误出处 | [结构化断言](../../code/reports/recovery-2026-11-15/reader-attribution.json) · [截图](../../code/reports/recovery-2026-11-15/reader-desktop.png) |
| 素材审计 | 10 条缺失；独立审计退出 1，T8.19 保留 ⏳ | [当前漂移](../../code/reports/materials/catalog-drift.md) |
| 交付与文档 | 镜像不含本地素材、报告、文档或环境文件；目标文档路径检查通过 | [边界](../../code/reports/recovery-2026-11-15/image-boundaries.json) · [文档](../../code/reports/recovery-2026-11-15/doc-links.txt) |

状态 E2E 使用新建 r9 命名卷，应用与测试共享 Linux 文件系统，最后执行删号；与日常学习状态、预览演示数据分离。未绕过已有数据保护。此前已有的 Turbopack 文件追踪与 middleware 弃用提示仍存在，内容审计缺失路径是 warning，见原始日志。

已查看各路由和三档视口截图，并在修复出处后重拍、查看桌面与手机阅读页。页面导航、标题、筛选分页、空状态、课程详情、阅读器、匿名提示与个人记录无新增走查缺陷。新截图为 [GUIDE 阅读器](../images/guide/reader-partial.png)；飞书字段与资讯个人状态截图沿用同日[前一轮证据](./local-verification-2026-11-15.md)。

## 尚未关闭

T8.19 缺失副本恢复；T9.4 真实模型费用及长正文摘要/工程价值质量校准；T9.7 真实 GitHub App 收录 PR 与版本上线；T9.8、T9.9 的公网部署、长期上游调度、两用户 OAuth、异地备份和生产回退，以及 Phase 7/8 对应外部门槛仍保持未完成。模型最小调用和本机 OAuth 的已有证据不替代这些验收。
