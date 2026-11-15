# 飞书主导的本机 Docker 聚合试运行

本次按补充访谈 R4 与 ADR 0013 接入三份飞书 Base 的九个子表，以 openspace 采集结果文件补充资料。网页运行在 `http://127.0.0.1:3002`，Local 学习入口运行在 `http://127.0.0.1:3003`。当前验收继续进行，以下按实际证据逐项更新。

## 实现与数据归属

资讯 SQLite 保存规范化的标题、来源摘要、原始链接、作者、时间、来源关联、内容版本及同步状态，学习状态 SQLite 保存身份和个人记录。飞书字段使用稳定 ID 映射，AIHot 的历史“文本”列作为标题回退，部分链接使用备用字段。原始记录的富文本和超链接对象统一解析为有效 HTTP(S) 链接。

聚合来源使用来源内容发布路径。飞书配置展示优先级 100，openspace 为 10。相同链接聚合来源关系，优先来源缺失的摘要、作者或时间可由补充来源提供。URL 修订保存稳定条目 ID 与 URL 关联，重复同步保留版本与指标幂等，人工撤下的条目继续保留撤下状态。

worker 每 5 分钟检查更新。页面每 30 秒刷新当前路由数据并保留筛选和分页，回到可见页面时刷新。同步异常时保留最近成功内容并提示重试。卡片提供来源与原站入口，长标题限制三行，详情页保留内容。

## openspace 接入范围与凭据

通过已有授权 GitHub CLI 凭据验证私有仓库读取，将该凭据引用写入仓库外本机环境文件的 `OPENSPACE_GITHUB_TOKEN`，文件保持 `0600`，Compose 注入网页和 worker。该本机凭据后续需要随其授权和有效期维护。原 GitHub App 的仓库安装查询返回 404，读取接入使用现有 CLI 凭据。

文件规则覆盖根目录 `harness_engineering_youtube_results.json`、`harness_engineering_youtube_videos.json`，以及 `memory/daily/` 中带日期的 `clawhub-skills`、`github-skill-repos`、`youtube-skill-videos`、`bilibili-skill-videos`、`youtube-harness-engineering`、`bilibili-harness-engineering`、`aihot-selected` JSON。首次文件树核对包含 1,226 个匹配文件，按提交版本固定导入范围。解析发布结果数组并统计无效行，记录文件路径、blob SHA、提交 SHA、记录 ID 与解析版本。后续跳过未变化文件并完成来源对账；更旧快照保持新观测的内容。

## 升级前备份

通过既有双库在线备份入口产生加密共同批次 `cc58476e-9d97-429d-be36-7c70c2e1f063`，备份位于 `/Users/vsh9p8q/.agent-learnning/backups/aggregation-20261115/`。口令保存在该仓库外目录的 `backup.env`。升级前两库 schema 均为 3，本轮资讯迁移扩展 GitHub 文件清单和 URL 关联。

## 验证进度

| 验证项 | 当前证据 |
| ------ | -------- |
| 聚合专项回归 | 4 项通过，覆盖源内容发布、URL 修订、多来源优先级、撤下保护、指标幂等、历史快照及 GitHub 文件跳过 |
| Cloud 状态 E2E | 隔离 builder 容器内 47 项通过，包含 Better Auth 登录、资讯个人状态、导出与删号 |
| Local 状态 E2E | 隔离 builder 容器内 HTTP 与状态生命周期通过 |
| Local 功能走查 | 24/24 通过，日常实例使用 `--skip-state` |
| Local UI 走查 | 48 张截图、零 finding |
| Cloud UI 与功能 | 57 张截图、零 finding，25 项通过、3 项 Local 阅读器专属场景跳过；长标题、窄屏搜索和自动刷新断言通过 |
| 双模式完整门禁 | `check:cloud`、`check:local` 均通过，各 51 文件 / 234 单测及生产构建 |
| 真实信源与周期同步 | 飞书九表首轮分页已完成，openspace 历史文件正在导入，后续周期同步待复核 |

所有日志、截图与结构化运行核查写入 `code/reports/aggregation-2026-11-15/`。状态 E2E 使用容器内一次性库，应用与测试共享文件系统；日常预览的 UI/功能检查使用匿名上下文，个人数据验证由隔离 E2E 提供。

最终网页与 worker 镜像为 `agent-learning-hub:aggregation-20261115-r7`。实际浏览器点击聚合卡片可打开对应 GitHub 仓库，30 秒刷新保留来源、类型和第二页，详情中的原文入口可见，过程零页面错误，见 `browser-aggregation.json`。桌面与手机视口截图已人工复核，发现页的用户手册截图同步更新。
