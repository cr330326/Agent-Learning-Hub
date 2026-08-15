# 快速上手：本地模式

这份文档只回答一件事：**怎么最快把站点在本机跑起来，并且能读到 `local-courses/` 里的素材正文。**

- 想了解每个页面怎么用 → [GUIDE.md](GUIDE.md)
- 想要每一步都带验证点和故障处置的完整版 → [docs/deploy/local-manual.md](docs/deploy/local-manual.md)
- 想了解架构、边界和运维 → [README.md](README.md)、[docs/plans/plan.md](docs/plans/plan.md)、[docs/deploy/](docs/deploy/README.md)

---

## 0. 为什么是本地模式

站点只有两种运行模式，右上角徽标会告诉你当前在哪一种。

|            | 本地模式 Local                     | 云端模式 Cloud             |
| ---------- | ---------------------------------- | -------------------------- |
| 身份       | 回环地址上的固定单用户，**免登录** | GitHub OAuth 登录          |
| 第三方素材 | 只读渲染，**可在站内直接读正文**   | 只给作者、许可证和上游地址 |
| 学习状态   | 本机 SQLite                        | 服务端 SQLite，跟随账户    |
| 素材来源   | 只读挂载仓库根的 `local-courses/`  | 完全不挂载、不索引         |

要真正读素材正文，用本地模式。

> **只能用 `127.0.0.1` 或 `localhost` 访问。** 免登录身份只对回环地址成立，绑定到非回环地址时进程会直接拒绝启动。

---

## 1. 最快的一条路：开发服务器

需要 Node.js 22+。

```bash
npm ci --prefix code
```

```bash
npm run dev:local --prefix code
```

打开 <http://127.0.0.1:3000>，右上角应显示**本地模式**。改代码即时热更新，这是日常开发和试用的默认方式。

素材目录默认取仓库根的 `local-courses/`，放在别处时指定：

```bash
LOCAL_MATERIAL_ROOT=/path/to/local-courses npm run dev:local --prefix code
```

跑不起来时先看这三条：

| 症状                      | 检查                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| 徽标显示"云端模式"        | 用的是 `dev:cloud`，或 `DEPLOYMENT_MODE` 被环境变量覆盖了                 |
| 素材页面提示文件不存在    | `local-courses/` 下确实没有该路径，或课程清单没有声明它（未声明即不可读） |
| 页面白屏 / hydration 报错 | 访问地址不是 `127.0.0.1` 或 `localhost`                                   |

---

## 2. 更接近真实部署：本地 Docker

不需要装 Node，只需要 Docker。构建镜像、启动、跑健康检查一步完成：

```bash
code/scripts/local-preview.sh
```

打开 <http://127.0.0.1:3000>。管理命令：

```bash
code/scripts/local-preview.sh status
code/scripts/local-preview.sh logs
code/scripts/local-preview.sh restart
code/scripts/local-preview.sh down
```

`down` **不会**删除保存学习状态的 SQLite 命名卷。换端口用 `APP_PORT=3300 code/scripts/local-preview.sh`。

---

## 3. 在本地 Docker 里切换本地 / 云端模式

想对比"我自己能看到什么"和"公开发布后别人看到什么"，用模式切换脚本。注意不能靠开两个 `npm run dev` 来对照——Next.js 16 对同一工程目录只允许一个 `next dev` 实例，第二个会以 "server is already running" 直接退出，所以并行对照只能走 Docker。两种模式使用各自独立的 Compose 项目、端口和 SQLite 卷，互不影响：

```bash
code/scripts/mode-switch.sh local     # 本地模式 → http://127.0.0.1:3000
code/scripts/mode-switch.sh cloud     # 云端模式 → http://127.0.0.1:3001
code/scripts/mode-switch.sh both      # 两个一起跑，左右对照
code/scripts/mode-switch.sh status    # 看哪个在跑、在哪个端口
code/scripts/mode-switch.sh stop      # 都停掉，保留 SQLite 卷
```

`local` 和 `cloud` 默认会先停掉另一个；想保留就加 `--keep-other`。端口用 `LOCAL_MODE_PORT` / `CLOUD_MODE_PORT` 改。

**云端模式需要凭据。** 它要求 `BETTER_AUTH_SECRET`、`BETTER_AUTH_URL`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`，从仓库根 `.env` 或 shell 读取：

```bash
cp .env.example .env   # 然后填写上面四项
```

只是想看**未登录的公开视角**长什么样（第三方素材是否正确地只给出处不给正文），不必注册 GitHub OAuth App：

```bash
code/scripts/mode-switch.sh cloud --preview-secrets
```

这会用一次性的假凭据启动，只够渲染匿名页面；**GitHub 登录不会成功**，也绝不能用于任何部署。要真正验证登录流程，得注册一个 OAuth App，把回调地址设为 `${BETTER_AUTH_URL}/api/auth/callback/github`。

---

## 4. 发布到云端

本机构建镜像 → 推送到镜像仓库 → 云端主机拉取固定版本运行。云端主机不构建源码。

> 这一节只给最短路径。完整的云端上线流程有两份文档：[production-manual.md](docs/deploy/production-manual.md)（逐条手工，第一次上线走这份）和 [lighthouse-automation.md](docs/deploy/lighthouse-automation.md)（脚本化，理解流程后的重复执行）。

```bash
docker login ghcr.io                              # 凭据由你自己输入
code/scripts/image-release.sh --push v0.1.0
```

脚本默认为 `linux/amd64` 交叉构建（Apple Silicon 直接构建出来的 arm64 镜像在 x86 云主机上跑不起来），拒绝 `latest`，推送前会检查该版本是否已存在，成功后打印可直接固定的 `repo@sha256:...` 引用和下一步命令。

先只构建、本机验证再决定是否推送：

```bash
code/scripts/image-release.sh v0.1.0
APP_IMAGE=ghcr.io/cr330326/agent-learning-hub:v0.1.0 code/scripts/docker-deploy.sh release up
```

拿到 digest 后部署到腾讯云 Lighthouse 主机：

```bash
export LIGHTHOUSE_DOMAIN=<your-domain>
export LIGHTHOUSE_IMAGE=ghcr.io/cr330326/agent-learning-hub@sha256:<digest>
code/scripts/lighthouse-deploy.sh deploy
code/scripts/lighthouse-deploy.sh verify
```

> 打 `v*.*.*` Git tag 会触发 [`.github/workflows/release.yml`](.github/workflows/release.yml)，用同一个 Dockerfile 构建并额外附带 SBOM 和签名溯源。**正式发布优先走这条路**；`image-release.sh` 是 CI 到不了的镜像仓库或主机时的手工路径。
>
> 脚本不会创建 DNS 记录、防火墙规则、快照或异地备份。把一次发布称为"生产就绪"之前，按 [docs/deploy/](docs/deploy/README.md) 补齐这些控制面步骤。

---

## 5. 改完东西怎么自查

```bash
npm run check:local --prefix code    # 格式、lint、类型、内容审计、测试、构建
```

界面或交互改动后，在**服务已经跑起来**的前提下另开一个终端手工走查（两个脚本都需要 Playwright，因此不进 `npm run check`）：

```bash
npm run audit:ui --prefix code            # 看版式，三种视口截图
npm run audit:functional --prefix code    # 真实点击：翻页、筛选、切章节、勾选、笔记
```

默认对 <http://127.0.0.1:3000> 走查，端口不同时加 `-- --base-url http://127.0.0.1:3210`。报告写入 `code/reports/`。

`audit:functional` 会读取页面上的运行模式徽标并据此断言：本地模式断言章节导航与学习状态读写，云端模式断言匿名访问被拒、本地素材不出正文。给某个模式新增能力时，两个分支都要补断言。
