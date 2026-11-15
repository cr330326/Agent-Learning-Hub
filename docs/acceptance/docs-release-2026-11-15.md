# 文档发布、Docker 清理与 Mac 试运行

日期：2026-11-15（Asia/Shanghai）；文档版本：2026.11.15。

## 结果与范围

按当前工作区实现核对，保留原有未提交的资讯聚合代码与验收记录。本轮修改文档、手册截图和 Mac Compose 的固定镜像标签，没有修改业务代码、数据库结构或已接受的产品边界。工作区另有并发的技能整理改动，不属于本轮交付。

- 正式发行 [CHANGELOG](../../CHANGELOG.md) 与 [GUIDE](../../GUIDE.md)，同步 README、USER、AGENTS、CLAUDE、REVIEW、spec、plan 和任务复核。`tasks.md` 是现有任务事实源，用户请求中的 `task.md` 不另建副本。
- 生成 [服务分层](../plans/architecture.svg)、[内部依赖](../plans/module-deps.svg)、[外部依赖](../plans/external-deps.svg)、[核心数据字段](../data/data-model.md) 和 [ER 图](../data/data-model-er.svg)。
- 本项目是 TypeScript 工程，没有 Java Entity/JPA 或 Java 依赖。外部图按运行库、运行设施、外部 API 三色表达；前后端同属 Next.js Web 服务，worker 独立运行，队列和认证均为嵌入能力。

## Docker 清理与保留策略

仅删除已识别的本项目旧镜像和本轮一次性资源；不使用全局 `system prune -a --volumes`，不删除其他项目的停机容器或无容器引用的命名数据卷。

| 对象       | 处理                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 旧镜像     | 删除本项目 17 个旧标签：aggregation r1、r3～r16、aggregation-test-builder、course-navigation r2；完整 ID 与结果见 image-cleanup.json |
| 回退与现役 | 保留 `aggregation-20261115-r17` 与新 `docs-2026.11.15`，不使用 latest                                                                |
| 旧容器     | 盘点时没有本项目已停止容器；保留其他项目容器。Compose 正常替换现役三容器                                                             |
| 测试容器   | 验证结束删除明确命名的 3 个 alh-docs 测试容器；短命 runner 均使用 --rm                                                               |
| 匿名卷     | 只删除实测为空且删除时仍未引用的 `795fad…`；`5a4fa7…` 删除前被其他容器重新引用，Docker 拒绝后保留；另外两个有内容的匿名卷保留        |
| 测试卷     | 删除本轮专用 local-state、cloud-state、discovery、local-clean-state 共 4 个命名卷                                                    |
| 持久卷     | 保留 Local 学习卷、Cloud 学习卷、资讯卷、临时原文卷四个现役卷；不按 dangling 状态猜测数据可删除                                      |
| 构建缓存   | 保留共享构建缓存，避免影响其他项目。临时测试镜像另行删除                                                                             |

前后 Docker 全局占用见 `docker-disk-before.txt` 与 `docker-disk-after.txt`。镜像共享层、构建缓存及其他任务同时变化，因此不把标签 Size 相加声称实际释放空间。原始清单、删除日志位于 [证据目录](../../code/reports/release-2026-11-15/)。

## 数据保护与镜像试运行

镜像：`agent-learning-hub:docs-2026.11.15`，本机 linux/arm64；镜像清单标识 `sha256:8c62ec92ca30c278720aec54b2c15840fc8da6e1c026604e87e70562435c647c`。`docker-build.log` 保留构建过程；文档不进入 runner 镜像，文档包单独发行。

Cloud 两库经共同批次在线备份 API 加密，Local 学习库单独在线加密备份；没有手工复制 SQLite、WAL 或 SHM。备份位于仓库外 `/Users/vsh9p8q/.agent-learnning/backups/docs-2026-11-15/`，独立口令文件为 `/Users/vsh9p8q/.agent-learnning/environments/local/docs-release-backup.env`（0600，未输出密钥）。既有主环境文件保持符号链接及 0600。

升级后三容器健康，Local `127.0.0.1:3003`、Cloud `127.0.0.1:3002`，worker 保持原有模型处理关闭设置。Local 与 Cloud 的九张身份/个人状态表升级前后行数和 SHA-256 指纹全部一致；报告只保存计数与指纹，不保存私人正文。健康接口分别返回正确模式。

两次观测间隔约 104 秒，成功采集任务从 220 增至 226，十个启用信源的最近成功时间推进、错误均为空，验证新 worker 继续执行真实聚合。该短观测不是长期 SLA、付费模型或公网验证。

## 实际验证

| 层级                      | 本轮结果                                                                           | 证据                                                  |
| ------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| check:cloud / check:local | 各 51 测试文件、237 单测及 11 工具测试通过；格式、lint、类型和生产构建通过         | check-cloud.log / check-local.log                     |
| 内容审计                  | Cloud 0 errors / 1799 warnings；Local 0 errors / 1813 warnings                     | 同上；warning 不等于错误已消除                        |
| Docker E2E Cloud          | 公开页面与健康通过；真实 Better Auth 签会话后 47 项通过，GitHub token/profile 为桩 | e2e-cloud.log                                         |
| Docker E2E Local          | 公开页面、健康、个人状态生命周期、导出和删号通过                                   | e2e-local-clean.log                                   |
| 点击回归                  | Local 29/29；Cloud 24 通过 / 4 跳过 / 0 失败                                       | functional-local / functional-cloud                   |
| 版式与截图                | Local 54 张、Cloud 63 张，均 0 finding；117 张逐屏复核，四张图表另行渲染检查       | ui-local-reader / ui-cloud-reader；contact-01～10.jpg |
| 两库恢复                  | 10/10，含完整性、行数、跨库目标、租约复位、付费回执及三组反向对照                  | restore/discovery-restore-drill.md                    |
| 文档                      | 相对路径、格式、字段完整性和 SVG XML 校验通过；正式包及 SHA 清单已生成             | docs-check.log / 文档发布清单                         |

HTTP E2E 全部使用独立 Docker 命名卷，Cloud 测试与服务在 Docker 内共享 SQLite 文件系统。Cloud 点击跳过项为：未种入日报的期次跳转，以及三项 Local 专属阅读行为；真实日报冻结契约保留既有专项证据，本次不把跳过当通过。

## 发现的问题与处理

1. Playwright 当前版本对应的捆绑 Chromium/WebKit 未安装；采用脚本支持的 `PLAYWRIGHT_CHANNEL=chrome`，浏览器检查完成。图表首次直接打开 SVG 截图超时，改为页面内嵌 SVG 后成功，不改变图内容。
2. 首次 Local E2E 命中点击回归留下的合成进度，安全保护拒绝运行。没有设置 E2E_ALLOW_DESTRUCTIVE，另起全新一次性卷后通过。失败日志保留为 e2e-local.log。
3. 主环境未配置 BACKUP_PASSPHRASE，首次备份未启动；创建仓库外专用 0600 口令文件后，在线加密备份与恢复演练完成。
4. 构建存在 middleware 命名弃用提示与 10 条 Turbopack 文件模式 warning，构建通过；本轮未为文档交付引入代码迁移。
5. 静态分析存在模块聚合环与类型引用环；文件运行时环为 learning-state 的 discovery-state.ts 与 repository.ts，已在图中标红，没有据此声称运行故障或擅自重构。

## 交付状态与限制

代码事实与运行态为 verified-current；文档与规则为 changed-and-verified；长期记忆为 out-of-scope（未修改）；本轮测试资源为 cleaned，其他会话改动原样保留。历史 REVIEW 的无模型假设已标明仅适用于旧基线。

本次是仓库文档发行与 Mac Docker 验证。未重复运行真实浏览器 OAuth 授权、供应商计费、课程 PR 合并发布、x86 目标镜像、公网 DNS/TLS、异地调度或长期无人值守验收；不把既有未完成任务关闭。未来工作以 [tasks.md](../plans/tasks.md) 为准。
