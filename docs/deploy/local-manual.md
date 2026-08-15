# 本机手动运行本地服务

这份文档面向**在自己电脑上把站点跑起来读素材**的场景，逐条给出命令、每条命令做了什么、以及怎么确认它真的成功了。

想要三行命令就开始学，看 [USER.md](../../USER.md)；这里是它的完整版，包含每一步的验证点和失败处置。云端上线走 [production-manual.md](./production-manual.md)（纯手工）或 [lighthouse-automation.md](./lighthouse-automation.md)（脚本化）。

---

## 0. 先决定走哪条路

本机有两条独立的路径，**互相不依赖**：

|              | 路径 A：开发服务器                | 路径 B：本机 Docker                    |
| ------------ | --------------------------------- | -------------------------------------- |
| 需要         | Node.js 22+                       | Docker Desktop / Engine                |
| 启动         | `npm run dev:local --prefix code` | `code/scripts/local-preview.sh`        |
| 热更新       | 有，改代码立即生效                | 无，改完要 `restart` 重新构建镜像      |
| 学习状态存哪 | `code/.data/` 下的 SQLite 文件    | Docker 命名卷                          |
| 首次耗时     | 依赖安装约 1 分钟，启动数秒       | 镜像构建约 2–5 分钟                    |
| 适合         | **日常学习、读素材、改代码**      | 验证"打包成镜像后还对不对"、双模式对照 |

**只是想学习和读素材，用路径 A。** 路径 B 的价值是它跑的是和云端一模一样的产物。

> **两条路径都只能通过 `127.0.0.1` 或 `localhost` 访问。** 本地模式的免登录身份只对回环地址成立，绑定到非回环地址时进程会直接拒绝启动，这是刻意的安全边界而不是限制。

---

## 1. 准备素材库

本地模式的全部价值在于能读 `local-courses/` 里的第三方素材正文。没有它站点也能跑，只是所有第三方条目都会降级为上游链接——那就是云端模式的样子。

素材库默认取仓库根的 `local-courses/`：

```
local-courses/
├── README.md          ← 唯一被 Git 追踪的文件（素材库元数据）
├── Learning/
├── AICoding/
├── Agentic/
└── Application/
```

四个轨道目录下是各个上游仓库的本地副本。**它们不进 Git**（`.gitignore` 里 `/local-courses/**`），需要你自己克隆或拷贝。

放在别处时用环境变量指定，路径 A 和路径 B 都认这个变量：

```bash
export LOCAL_MATERIAL_ROOT=/path/to/local-courses
```

确认素材库被正确识别：

```bash
npm run audit:materials --prefix code
```

看输出第一行。`Local Material is not mounted` 说明目录不存在或里面没有任何子目录（只有 `README.md` 不算挂载）。正常输出形如：

```
Catalog drift: 0 missing paths (0 corroborated moves, 0 uncertain, 0 gone), 3 uncatalogued repositories, 479 items without an upstream fallback.
```

`missing paths` 不是 0 时，说明目录里记的路径和磁盘对不上——见本文第 6 节。

---

## 2. 路径 A：开发服务器

### 2.1 安装依赖

```bash
npm ci --prefix code
```

用 `ci` 不用 `install`：它严格按 `package-lock.json` 安装，不会顺手改动锁文件。

### 2.2 启动

```bash
npm run dev:local --prefix code
```

这条命令等价于 `DEPLOYMENT_MODE=local LOCAL_BIND_HOST=127.0.0.1 next dev`。两个环境变量分别决定"以本地模式运行"和"只绑回环地址"。

### 2.3 验证

打开 <http://127.0.0.1:3000>，逐项确认：

| 检查点         | 期望                                                      |
| -------------- | --------------------------------------------------------- |
| 右上角徽标     | **本地模式**（橙点）                                      |
| 顶部导航最后项 | **账户**（不是"登录"——本地模式已自动签入固定单用户）      |
| 首页速览卡片   | 四个数字：课程条目 / 本地素材 / 站内文章 / 上游导览       |
| 任一本地条目   | `/courses` 里点开一条标着"本地优先"的，能进阅读器看到正文 |

命令行验证：

```bash
curl -s http://127.0.0.1:3000/api/health
```

### 2.4 换端口

```bash
npm run dev:local --prefix code -- --port 3210
```

`--` 之后的参数透传给 `next dev`。

> **同一个 `code/` 目录同时只能跑一个 `next dev`。** 第二个实例会以 "server is already running" 退出。想同时看本地和云端两种视角，只能走路径 B 的 `mode-switch.sh`。

---

## 3. 路径 B：本机 Docker

### 3.1 启动

```bash
code/scripts/local-preview.sh
```

一条命令做完四件事：从当前工作区构建镜像、以 Local Mode 启动、等待容器健康、调 `/api/health` 确认。素材库以**只读**方式挂载进容器的 `/data/local-courses`。

### 3.2 管理

```bash
code/scripts/local-preview.sh status    # 容器状态
code/scripts/local-preview.sh logs      # 跟随日志
code/scripts/local-preview.sh restart   # 重新构建并启动（改完代码用这个）
code/scripts/local-preview.sh verify    # 只调健康检查
code/scripts/local-preview.sh down      # 停止
```

`down` **保留** SQLite 命名卷，学习状态不会丢。换端口：

```bash
APP_PORT=3300 code/scripts/local-preview.sh
```

### 3.3 双模式对照

想同时看"我自己能读到什么"和"公开发布后别人看到什么"：

```bash
code/scripts/mode-switch.sh both      # 本地 :3000 + 云端 :3001
code/scripts/mode-switch.sh status    # 谁在跑、在哪个端口
code/scripts/mode-switch.sh stop      # 都停掉，保留卷
```

两种模式用各自独立的 Compose 项目、端口和 SQLite 卷，互不干扰。

云端模式需要四项凭据（`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`），从仓库根 `.env` 读取：

```bash
cp .env.example .env    # 然后填写
```

**只想看未登录的公开视角**、不打算注册 OAuth App：

```bash
code/scripts/mode-switch.sh cloud --preview-secrets
```

用一次性假凭据启动，只够渲染匿名页面，GitHub 登录不会成功。**绝不能用于任何部署。**

### 3.4 底层入口

`local-preview.sh` 和 `mode-switch.sh` 都委托给 `docker-deploy.sh`。需要更细的控制时直接用它：

```bash
code/scripts/docker-deploy.sh local build     # 只构建
code/scripts/docker-deploy.sh local up        # 启动 + 健康验证
code/scripts/docker-deploy.sh local config    # 校验 Compose 配置，不打印秘密
code/scripts/docker-deploy.sh local down      # 停止，保留卷
```

`local` 模式会拒绝非回环的 `APP_BIND_HOST`。

---

## 4. 学习状态存在哪、怎么备份

本地模式的进度、笔记、收藏和成果都在一个 SQLite 文件里：

- 路径 A：`code/.data/` 下（由 `STATE_DATABASE_PATH` 决定）
- 路径 B：Docker 命名卷 `agent-learning-hub-local_learning-state`

两条路径的状态**不共享**。

备份是加密的，需要口令：

```bash
BACKUP_PASSPHRASE='<你的长口令>' npm run db:backup --prefix code
```

恢复必须显式确认，且要指定输入和目标：

```bash
BACKUP_PASSPHRASE='<同一口令>' npm run db:restore --prefix code -- \
  --input <备份文件> --target <目标 sqlite 路径> --yes
```

> SQLite 有 `-wal` 和 `-shm` 两个伴随文件。**不要用 `cp` 复制主库文件当备份**——运行中复制会得到不一致的快照。始终走 `db:backup`。

---

## 5. 改完东西怎么自查

```bash
npm run check:local --prefix code
```

一条命令跑完：格式检查 → lint → 类型检查 → 内容审计 → 单元与工具测试 → 生产构建。这是提交前的门禁。

界面或交互改动后，另开终端，在**服务已经跑起来**的前提下手工走查：

```bash
npm run audit:ui --prefix code            # 三种视口截图，查溢出/超长/控制台报错
npm run audit:functional --prefix code    # 真实点击：翻页、筛选、切章节、勾选、笔记
```

两个脚本都需要 Playwright（`npm i -D playwright --prefix code && npx playwright install chromium`）和运行中的服务，因此**不进** `npm run check`。端口不是 3000 时：

```bash
npm run audit:functional --prefix code -- --base-url http://127.0.0.1:3210
```

报告写入 `code/reports/`。

---

## 6. 改动过 local-courses 之后

素材库是你自己的目录，你随时会重组、增删它。站点不会自动跟着变——目录里记的是路径，路径失效条目就打不开。

```bash
npm run audit:materials --prefix code
```

报告在 `code/reports/materials/catalog-drift.md`，四个小节：

| 小节               | 说的是                                                  |
| ------------------ | ------------------------------------------------------- |
| Corroborated moves | 失效路径 + 可信的新位置（被多条路径共同印证的目录搬迁） |
| Needs a decision   | 判不准的和找不到的，只能你自己定                        |
| Uncatalogued       | 磁盘上有、目录里没有的仓库，附可粘贴的条目骨架          |
| Upstream fallback  | 没有上游回退的条目，按仓库分组                          |

先读报告确认 Corroborated moves 没问题，再落盘：

```bash
npm run audit:materials --prefix code -- --apply
```

`--apply` **只**改写 Corroborated moves。素材真的被删了（不是搬走了）时，把条目的 `localPath` 清空、`accessPolicy` 改成 `upstream-only`、补上 `sourceUrl`——条目本身要留着，云端目录从不依赖你本机有没有这份文件。

完整背景见 [ADR 0007](../adr/0007-catalog-drift-is-proposed-not-applied.md)。

---

## 7. 故障处置

| 症状                             | 原因与处置                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| 徽标显示"云端模式"               | 跑的是 `dev:cloud`，或 `DEPLOYMENT_MODE` 被 shell 环境变量覆盖了。`echo $DEPLOYMENT_MODE` 确认   |
| 页面白屏 / hydration 报错        | 访问地址不是 `127.0.0.1` 或 `localhost`。开发模式下非回环来源的静态资源会被拒绝                  |
| "server is already running"      | 同一 `code/` 已有一个 `next dev`。停掉它，或改用 Docker 路径并行                                 |
| 条目提示"本地素材暂时不可用"     | 该路径在 `local-courses/` 下确实不存在。跑 `audit:materials` 看是搬走了还是删了                  |
| 某课只能读到一两章               | 章节由课程条目**显式声明**，这是安全边界。未声明的文件不可读；正文里指向它们的链接会降级为纯文字 |
| `audit:materials` 说 not mounted | 目录不存在，或里面只有 `README.md` 没有任何子目录。检查 `LOCAL_MATERIAL_ROOT`                    |
| Docker 构建失败或极慢            | 首次构建要拉基础镜像。`code/scripts/local-preview.sh logs` 看具体阶段                            |
| 端口被占用                       | 路径 A 用 `-- --port <n>`，路径 B 用 `APP_PORT=<n>`                                              |
| 学习状态"丢了"                   | 确认是不是换了路径——路径 A 和路径 B 用不同的存储，状态不互通                                     |

---

## 8. 相关文档

- [USER.md](../../USER.md) — 三行命令的快速版
- [GUIDE.md](../../GUIDE.md) — 每个页面怎么用、推荐学习动线
- [README.md](../../README.md) — 仓库结构、命令总表、脚本运行位置分类
- [production-manual.md](./production-manual.md) — 云端纯手工部署
- [lighthouse-automation.md](./lighthouse-automation.md) — 云端脚本化部署
- [plan.md 第 9 节](../plans/plan.md#9-双运行模式) — 双模式的架构约定
