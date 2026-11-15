# OpenCode 整课连续阅读验收

2026-11-15，Mac Docker 本地验收。用户确认范围为整门 OpenCode 课程修复及其他本地课程同类排查。

## 问题与修复

旧入口 `/read/legacy-reading-14-003` 只拥有介绍这一份 Markdown，课程卡只声明 README 和导览，阅读器无法得到后续课节。修复前 HTTP 复现返回 200，但 `.reader-pager a[rel=next]` 数量为零。[修复前证据](../../code/reports/course-navigation-2026-11-15/runtime-red.txt)

依据作者中文 VitePress 教学目录手工补齐 `legacy-course-017`，保留作者顺序的 108 个教学与附录页面，加上 README 和总导览，共 110 个可读页面。上游版本日志单独保留在原站。九个旧单节 ID 按 ADR 0008 退场并转发到课程的对应课节。旧学习记录继续按原 ID 保留，进入课程后的状态使用课程 ID。[目录来源与摘要](../../code/reports/course-navigation-2026-11-15/opencode-curation.json)

课程目录和正文末尾的上一节、下一节使用同一个 `listLocalChapters()` 顺序。长目录默认折叠，展示当前节和总数，支持键盘展开。手机端将课程目录放在本页目录之前，正文末尾介绍课的下一节进入安装课。

正文内无扩展名、目录和根相对路由只映射至已声明且可读的课节。根相对路由要求显式 `documentRoot`，未知、越界或歧义目标降级为纯文本。现有图片白名单继续约束图片访问。内容归属沿用已接受的 ADR 0008，文档根映射属于本次实现细节。[规格 READ-013、READ-014](../plans/spec.md)

## 验证结果

最终应用镜像为 `agent-learning-hub:course-navigation-20261115-r2`，镜像 ID 为 `sha256:989bf028be73d77ab2a5910e1317d80c0f469f82660f0e685935de98352742f3`。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Cloud / Local 代码门禁与生产构建 | 双模式各 230 单测、11 工具测试通过，内容审计 0 errors | [Cloud](../../code/reports/course-navigation-2026-11-15/check-cloud.txt)、[Local](../../code/reports/course-navigation-2026-11-15/check-local.txt) |
| Docker Cloud 身份与学习状态 E2E | 47 项通过，真实 Better Auth 会话、删号级联 | [Cloud E2E](../../code/reports/course-navigation-2026-11-15/cloud-e2e.txt) |
| Docker Local E2E | 公共页面、健康边界及学习状态生命周期通过 | [Local E2E](../../code/reports/course-navigation-2026-11-15/local-e2e.txt) |
| 点击回归 | Local 29/29，Cloud 24 项通过、4 项跳过 | [Local](../../code/reports/course-navigation-2026-11-15/functional-local/functional-regression.md)、[Cloud](../../code/reports/course-navigation-2026-11-15/functional-cloud/functional-regression.md) |
| 三种宽度版式走查 | Local 54 张、Cloud 63 张，均 0 finding | [Local](../../code/reports/course-navigation-2026-11-15/ui-local/ui-review.md)、[Cloud](../../code/reports/course-navigation-2026-11-15/ui-cloud/ui-review.md) |
| 整课逐页验证 | 110 个页面全部返回 200，正文、当前节及前后链接符合课程顺序，首尾边界正确 | [一次性实例日志](../../code/reports/course-navigation-2026-11-15/all-chapters.txt)、[3003 实测](../../code/reports/course-navigation-2026-11-15/daily-all-chapters.json) |
| 桌面与手机专项截图 | 共 8 张逐张查看，旧 ID、下一节安装课和正文内课节链接通过 | [验证摘要](../../code/reports/course-navigation-2026-11-15/screenshots.json)、[截图目录](../../code/reports/course-navigation-2026-11-15/screenshots/) |

Cloud 的四项跳过包括三项 Local 专有能力和一项需要日报样本的跳转。新增 OpenCode 用例在两个模式都实际执行，覆盖 Local 连续阅读和 Cloud 对应章节的上游入口。端到端与交互写入均使用独立 Docker 卷的一次性实例，正式试运行实例执行公共只读检查。

本次补了能抓住原缺陷的目录归属、顺序与链接单元测试，以及旧 ID、上一节、下一节、首尾、手机目录位置和键盘操作的点击断言。三种宽度的整体截图已按模式查看总览，课程八张专项截图逐张检查。手机端目录位置问题在第一轮截图后修复，再用最终镜像复验。

## 当前 Mac 试运行

`agent-learning-hub-trial` 的 Local、Cloud 和 worker 三个容器均已换为最终镜像并通过健康检查。Local 在 `http://127.0.0.1:3003`，Cloud 在 `http://127.0.0.1:3002`。旧介绍课入口现在转到整课的介绍节，110 页验证也在实际 3003 上通过。[切换记录](../../code/reports/course-navigation-2026-11-15/trial-upgrade.txt)、[容器状态](../../code/reports/course-navigation-2026-11-15/trial-containers.json)、[原入口复验](../../code/reports/course-navigation-2026-11-15/runtime-daily.json)

切换前在线备份了 Local 学习库及 Cloud 双库，全部恢复至全新目录并通过核验。加密备份在 `/Users/vsh9p8q/.agent-learnning/backups/course-navigation-20261115/`，使用既有清理备份的受限权限口令文件。切换前后两份学习库的账户、会话及个人记录表行数和摘要全部一致，运行指标表随请求更新。[备份核验](../../code/reports/course-navigation-2026-11-15/backup-verification.json)、[数据保留核验](../../code/reports/course-navigation-2026-11-15/state-preservation.json)

两种模式的公共页面和健康边界在当前端口通过，worker 保持模型处理关闭。[Local 公共检查](../../code/reports/course-navigation-2026-11-15/daily-local-smoke.txt)、[Cloud 公共检查](../../code/reports/course-navigation-2026-11-15/daily-cloud-smoke.txt)

## 其他本地课程排查

覆盖全部 41 个有效旧站课程卡，记录声明路径、磁盘基线、同仓库独立课节和集合边界。其中 20 个存在需要进一步核对作者目录的连续阅读候选，5 个是多项目集合，10 个未发现同类独立课节归属缺口，6 个缺少可读仓库基线。OpenCode 已完成独立策展和整课验证。[逐项排查表](../../code/reports/course-navigation-2026-11-15/other-course-audit.md)、[结构化明细](../../code/reports/course-navigation-2026-11-15/other-course-audit.json)

其余候选的作者顺序、合适的课节边界和退场关系仍待逐门核对。本次关闭 T8.22 的排查项，其他候选整课补齐继续列为待策展工作。

本轮验收结束后已移除两个一次性容器、六个测试卷及四个旧应用/构建镜像标签，保留当前运行镜像与四个日常持久卷。[清理记录](../../code/reports/course-navigation-2026-11-15/fixture-cleanup.txt)
