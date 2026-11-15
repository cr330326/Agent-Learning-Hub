# 日报人工更正冻结契约复验

日期：2026-11-15。延续 [r13 模型、收录与界面复验](./model-quality-and-curation-2026-11-15.md)，关闭 T9.5a。本轮使用独立 Docker 预览与合成记录，未改日常学习数据、调用模型、启用来源或更新远程 PR。

## 问题与修复

DISC-007 / DISC-015 要求人工更正可追踪，日报保留当期摘要。复核发现旧实现冻结的只有 `id` / `versionId`，历史读取时又忽略所有人工字段，因此出刊前已生效的更正会在日报卡片和详情中丢失。同一模型版本在后续重算时，旧期还会读到被改写的输出。

新期在已有 `editions.entries` JSON 中保存标题、摘要、推荐理由、主题、评分和摘要状态的展示快照，内容来自冻结时的有效结果，包含已生效的人工更正。历史卡片和 `?version=` 详情读取同一快照；之后的人工更正、同版本重算及处理失败不改写旧期。撤下仍显示撤下状态并清空正文，不能借快照绕过下架。

旧两字段日报继续读取其原模型版本，不追溯套用当前人工更正。同一摘要版本已入刊后不再跨期重复入选；新来源版本仍需满足既有发布与工程价值条件。没有改变数据库表结构、身份、两库归属或外部发布方式。

## 验证证据

| 层级 | 结果 | 证据 |
| --- | --- | --- |
| 修复前单测 | 两项失败：冻结前更正丢失、重新发布旧摘要版本再次入刊 | [red](../../code/reports/edition-freeze-2026-11-15/red.txt) |
| 修复前浏览器 | r13 对已播种快照仍显示旧模型标题，专项断言失败 | [报告](../../code/reports/edition-freeze-2026-11-15/functional-before/functional-regression.md) |
| 双模式 check | 各 225 单测、11 工具测试，格式、lint、类型、内容审计和生产构建通过 | [Cloud](../../code/reports/edition-freeze-2026-11-15/check-cloud.txt) · [Local](../../code/reports/edition-freeze-2026-11-15/check-local.txt) |
| r14 Docker E2E | 新建独立 r14 卷，Cloud 47 项和 Local 状态生命周期通过；测试结尾删号，E2E 服务器已移除、卷保留 | [Cloud](../../code/reports/edition-freeze-2026-11-15/cloud-e2e.txt) · [Local](../../code/reports/edition-freeze-2026-11-15/local-e2e.txt) |
| 双模式点击 | Cloud 27 通过 / 3 项模式不适用，Local 29/29，0 失败；含冻结卡片→历史详情→当前更正，Local 同一入口返回 404 | [Cloud](../../code/reports/edition-freeze-2026-11-15/functional-cloud/functional-regression.md) · [Local](../../code/reports/edition-freeze-2026-11-15/functional-local/functional-regression.md) |
| 本轮移动版式 | Cloud 21 张、0 finding；整体三宽版式沿用同布局的 r13 63 张证据，不混计为本轮新截图 | [本轮](../../code/reports/edition-freeze-2026-11-15/ui-mobile/ui-review.md) · [r13](../../code/reports/ui-finish-2026-11-15/ui-cloud/ui-review.md) |
| 专项补拍 | 日报、冻结详情、当前详情各桌面/手机一张，共六张，全部实际查看，无横向溢出或脚本错误 | [断言](../../code/reports/edition-freeze-2026-11-15/pages.json) · [截图](../../code/reports/edition-freeze-2026-11-15/screenshots/) |
| 镜像边界 | 无素材、文档、报告与环境文件 | [检查](../../code/reports/edition-freeze-2026-11-15/image-boundaries.json) |

两套 check 之后，浏览器脚本仅追加了目标 ID 与 URL 一致性断言，已单独通过[格式](../../code/reports/edition-freeze-2026-11-15/script-format.txt)、[lint](../../code/reports/edition-freeze-2026-11-15/script-lint.txt)及上述双模式真实浏览器回归；生产模块未再修改。

## 最终运行与人工截图

镜像 `agent-learning-hub:verification-20261115-r14`，本地 image ID `sha256:4b1f03a36a44c20d66c302faa30a21eddffeb5c25093ddb433a97086ab4637c7`。Cloud、Local、worker 均健康，仅绑定 `127.0.0.1:3322` / `3323`；隔离预览卷沿用 r10，E2E 使用新的 r14 卷。日常实例没有升级。

合成记录带明确的“验收示例 / 合成验收样本”标识，使用受控时钟创建 2026-11-14 期；这不是实际日期出刊或真实资讯质量证据。[播种数据](../../code/reports/edition-freeze-2026-11-15/fixture.json) · [播种脚本快照](../../code/reports/edition-freeze-2026-11-15/seed-editorial-freeze.mts.txt)。

- [手机日报](../../code/reports/edition-freeze-2026-11-15/screenshots/edition-mobile.png)
- [手机冻结详情](../../code/reports/edition-freeze-2026-11-15/screenshots/frozen-mobile.png)
- [手机当前更正](../../code/reports/edition-freeze-2026-11-15/screenshots/current-mobile.png)

[结构化记录](../../code/reports/edition-freeze-2026-11-15/verification.json)。README、AGENTS、GUIDE、spec、plan、tasks、测试策略与脚本分类已同步。本轮结束时 GitHub PR #1 的四文件 CI 修复尚待范围确认；用户随后确认追加，远程五项 CI 已全部通过，见[CI 修复验收](./curation-ci-repair-review-2026-11-15.md)。供应商账单、维护者合并发布、公网运维及十条缺失本地副本继续待验收。
