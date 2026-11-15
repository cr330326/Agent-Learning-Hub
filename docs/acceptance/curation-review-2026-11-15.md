# 真实收录 PR 的预检与验收

日期：2026-11-15。用户确认具体目录差异后，已通过 GitHub App 创建[收录 PR #1](https://github.com/cr330326/Agent-Learning-Hub/pull/1)，保持未合并、未发布。下文保留提交前的具体预览；初次结果见末节；用户随后确认追加四文件，当前六文件 CI 已全部通过，详见[修复验收](./curation-ci-repair-review-2026-11-15.md)。

- 目标仓库：`cr330326/Agent-Learning-Hub`，基线 `main@9bfeb9798b4a141c71ed173de502f7ad657f7742`；已通过 GitHub 文件接口读取并核对本地 Git 对象 SHA，未写远程。
- 条目：[Anthropic 长时运行 Agent 的 Harness 设计](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)。上游目前重定向到 `/research/` 同名文章，保留原始出处。
- 归属：`agentic` 轨道，`stage-3`「研究现代 Agent Harness」与 `stage-7`「评测、可观测性与安全」。稳定 ID：`anthropic-long-running-agent-harness`。
- 内容仅为中文摘要、收录理由、前置知识和上游地址；`upstream-only`、第三方资料，作者 `Anthropic Engineering`，许可证待确认，不复制原文正文或本地素材。
- 真实操作会创建 `codex/learning-news-7f7a70a6764975801eea23bab1b78e6c` 分支与收录 PR；不合并、不创建发布 tag、不发布网站。

完整目录变更为 **63 行 unified diff**，仅新增一条课程记录及两处阶段引用：[查看差异](../../code/reports/curation-review-2026-11-15/curation-preview.patch)。[收录参数](../../code/reports/curation-review-2026-11-15/proposal.json) · [PR 正文](../../code/reports/curation-review-2026-11-15/pull-request-body.md) · [生成格式检查](../../code/reports/curation-review-2026-11-15/generated-format-check.txt)。

本地通过实际 `createCurationPullRequest()`，使用只在内存中工作的 GitHub 客户端生成树与 PR 请求；网络写入次数为 0。生成目录通过完整 schema 校验，保留其他课程的成员顺序与来源字段。此前生成器重排了全文件，预览产生 10658 行差异且格式检查失败；已修复为复用仓库 Prettier 配置并保留原目录对象。回归：[格式失败](../../code/reports/curation-review-2026-11-15/format-red.txt) · [格式通过](../../code/reports/curation-review-2026-11-15/format-green.txt) · [原记录保留](../../code/reports/curation-review-2026-11-15/preserve-green.txt)。

最终生产镜像 `verification-20261115-r12` 内直接运行格式校验通过，证明 Prettier 已属于生产依赖；Cloud、Local 与 worker 启动健康。[生产格式器证据](../../code/reports/curation-review-2026-11-15/production-formatter.txt)。真实创建与重试已补验，维护者合并及版本上线仍不能由本地预览代替。

## 真实结果与 CI

用户明确确认“按此预览创建收录 PR”后，由应用自身的 `CurationGitHub` / `createCurationPullRequest()` 操作。提交前逐字比对生成文件与已确认预览，限制目标仓库、基线、分支、两份目录文件及 PR 正文；没有提交本地开发工作区。

- PR：[cr330326/Agent-Learning-Hub#1](https://github.com/cr330326/Agent-Learning-Hub/pull/1)，作者 `agent-learning-hub-cr330326[bot]`。
- 初次创建的 head：`8e007d71c1a0bb458839252cbc62f73149f43cd0`；两份文件共增加 37 行、删除 2 行，与 63 行 unified diff 的预览一致。
- 第二次执行复用同一 PR，新增 PR 请求为 0；临时安装令牌已撤销（HTTP 204）。[实际事件与断言](../../code/reports/curation-review-2026-11-15/live-pr.json)。
- 未合并、未打 tag、未发布网站。T9.7 的真实创建与幂等部分已完成。

[首次远程 CI](https://github.com/cr330326/Agent-Learning-Hub/actions/runs/43694919525) 的仓库边界及 Cloud clean-room 镜像通过，Cloud/Local 质量及依赖门禁失败：目录单测写死 384 条，新增资料后为 385；远程 main 锁定的旧 Better Auth / 适配器触发 `npm audit` 失败。原始失败见[目录测试](../../code/reports/curation-review-2026-11-15/ci-initial-cloud.txt)与[依赖审计](../../code/reports/curation-review-2026-11-15/ci-initial-dependency.txt)。首次失败后没有绕过检查，修复先在隔离检出验证。随后用户明确确认追加四文件，App 已更新 PR 为六文件，新 CI 五项全部通过，见[CI 修复与追加验收](./curation-ci-repair-review-2026-11-15.md)。
