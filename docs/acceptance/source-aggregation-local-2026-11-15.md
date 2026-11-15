# 飞书主导的本机 Docker 聚合试运行

本次按补充访谈 R4 与 ADR 0013 接入三份飞书 Base 的九个子表，以 openspace 采集结果文件补充资料。本机 Docker 验收已完成，聚合入口为 `http://127.0.0.1:3002/discover`，Local 学习入口为 `http://127.0.0.1:3003`。本结论覆盖本机真实数据试运行，公网部署另有既定任务。

## 实现与数据归属

资讯 SQLite 保存规范化的标题、来源摘要、原始链接、作者、时间、来源关联、内容版本及同步状态，学习状态 SQLite 保存身份和个人记录。飞书字段使用稳定 ID 映射，AIHot 的历史“文本”列作为标题回退，部分链接使用备用字段。原始记录的富文本和超链接对象统一解析为有效 HTTP(S) 链接。

聚合来源使用来源内容发布路径。飞书配置展示优先级 100，openspace 为 10。相同链接聚合来源关系，优先来源缺失的摘要、作者或时间可由补充来源提供。URL 修订保存稳定条目 ID 与 URL 关联，重复同步保留版本与指标幂等，人工撤下的条目继续保留撤下状态。

worker 每 5 分钟检查更新。页面每 30 秒刷新当前路由数据并保留筛选和分页，回到可见页面时刷新。同步异常时保留最近成功内容并提示重试。卡片提供来源与原站入口，长标题限制三行，详情页保留内容。

## openspace 接入范围与凭据

通过已有授权 GitHub CLI 凭据验证私有仓库读取，将该凭据引用写入仓库外本机环境文件的 `OPENSPACE_GITHUB_TOKEN`，文件保持 `0600`，Compose 注入网页和 worker。该本机凭据后续需要随其授权和有效期维护。原 GitHub App 的仓库安装查询返回 404，读取接入使用现有 CLI 凭据。

文件规则覆盖根目录 `harness_engineering_youtube_results.json`、`harness_engineering_youtube_videos.json`，以及 `memory/daily/` 中带日期的 `clawhub-skills`、`github-skill-repos`、`youtube-skill-videos`、`bilibili-skill-videos`、`youtube-harness-engineering`、`bilibili-harness-engineering`、`aihot-selected` JSON。首次文件树核对包含 1,226 个匹配文件，按提交版本固定导入范围。解析结果数组中的资料链接，在单文件内去重并统计无效行，记录文件路径、blob SHA、提交 SHA、记录 ID 与解析版本。后续跳过未变化文件并完成来源对账；更旧快照保持新观测的内容。

## 升级前备份

通过既有双库在线备份入口产生加密共同批次 `cc58476e-9d97-429d-be36-7c70c2e1f063`，备份位于 `/Users/vsh9p8q/.agent-learnning/backups/aggregation-20261115/`。口令保存在该仓库外目录的 `backup.env`。升级前两库 schema 均为 3，本轮资讯迁移扩展 GitHub 文件清单和 URL 关联。

## 验证结果

| 验证项 | 当前证据 |
| ------ | -------- |
| 聚合专项回归 | 5 项聚合专项与后台合并版本复核回归通过，覆盖源内容发布、URL 修订、多来源优先级、撤下保护、指标幂等、历史快照及 GitHub 文件跳过 |
| Cloud 状态 E2E | 最终镜像隔离容器内 47 项通过，包含 Better Auth 登录、资讯个人状态、导出与删号 |
| Local 状态 E2E | 最终镜像隔离容器内 HTTP 与状态生命周期通过 |
| Local 功能走查 | 24/24 通过，日常实例使用 `--skip-state` |
| Local UI 走查 | 48 张截图、零 finding |
| Cloud UI 与功能 | 57 张截图、零 finding，25 项通过、3 项 Local 阅读器专属场景跳过；长标题、窄屏搜索和自动刷新断言通过 |
| 双模式完整门禁 | `check:cloud`、`check:local` 均通过，各 51 文件 / 237 单测、11 项工具测试及生产构建 |
| 双库真实恢复演练 | 当前实际部署卷共同批次备份、全新目录恢复及反向对照，10 项通过，见 `discovery-restore-drill.md` |
| 真实信源与周期同步 | 飞书九表多轮完整分页，openspace 1,226 文件完成核对；约 5 分钟后自动缓存同步与幂等验证通过 |

所有日志、截图与结构化运行核查写入 `code/reports/aggregation-2026-11-15/`。状态 E2E 使用容器内一次性库，应用与测试共享文件系统；日常预览的 UI/功能检查使用匿名上下文，个人数据验证由隔离 E2E 提供。

最终网页与 worker 镜像为 `agent-learning-hub:aggregation-20261115-r17`。实际浏览器点击聚合卡片可打开对应 GitHub 仓库，30 秒刷新保留来源、类型和第二页，详情中的原文入口可见，过程零页面错误，见 `browser-aggregation.json`。桌面与手机视口截图已人工复核，发现页的用户手册截图同步更新。

## 上游历史内容与恢复边界

历史结果格式复核见 `historical-format-audit.jsonl`。九个文件不是有效 JSON：七个残留 Git 合并冲突标记，`clawhub-skills-2026-03-17.json` 被截断，`bilibili-skill-videos-2026-03-26.json` 实际为无视频链接的 Markdown 报告。其余无结果、采集失败或只有名称而没有可验证链接/标识的条目跳过，文件清单保留错误码和拒绝数量；没有猜测链接或改写上游仓库。

首次历史读取期间遇到 GitHub 请求超时，任务保留提交、分页游标和已写文件清单后重试。短时上游失败不清空已发布内容，也不作为来源删除证据。双库恢复演练曾使旧 worker 遇到写锁并自动重启；恢复后的队列继续执行，演练报告保留实际结果。

## 真实数据核对

2026-11-15 22:21:56（北京时间）历史导入完成快照见 `runtime-complete.json`：资讯 schema 6，完整性检查 `ok`，外键检查无异常，已发布原始链接重复组为 0，展示条目 26,872。十个信源全部启用，间隔均为 5 分钟，最后成功后无来源错误。

| 来源 | 当前有效源记录 |
| ---- | -------------- |
| 飞书 AIHot | 3,594 |
| 飞书 AI 专家动态 | 2,272 |
| 飞书 Harness Bilibili / YouTube | 825 / 655 |
| 飞书 Skills Bilibili / ClawHub / GitHub / YouTube | 1,056 / 696 / 636 / 1,687 |
| 飞书 X 动态 | 1,040 |
| openspace | 21,981 |

源记录数量含跨来源重复链接，不能相加作为展示数量。openspace 另有 334 条旧解析记录在完整对账后标记 `unverified-missing`，继续保留引用，未据此删除。最终文件清单均为解析版本 6：1,210 文件正常解析（其中含空结果文件），9 文件 JSON 无效，7 文件有内容但无有效资料链接；整轮拒绝 114 行/文件级异常。重复日期快照中的同一资料按稳定记录身份收敛。

`runtime-first.json` 至完成快照间，飞书 AIHot 记录从 3,568 增至 3,594，专家动态从 2,222 增至 2,272，说明实际运行期间的上游新增被后续轮次读取。采集只读飞书与 GitHub，没有修改远端内容。

最终周期验证见 `periodic-idempotence.json` 与 `runtime-final.json`。openspace 于北京时间 22:21:50.182 完成历史核对，22:26:53.949 自动完成下一轮，两次成功间隔 5 分 3.767 秒。下一轮仅 1 页、0 新解析记录，复用全部未变化文件。前后源记录身份/版本/状态摘要一致，GitHub 指标记录保持 29,351，全部条目保持 26,872、内容版本保持 39,217；其他飞书来源产生的 35 条指标变化独立记录。最终十个来源均无错误，SQLite 完整性与外键检查正常。

最终桌面截图 `aggregation-desktop.png` 与手机截图 `aggregation-mobile.png`、`aggregation-mobile-results.png` 已实际查看，筛选页各有 24 个原站入口，无同步异常提示或横向溢出。Cloud、Local 和 worker 均为 r17，健康且重启次数为 0；一次性状态验收容器已移除，日常命名卷保留。
