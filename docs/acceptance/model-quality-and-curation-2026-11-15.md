# 真实模型校准、收录与界面复验

日期：2026-11-15（北京时间）。延续[阅读器与限额续验](./material-reader-model-recovery-2026-11-15.md)。本轮真实调用和回执全部位于独立验收库，不启动日常模型 worker，不改实际环境文件的价格，不向飞书写数据。用户确认后已由 GitHub App 创建[收录 PR #1](https://github.com/cr330326/Agent-Learning-Hub/pull/1)，真实结果与 CI 缺口见[收录验收](./curation-review-2026-11-15.md)。

## 真实摘要、限额与预算

使用 DeepSeek 的 `deepseek-flash`，通过应用自身 `fetchPublic()` 与 `processDiscoveryVersion()` 验证实际公开原文提取、结构化摘要、分类、发布策略、缓存回执与预算结算。两轮各包含三篇真实工程文章和三条明确标注的合成对照。真实文章来自 [Anthropic 长时 Harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)、[Agent 模式](https://www.anthropic.com/engineering/building-effective-agents)、[LangChain 上下文工程](https://blog.langchain.com/context-engineering-for-agents/)，均实际提取成功；报告保存正文长度与哈希，不保存原文正文，临时副本已清理。

首轮发现纯英文标题、证据不足的影响力评价，以及无关输出被误判为结构失败。提示词升级为 `engineering-summary-v2`，明确中文标题、依据与限制、合成内容标记；schema 允许相关度为 0 的空主题，相关内容仍必须有主题。既有摘要保持可读取，不自动触发全库重算。

| 最终样本 | 处理 | 加权分 | 日报准入 |
| --- | --- | ---: | --- |
| Anthropic 长时 Harness | ready | 38 | 是 |
| Anthropic Agent 模式 | ready | 38 | 是 |
| LangChain 上下文工程 | ready | 29 | 是 |
| 合成虚构宣传 | off-topic | — | 否 |
| 合成烹饪文本 | off-topic | — | 否 |
| 含恶意指令的合成工具案例 | ready，证据不足 | 22 | 否 |

六条结果均通过结构校验、生成中文标题，重复处理未新增模型调用；没有执行来源中的改标题、强制打分或输出密钥指令。人工复核三篇摘要的核心方法和限制与原文一致；这只是首轮小样本校准，不代表全部来源或长正文都已达到同等质量。

新增日报准入使用 DISC-011 的统一阈值，再排序与限量；人工选排不能绕过准入，低证据内容不会因未满 10 条而入选，旧日报不重新筛选。回归同时覆盖真实得分轮廓、重要动态和边界分值。先失败后通过：[quality-red](../../code/reports/model-quality-2026-11-15/quality-red.txt) / [quality-green](../../code/reports/model-quality-2026-11-15/quality-green.txt)。[最终真实结果](../../code/reports/model-quality-2026-11-15/v2/results.json) · [六样本与候选断言](../../code/reports/model-quality-2026-11-15/v2/calibration.json)。

单独的供应商限额探针请求 `max_tokens=16`，实际输出用量恰为 16，结束原因 `length`；生产摘要请求均发送 2048 上限，见[首轮及探针](../../code/reports/model-quality-2026-11-15/results.json)。本轮共 13 次真实请求，按保守峰值、缓存未命中输入 2 / 输出 8 元每百万 token 估算 **¥0.138572**；最终轮账本 73048 微元，预留归零，六条回执成功。以上是按实际用量和配置费率的估算，**不是供应商账单金额**。

按[官方余额接口](https://api-docs.deepseek.com/api/get-user-balance/)在最终轮前后只读查询，观测差值为 0；没有将其解释为免费或账单核对通过，未在报告保存账户余额。实际计费可能尚未反映或有其他结算条件，T9.4 的账单核对继续待验收。原始探针代码作为文本记录：[处理探针](../../code/reports/model-quality-2026-11-15/model-quality-probe.mts.txt) · [准入断言](../../code/reports/model-quality-2026-11-15/validate-quality-probe.mts.txt)；均为当次验收快照，不是默认门禁，不能无意重复触发付费请求。

## 收录生成器

用实际 `createCurationPullRequest()` 和当前远程 main 的目录做本地预检时，原生成器产生 10658 行格式差异，并无法通过格式检查。现使用仓库 Prettier 配置，保留原课程对象成员顺序及来源字段；同一预览缩到 63 行，仅新增一条课程和两处阶段引用，schema 与格式检查通过。Prettier 已由开发依赖调整为固定版本生产依赖，最终镜像直接验证格式器可用。详见[具体收录预览](./curation-review-2026-11-15.md)。用户随后确认具体预览，已由 GitHub App 创建 PR #1 并验证幂等，未提交本地开发工作区。

## r12 容器与界面基线

模型与收录格式复验镜像 `agent-learning-hub:verification-20261115-r12`，本地 manifest digest / image ID：`sha256:d5b67fd576ab0500147de4e78c92f0b3c825993ce9aa6e65256fc3cbdb3513e0`。Cloud、Local、worker 健康，继续仅绑定 `127.0.0.1:3322` / `127.0.0.1:3323`；使用隔离预览卷。状态 E2E 使用新建的 r12 一次性卷，共享 Linux 文件系统，最后删号。日常实例未升级。

| 验证 | 结果与范围 | 证据 |
| --- | --- | --- |
| Cloud / Local check | 各 222 项单测、11 项工具测试，格式、lint、类型、内容审计、生产构建通过 | [Cloud](../../code/reports/model-quality-2026-11-15/check-cloud.txt) · [Local](../../code/reports/model-quality-2026-11-15/check-local.txt) |
| r12 Docker E2E | Cloud 47 项，Local 公开、健康、状态生命周期通过 | [Cloud](../../code/reports/model-quality-2026-11-15/cloud-e2e.txt) · [Local](../../code/reports/model-quality-2026-11-15/local-e2e.txt) |
| 本轮完整版式 | r10 的同一 UI 实现：Cloud 63 张、Local 串行复跑 54 张，均 0 finding；后续收录格式修复不改界面 | [Cloud](../../code/reports/model-quality-2026-11-15/ui-cloud/ui-review.md) · [Local](../../code/reports/model-quality-2026-11-15/ui-local/ui-review.md) |
| r12 日报与摘要补验 | 桌面/手机三条精选、冻结摘要详情与管理员候选共 5 张截图，均实际查看；候选窗口内的低证据对照被排除 | [断言](../../code/reports/model-quality-2026-11-15/quality-pages.json) · [截图目录](../../code/reports/model-quality-2026-11-15/screenshots/) |
| 点击回归 | r12 Cloud 26 通过/3 项模式不适用，Local 28/28；含日报冻结版本跳转、模式隔离及按正文切换等待的阅读翻页 | [Cloud](../../code/reports/model-quality-2026-11-15/functional-cloud/functional-regression.md) · [Local](../../code/reports/model-quality-2026-11-15/functional-local/functional-regression.md) |
| 交付边界 | 无本地素材、文档、报告或环境文件；生产格式器验证通过 | [镜像](../../code/reports/model-quality-2026-11-15/image-boundaries.json) · [格式器](../../code/reports/curation-review-2026-11-15/production-formatter.txt) |

界面数据均为隔离验收记录。日报三篇真实文章保留其原始日期；入刊窗口使用明确记录的合成发布时间，不能作为实际近期资讯出刊证据。[播种记录](../../code/reports/model-quality-2026-11-15/ui-fixture.json)。GUIDE 新增[日报截图](../images/guide/edition-desktop.png)。

并行走查期间 Local 搜索曾出现一次 30 秒导航超时，失败证据保留在 [ui-local-concurrent](../../code/reports/model-quality-2026-11-15/ui-local-concurrent/ui-review.md)；单独三次请求完整响应为 217、267、480 毫秒，串行 54 张复跑通过，[响应测量](../../code/reports/model-quality-2026-11-15/local-search-timing.json)。未稳定复现根因，也未放宽超时掩盖结果。另修复点击回归中的固定 400/600 毫秒等待，改为等待实际正文切换，避免慢响应被误报为翻页错误。

启动时发现根 `.env` 兼容符号链接缺失，真实环境文件仍在且为 0600；只重建了指向既定路径的链接，没有改写配置或输出密钥。无法据此认定链接缺失的原因。后续启动显式读取真实环境文件。

T9.4b（首轮质量校准）、T9.7a（收录格式修复）和 T9.7b（真实 App PR 创建/幂等）已关闭。当轮 PR #1 的 CI 修复已隔离验证；用户随后确认追加四文件，六文件 PR 的远程五项 CI 已全部通过，见[CI 修复验收](./curation-ci-repair-review-2026-11-15.md)。实际账单、维护者合并与版本上线、公网和长期运行、十条素材副本仍待验收；余额零差值不替代账单证据。

## r13 截图复核与最终本地镜像

再次实际查看手机截图时发现日报大标题将日期拆为“2026-11-”和“15”。现把日期移到独立的小标题行，主标题为“精选日报”；沿用既有组件与字号体系，没有改冻结版本、出刊日期或原文日期。新增 `functional-regression.mjs` 断言：375px 下日期完整且只有一行，日期与 URL 一致，主标题独立。断言在旧 r12 镜像上失败、r13 上通过，[修复前失败证据](../../code/reports/ui-finish-2026-11-15/functional-before/functional-regression.md)。

最终本地镜像为 `agent-learning-hub:verification-20261115-r13`，本地 image ID 为 `sha256:a0c982c0c1f539c0f5c0d2f7d070743d47142294c909053a604b816698c68074`。Cloud / Local / worker 健康，预览地址仍为 `127.0.0.1:3322` / `3323`。没有更新日常实例；当时远程 PR 仅有两份已确认的目录文件，后续追加见上述 CI 修复验收。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 双模式 check | 各 222 单测、11 工具测试及格式、lint、类型、内容审计、生产构建通过 | [Cloud](../../code/reports/ui-finish-2026-11-15/check-cloud.txt) · [Local](../../code/reports/ui-finish-2026-11-15/check-local.txt) |
| r13 Docker E2E | 新建独立 r13 卷，Cloud 47 项、Local 状态生命周期通过，结尾删号；E2E 服务器已移除、卷保留 | [Cloud](../../code/reports/ui-finish-2026-11-15/cloud-e2e.txt) · [Local](../../code/reports/ui-finish-2026-11-15/local-e2e.txt) |
| Cloud 版式走查 | 63 张、0 finding；实际查看三张桌面/平板/手机总览 | [报告](../../code/reports/ui-finish-2026-11-15/ui-cloud/ui-review.md) · [总览](../../code/reports/ui-finish-2026-11-15/contact-sheets/) |
| 双模式点击回归 | Cloud 26 通过/3 项模式不适用、Local 28/28，0 失败；含 375px 日期断言与冻结版本跳转 | [Cloud](../../code/reports/ui-finish-2026-11-15/functional-cloud/functional-regression.md) · [Local](../../code/reports/ui-finish-2026-11-15/functional-local/functional-regression.md) |
| 日报、摘要与后台补拍 | 五张截图全部实际查看；三篇实文入刊、低证据候选排除、冻结摘要正常；已替换 GUIDE 日报图 | [断言](../../code/reports/ui-finish-2026-11-15/quality-pages.json) · [桌面](../../code/reports/ui-finish-2026-11-15/screenshots/edition-desktop.png) · [手机](../../code/reports/ui-finish-2026-11-15/screenshots/edition-mobile.png) |
| 镜像边界 | 无素材、文档、报告及环境文件 | [检查](../../code/reports/ui-finish-2026-11-15/image-boundaries.json) |

r13 只增加上述日报版式修复，Local 整体版式沿用前文的 54 张证据，不重复声明为本轮新截图。[本轮结构化记录](../../code/reports/ui-finish-2026-11-15/verification.json)。当时 CI 四文件补丁等待范围确认，没有随本地修复推送；后续确认、追加及远程通过见[CI 修复验收](./curation-ci-repair-review-2026-11-15.md)。
