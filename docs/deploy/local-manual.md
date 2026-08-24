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

看输出第一行。`Local Material is not mounted` 说明目录不存在或里面没有任何子目录（只有 `README.md` 不算挂载）。正常输出会包含动态数量，示例结构如下；不要把某次运行的仓库数量复制回手册：

```
Catalog drift: <missing paths> missing paths (<corroborated moves> corroborated moves, <uncertain> uncertain, <gone> gone), <uncatalogued repositories> uncatalogued repositories, <items without fallback> items without an upstream fallback.
```

`missing paths` 不是 0 时，说明目录里记的路径和磁盘对不上；未收录仓库或没有上游回退也需要人工策展。完整结果见 [`code/reports/materials/catalog-drift.md`](../../code/reports/materials/catalog-drift.md)，处置规则见本文第 6 节。该命令按设计可能非零退出，不代表应用启动失败。

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

这条命令等价于 `DEPLOYMENT_MODE=local LOCAL_BIND_HOST=127.0.0.1 next dev -p 3001`。前两个环境变量分别决定"以本地模式运行"和"只绑回环地址"，`-p 3001` 是本机默认端口（3000 常被其他应用占用）。

### 2.3 验证

打开 <http://127.0.0.1:3001>，逐项确认：

| 检查点         | 期望                                                      |
| -------------- | --------------------------------------------------------- |
| 右上角徽标     | **本地模式**（橙点）                                      |
| 顶部导航最后项 | **账户**（不是"登录"——本地模式已自动签入固定单用户）      |
| 首页速览卡片   | 四个数字：课程条目 / 本地素材 / 站内文章 / 上游导览       |
| 任一本地条目   | `/courses` 里点开一条标着"本地优先"的，能进阅读器看到正文 |

命令行验证：

```bash
curl -s http://127.0.0.1:3001/api/health
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
code/scripts/mode-switch.sh both      # 本地 :3001 + 云端 :3002
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

> SQLite 有 `-wal` 和 `-shm` 两个伴随文件。**不要用 `cp` 复制主库文件当备份**——运行中复制会得到不一致的快照。始终走 `db:backup`，它内部用的是 SQLite 在线备份 API。

三个伴随文件必须一起处理，漏一个的后果是实测过的：把 `.sqlite` 和 `-wal` 拷到别处、唯独漏掉 `-shm`，再以只读方式打开，会直接失败：

```
OPEN FAILED: SQLITE_CANTOPEN unable to open database file
```

报错里没有任何一个字提到 WAL 或 shm。备份和恢复演练会一起卡在这里，而数据其实是好的。

### 4.1 证明备份真的能恢复

备份没恢复过就只是一个假设。这条命令跑完整回路——建库、备份、在一个**从未存在过数据库**的干净目录里恢复、逐表比对行数，再用三组反向对照证明恢复路径确实会失败：

```bash
BACKUP_PASSPHRASE='<你的长口令>' npm run drill:restore --prefix code
```

反向对照分别是：错误口令、被改过一个字节的备份（GCM 认证标签应当拒绝）、以及往已存在的库上恢复（应当被拒绝而不是覆盖）。任何一条"本该失败却成功了"都会让演练非零退出。
报告头部会写明日期、耗时、主机平台、node 与应用版本——这几项是 OPS-006 对演练记录的要求，目的是让后来的人看得出**是哪台机器、哪个构建**跑的。同一段代码也在云主机上跑：2026-08-20 在目标主机实测 16/16 通过、耗时 3.0s（见 [lighthouse-automation 第 9.1 节](./lighthouse-automation.md#91-恢复演练gate-07)），本机这条命令与它的差别只在于用合成 fixture 而不是生产数据。

演练默认用合成 fixture，覆盖全部 8 张私有表，不需要任何真实数据，任何人都能复现。要拿真实数据演练就指定 `--source`：

```bash
# 先把运行中容器的库取出来（drill 内部会用在线备份 API 读它，不写原文件）
docker cp agent-learning-hub-local-app-1:/data/state/learning-state.sqlite /tmp/live.sqlite
BACKUP_PASSPHRASE='<你的长口令>' npm run drill:restore --prefix code -- --source /tmp/live.sqlite
```

证据写入 `code/reports/restore-drill/`。云端的同一套演练见 [lighthouse-automation 第 9.1 节](./lighthouse-automation.md#91-恢复演练gate-07)。

---

## 5. 改完东西怎么自查

```bash
npm run check:local --prefix code
```

一条命令跑完：格式检查 → lint → 类型检查 → 内容审计 → 单元与工具测试 → 生产构建。这是提交前的门禁。

`check` 不含端到端测试，因为那需要一个跑起来的服务。改过登录、学习状态或导出之后，另起一个构建好的服务再跑对应模式的 e2e：

```bash
# 本地模式：固定单用户，直接读写学习状态
APP_URL=http://127.0.0.1:3100 npm run test:e2e:local --prefix code

# 云端模式：先登录，再验证匿名拒绝、CSRF、导出和删号
APP_URL=http://127.0.0.1:3100 npm run test:e2e:cloud --prefix code
```

上面两条都用 3100 而不是本手册前面启动的 3001，这不是随手写的端口号：**两条 e2e 都以删号收尾**。本地模式只有一个用户，就是你——把 `APP_URL` 指向日常使用的预览会清空阅读进度、笔记和收藏，而且中途每条断言针对的都是测试自己刚写的数据，全程看不出异常。请另起一个带独立 `STATE_DATABASE_PATH` 的一次性服务。本地那条现在会在开跑前检查目标是否已有学习状态，非空即拒绝：

```
Refusing to run: http://127.0.0.1:3001 already holds learning state (itemProgress, bookmarks).
```

确认数据可弃时才加 `E2E_ALLOW_DESTRUCTIVE=1` 绕过。

云端那条还有一条环境约束：它为了签发会话会成为服务端 SQLite 的**第二个写入者**，因此必须和服务共享文件系统——本机、CI，或共用一个卷的两个容器。指向"容器化服务 + 状态放在 macOS/Windows bind mount"会产生假失败（SQLite 的 WAL 锁经由 mmap 的 `-shm` 协调，跨 VM 边界不相干），症状是删号级联那步失败而应用其实正常。测试中段的「the database file agrees with the server about the note just written」就是为点名这种环境而设。要验证容器，让应用和测试共用同一个 Docker 卷即可。

云端那条需要和服务**完全一致**的 `STATE_DATABASE_PATH`、`BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GITHUB_CLIENT_ID` 和 `GITHUB_CLIENT_SECRET`：它通过 Better Auth 自己的 API 在同一个 SQLite 文件上签发会话，再拿这个 cookie 打真实 HTTP 接口。GitHub 全程不联网，token 和 profile 两个端点都是打桩的。密钥对不上时会在"session resolves to the GitHub identity"这一步失败——那说明服务不认这个 cookie，不是测试写错了。

界面或交互改动后，另开终端，在**服务已经跑起来**的前提下手工走查：

```bash
npm run audit:ui --prefix code            # 三种视口截图，查溢出/超长/控制台报错
npm run audit:functional --prefix code    # 真实点击：翻页、筛选、切章节、勾选、笔记
```

两个脚本都需要 Playwright（`npm i -D playwright --prefix code && npx playwright install chromium`）和运行中的服务，因此**不进** `npm run check`。端口不是 3001 时：

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

| 症状                                                   | 原因与处置                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 徽标显示"云端模式"                                     | 跑的是 `dev:cloud`，或 `DEPLOYMENT_MODE` 被 shell 环境变量覆盖了。`echo $DEPLOYMENT_MODE` 确认      |
| 页面白屏 / hydration 报错                              | 访问地址不是 `127.0.0.1` 或 `localhost`。开发模式下非回环来源的静态资源会被拒绝                     |
| "server is already running"                            | 同一 `code/` 已有一个 `next dev`。停掉它，或改用 Docker 路径并行                                    |
| 条目提示"本地素材暂时不可用"                           | 该路径在 `local-courses/` 下确实不存在。跑 `audit:materials` 看是搬走了还是删了                     |
| 某课只能读到一两章                                     | 章节由课程条目**显式声明**，这是安全边界。未声明的文件不可读；正文里指向它们的链接会降级为纯文字    |
| `audit:materials` 说 not mounted                       | 目录不存在，或里面只有 `README.md` 没有任何子目录。检查 `LOCAL_MATERIAL_ROOT`                       |
| Docker 构建失败或极慢                                  | 首次构建要拉基础镜像。`code/scripts/local-preview.sh logs` 看具体阶段                               |
| 端口被占用                                             | 路径 A 用 `-- --port <n>`，路径 B 用 `APP_PORT=<n>`                                                 |
| 学习状态"丢了"                                         | 确认是不是换了路径——路径 A 和路径 B 用不同的存储，状态不互通                                        |
| `SQLITE_CANTOPEN`                                      | 把库文件搬走时漏了 `-shm`（`-wal` 非空时必须三个文件一起）。别手工搬，用 `db:backup` / `db:restore` |
| 演练报"restoring over an existing database is refused" | 这是**期望行为**。恢复不覆盖已有库，换一个不存在的 `--target`                                       |
| e2e 停在"session resolves to the GitHub identity"      | 测试环境的 `BETTER_AUTH_SECRET` 和服务端不一致，服务不认这个 cookie                                 |

---

## 8. 相关文档

- [USER.md](../../USER.md) — 三行命令的快速版
- [GUIDE.md](../../GUIDE.md) — 每个页面怎么用、推荐学习动线
- [README.md](../../README.md) — 仓库结构、命令总表、脚本运行位置分类
- [Phase 7 交付、部署与运维](./phase-7-delivery-deployment-operations.md) — 本地优先顺序、任务状态和交付证据
- [production-manual.md](./production-manual.md) — 云端纯手工部署
- [lighthouse-automation.md](./lighthouse-automation.md) — 云端脚本化部署
- [plan.md 第 9 节](../plans/plan.md#9-双运行模式) — 双模式的架构约定
