# Mac Docker 清理与已有镜像试运行

日期：2026-11-15。用户要求清理本项目冗余镜像、容器和卷，并基于已有最新镜像重建本机试运行环境。本次不构建新镜像、不发布、不合并 PR，不操作其他项目。

## 当前入口

| 模式 | 地址 | 用途 |
| --- | --- | --- |
| Local | <http://127.0.0.1:3003> | 免登录学习、本机素材只读阅读、个人进度 |
| Cloud | <http://127.0.0.1:3002> | 资讯与 GitHub 登录，沿用原账户及资讯库 |

运行入口为 [docker-compose.mac-trial.yml](../../code/docker/docker-compose.mac-trial.yml)，Compose 项目 `agent-learning-hub-trial`，三个容器为 `local`、`cloud` 和 `worker`。镜像固定为 `agent-learning-hub:verification-20261115-r14`，image ID 为 `sha256:4b1f03a36a44c20d66c302faa30a21eddffeb5c25093ddb433a97086ab4637c7`，是本机已存在的最新运行镜像；没有按标签中的数字误选构建更早的 `phase9-r15`。三个容器均为新建，健康状态正常，端口只绑定回环地址，设置 `restart: unless-stopped`。

环境变量仍只从 `/Users/vsh9p8q/.agent-learnning/environments/local/.env` 读取，没有复制凭据。OAuth secret、client ID/secret 与旧实例核对一致，Cloud URL 仍为 3002，原 GitHub App 私钥保持只读挂载。模型 worker 维持原实例的未启用状态；Compose 显式不注入模型名称，不因实际环境文件已有模型配置而自动触发调用。采集来源没有被本次操作启用。

## 资源清理

| 资源 | 清理前 | 删除 | 保留/新建后 |
| --- | ---: | ---: | ---: |
| 本项目容器 | 10 | 10 个旧容器 | 3 个新容器 |
| 本项目镜像标签 | 35 | 34 | 1 个 r14 运行镜像 |
| 本项目命名卷 | 57 | 53 个验收/临时卷 | 4 个持久卷 |
| 旧项目空网络 | — | 5 | 当前网络保留 |

保留卷：`agent-learning-hub-local_learning-state`、`alh-cloud-real_learning-state`、`alh-cloud-real_discovery`、`alh-cloud-real_discovery-temp`。它们在新 Compose 中声明为 external，不被普通 `down` 删除。Local 挂载的 `local-courses/` 仍为只读，没有修改第三方素材。

先停止旧实例，完成备份和新实例验证，再逐项删除已确认的旧容器和无引用临时卷；镜像逐个按项目标签删除，没有执行全局 `system prune`、`volume prune` 或构建缓存清空。其他项目原有 173 个容器均仍存在。Docker 全局镜像统计从 34.87GB 降到 18.89GB；这是逻辑统计，含共享层及其他项目并发活动，不作为 macOS 物理磁盘回收量的精确证明。共享构建缓存保留。

[清理前清单](../../code/reports/docker-cleanup-2026-11-15/inventory-before.json) · [卷核对](../../code/reports/docker-cleanup-2026-11-15/volume-inventory.json) · [实际删除清单](../../code/reports/docker-cleanup-2026-11-15/removed.json) · [清理后清单](../../code/reports/docker-cleanup-2026-11-15/inventory-after.json)。历史验收报告继续保留，所引用的旧镜像和卷已按此次要求退场。

## 数据保护与验证

清理前用 SQLite 在线备份 API 对 53 个数据库做加密备份；其中 18 个共同批次覆盖 36 个状态/资讯库，另有 17 个单库。所有备份均恢复至全新临时目录，核对完整性、表行数及库对引用后才允许清理。没有拷贝活跃 SQLite 库文件、WAL 或 SHM；解密后的恢复目录验证后已删除。

备份位于 `/Users/vsh9p8q/.agent-learnning/backups/docker-cleanup-20261115/`，目录 0700，备份及该目录下的 `backup.env` 均为 0600，不进入 Git。加密备份约 30.5MB，保留原学习状态及模型/收录验收记录；临时原文卷按生命周期清理，不重新注入真实资讯库。[备份恢复验证](../../code/reports/docker-cleanup-2026-11-15/backup-verification.json)。原 Cloud 账户数仍为 1，状态库和资讯库 `quick_check=ok`。[当前持久状态](../../code/reports/docker-cleanup-2026-11-15/persistent-state-after.json)。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| Compose 配置 | `config --quiet` 和 Prettier 校验通过 | [配置](../../code/docker/docker-compose.mac-trial.yml) |
| 三容器启动 | 使用已有镜像 `--no-build --wait`，均健康 | [启动](../../code/reports/docker-cleanup-2026-11-15/start.txt) |
| Cloud / Local 公开 HTTP | 两种模式首页、9 个公开路由、健康及管理员访问边界通过 | [Cloud](../../code/reports/docker-cleanup-2026-11-15/cloud-smoke.txt) · [Local](../../code/reports/docker-cleanup-2026-11-15/local-smoke.txt) |
| 浏览器 | 模式徽标、24 条目录分页、本地正文、Cloud 登录入口、390px 无横向溢出、无页面脚本错误 | [断言](../../code/reports/docker-cleanup-2026-11-15/browser.json) |
| 实际截图复核 | 两种模式桌面/手机首页、本地阅读器及资讯空状态，共 6 张，全部实际查看 | [截图目录](../../code/reports/docker-cleanup-2026-11-15/screenshots/) |

没有在日常试运行实例执行会删号的状态 E2E，也没有写入合成演示记录。阅读器正常访问会按产品语义创建本机身份或阅读位置；本轮未以测试脚本覆盖维护者的笔记、收藏或进度。真实资讯库原本为空，新实例仍显示等待首次采集，管理员可按既有流程配置和启用信源；此前验收样本没有混入此库。

原镜像的完整业务验证仍以 [r14 功能验收](./edition-editorial-freeze-2026-11-15.md) 为准，本次只验证运行迁移与清理，不把公开冒烟当作完整 E2E。已通过 macOS `open` 请求打开 Local 地址；Computer 浏览器入口尝试超时，页面效果通过独立 Playwright 实际截图核对。

[运行管理命令](../deploy/local-manual.md#当前-mac直接运行已有镜像) · [结构化汇总](../../code/reports/docker-cleanup-2026-11-15/summary.json)。
