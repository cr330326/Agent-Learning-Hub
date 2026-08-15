# 腾讯云 Lighthouse 自动化部署

本文把[完全手工生产部署与运维](./production-manual.md)中可安全自动化的服务器动作，映射为本地脚本 [`code/scripts/lighthouse-deploy.sh`](../../code/scripts/lighthouse-deploy.sh)。默认 SSH 目标是 `tencent-lighthouse`；脚本从本机上传最小发布/维护 bundle，远端只拉取固定应用镜像，不构建 Next.js。

> 文档核对日期：2026-08-15。当前仓库没有连接或改动真实 Lighthouse，也没有完成 T7.3/T7.5 的生产验收。本文可供后续人员或 Agent 直接执行，但每次外部变更仍须由操作者明确发起并保留证据。

## 0. 开始之前

### 0.1 这份文档在哪个位置

三条运行路径中，本文是脚本化的云端部署：

| 路径             | 文档                                           | 什么时候用                           |
| ---------------- | ---------------------------------------------- | ------------------------------------ |
| 本机运行         | [local-manual.md](./local-manual.md)           | 学习、读素材、改代码                 |
| 云端**手工**部署 | [production-manual.md](./production-manual.md) | 第一次上线，或需要理解每一步在做什么 |
| 云端**脚本**部署 | **本文**                                       | 已经理解流程后的重复执行             |

**第一次上线不建议直接用本文。** 脚本把手工文档的服务器动作压成九个 action，出错时错误信息指向的是脚本内部状态，你需要先知道那一步原本要做什么。逐节对应关系见 [production-manual 第 16 节](./production-manual.md#16-与自动化脚本的对应关系)。

### 0.2 脚本在哪里执行

`lighthouse-deploy.sh` **运行在你自己的电脑上**，通过 SSH 操作云主机。它不需要装在服务器上。

```
你的电脑                                云主机
─────────                              ──────
lighthouse-deploy.sh  ──── SSH/scp ──▶  docker-deploy.sh release
                                        database.ts（维护容器内）
                                        Caddy / Docker Engine
image-release.sh      ──── push ────▶  镜像仓库 ──── pull ──▶ 云主机
```

镜像构建推送是**独立的前置步骤**，不由本脚本完成：先 `image-release.sh --push <version>` 拿到 digest（或等 `v*.*.*` tag 触发的 release workflow），再把 digest 传给 `LIGHTHOUSE_IMAGE`。完整分类见 [docs/deploy/README.md](./README.md#脚本按运行位置分类)。

### 0.3 九个 action 速查

| Action      | 幂等 | 会改服务器 | 必需环境变量                                            | 用途                                          |
| ----------- | ---- | ---------- | ------------------------------------------------------- | --------------------------------------------- |
| `preflight` | 是   | 否（只读） | —                                                       | SSH、架构、OS、sudo、磁盘、Docker、Caddy 检查 |
| `bootstrap` | 是   | 是         | —                                                       | 装 Docker Engine/Compose 与 Caddy             |
| `configure` | 是   | 是         | `LIGHTHOUSE_DOMAIN`、`LIGHTHOUSE_ENV_FILE`              | 上传 root-only 秘密文件                       |
| `deploy`    | 是   | 是         | `LIGHTHOUSE_DOMAIN`、`LIGHTHOUSE_IMAGE`                 | 备份 → 上传 bundle → 起固定镜像               |
| `backup`    | 是   | 是         | —（首次后 `LIGHTHOUSE_BACKUP_ENV_FILE` 可省）           | 原生加密 SQLite 备份                          |
| `rollback`  | 否   | 是         | `LIGHTHOUSE_DOMAIN` + `LIGHTHOUSE_ROLLBACK_CONFIRMED=1` | 启动上一个固定版本；**不恢复数据**            |
| `verify`    | 是   | 否         | `LIGHTHOUSE_DOMAIN`                                     | 内部健康 + 公网 HTTPS                         |
| `status`    | 是   | 否         | —                                                       | 发布指针、Compose、Docker、Caddy、磁盘        |
| `logs`      | 是   | 否         | —                                                       | 跟随应用容器日志                              |

任何 action 都可以先加 `LIGHTHOUSE_DRY_RUN=1` 跑一遍：它校验参数、打印将要执行的动作，不做任何 SSH 写入。**第一次执行 `bootstrap`、`configure`、`deploy`、`rollback` 前都应该先 dry-run。**

### 0.4 可选环境变量

| 变量                               | 默认值                          | 何时需要改                                  |
| ---------------------------------- | ------------------------------- | ------------------------------------------- |
| `LIGHTHOUSE_SSH_TARGET`            | `tencent-lighthouse`            | SSH config 里用了别的别名                   |
| `LIGHTHOUSE_REMOTE_ROOT`           | `/opt/agent-learning-hub`       | 服务器上换了发布根目录                      |
| `LIGHTHOUSE_APP_PORT`              | `3000`                          | 回环端口冲突                                |
| `LIGHTHOUSE_COMPOSE_PROJECT`       | `agent-learning-hub-production` | **改动会切换整套 Compose 资源**，非必要不动 |
| `LIGHTHOUSE_WAIT_TIMEOUT`          | `180`                           | 主机慢，容器健康等待超时                    |
| `LIGHTHOUSE_MAINTENANCE_IMAGE`     | `node:24.18.0-bookworm`         | 需要固定到别的维护镜像                      |
| `LIGHTHOUSE_ALLOW_NO_BACKUP=1`     | 未设置                          | **破窗**：跳过升级/回滚前备份               |
| `LIGHTHOUSE_ALLOW_CADDY_REPLACE=1` | 未设置                          | 覆盖主机上一份非本项目写入的 Caddyfile      |

`LIGHTHOUSE_ALLOW_NO_BACKUP=1` 和 `LIGHTHOUSE_ALLOW_CADDY_REPLACE=1` 是刻意做成必须显式声明的：前者放弃了升级出问题时唯一的数据退路，后者会覆盖别人的反向代理配置。用了就要在验收记录里写明原因。

## 1. 自动化边界

| 脚本负责                                         | 必须在腾讯云/GitHub/域名平台人工完成            |
| ------------------------------------------------ | ----------------------------------------------- |
| SSH/OS/权限只读预检                              | 创建或选择专用 `x86_64` Ubuntu 22.04/24.04 实例 |
| 在空白 Ubuntu 安装 Docker Engine、Compose、Caddy | 绑定 SSH 密钥并核对主机指纹                     |
| 上传 root-only 环境文件，不输出 secret           | 将 22 限制到可信来源，只向公网开放 80/443       |
| 上传 Compose、数据库维护工具和锁文件             | 配置域名 A/AAAA 和必要的备案/组织策略           |
| 固定镜像部署、健康等待、Caddy HTTPS、发布指针    | 创建 GitHub OAuth App 和 client secret          |
| 升级/回滚前执行项目原生加密 SQLite 备份          | 创建 Lighthouse 快照、异地备份存储和告警渠道    |
| 状态、日志、内部/外部健康验证                    | 真实 OAuth、多用户隔离、恢复演练与发布审批      |

脚本不会调用腾讯云 API，也不会自动更改 Lighthouse 防火墙、DNS 或快照。腾讯云防火墙规则立即生效且有优先级；按[官方文档](https://cloud.tencent.com/document/product/1207/44577/)遵循最小授权，避免锁死 SSH。Lighthouse 快照是整盘且回滚不可逆，按[快照文档](https://cloud.tencent.com/document/product/1207/48546/)人工执行。

## 2. 一次性控制面准备

在 Lighthouse 控制台或受控的电脑界面中完成：

1. 选择专用 `x86_64` Ubuntu 24.04 LTS（或 22.04 LTS）实例。
2. 绑定 SSH 密钥；Ubuntu 默认用户为 `ubuntu`。腾讯云的[密钥管理说明](https://cloud.tencent.com/document/product/1207/44573)指出，绑定密钥后默认禁止 root 密码登录，保持这一默认值。
3. 防火墙允许：可信来源到 TCP 22；公网到 TCP 80/443。不得开放 3000。
4. 域名 A 记录指向实例公网 IPv4；只有实际使用 IPv6 时才添加正确的 AAAA。
5. 创建 GitHub OAuth App：Homepage 为 `https://<domain>`，callback 只能是 `https://<domain>/api/auth/callback/github`。参见 [GitHub 官方步骤](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)。
6. 若 SSH 完全不可用，可从 Lighthouse 控制台使用 [VNC 登录](https://cloud.tencent.com/document/product/1207/46824)检查网络或 sshd；VNC 是应急通道，不用于把秘密粘贴进共享会话。

## 3. 本机 SSH 别名

在本机 `~/.ssh/config` 配置：

```sshconfig
Host tencent-lighthouse
  HostName 203.0.113.10
  User ubuntu
  IdentityFile /absolute/path/to/tencent-lighthouse.pem
  IdentitiesOnly yes
  ServerAliveInterval 15
```

```bash
chmod 600 ~/.ssh/config /absolute/path/to/tencent-lighthouse.pem
ssh tencent-lighthouse 'uname -m && cat /etc/os-release && sudo -n true'
```

脚本使用 `BatchMode=yes`，不会等待密码或 sudo 交互。预期为 `x86_64`、Ubuntu 22.04/24.04、非交互 sudo 成功。若主机指纹变化，先从腾讯云控制台核对；不要删除 `known_hosts` 记录后直接继续。

## 4. 准备本机秘密文件

秘密文件必须位于 Git 仓库之外或被 `.gitignore` 排除，并且权限为 `600`。示例使用本机私有配置目录：

```bash
mkdir -p ~/.config/agent-learning-hub
chmod 700 ~/.config/agent-learning-hub
touch ~/.config/agent-learning-hub/production.env
touch ~/.config/agent-learning-hub/backup.env
chmod 600 \
  ~/.config/agent-learning-hub/production.env \
  ~/.config/agent-learning-hub/backup.env
```

用本地编辑器填写 `production.env`：

```dotenv
BETTER_AUTH_SECRET=<at-least-32-random-characters>
BETTER_AUTH_URL=https://learn.example.com
GITHUB_CLIENT_ID=<oauth-client-id>
GITHUB_CLIENT_SECRET=<oauth-client-secret>
ADMIN_GITHUB_IDS=<comma-separated-stable-github-ids>
STATE_VOLUME_NAME=agent-learning-hub-production-state
```

`backup.env` 只有一项；口令至少 12 字符，并在独立密码管理系统中保存恢复副本：

```dotenv
BACKUP_PASSPHRASE=<backup-only-passphrase>
```

脚本不 `source` 文件，不会把值放进 SSH 命令或输出。它会拒绝权限过宽、缺项、重复项、过短 secret、origin 不匹配以及把 `BACKUP_PASSPHRASE` 混入应用环境文件。

## 5. 设置非秘密部署参数

从仓库根目录执行：

```bash
cd /Users/vsh9p8q/AI/Agent-Learning-Hub

export LIGHTHOUSE_SSH_TARGET=tencent-lighthouse
export LIGHTHOUSE_DOMAIN=learn.example.com
export LIGHTHOUSE_IMAGE=ghcr.io/cr330326/agent-learning-hub:v0.1.0
export LIGHTHOUSE_MAINTENANCE_IMAGE=node:24.18.0-bookworm
export LIGHTHOUSE_ENV_FILE=~/.config/agent-learning-hub/production.env
export LIGHTHOUSE_BACKUP_ENV_FILE=~/.config/agent-learning-hub/backup.env
```

`LIGHTHOUSE_IMAGE` 必须是非 `latest` tag 或 `@sha256:<64-hex>` digest。发布后优先使用 GHCR 返回的 digest。备份维护容器也使用显式 Node 版本；生产加固时可把 `LIGHTHOUSE_MAINTENANCE_IMAGE` 换成预先核验的 digest。当前发布工作流按 amd64 验收，本脚本会拒绝 ARM 主机。

可选参数及默认值以脚本帮助为准：

```bash
code/scripts/lighthouse-deploy.sh --help
```

不要随意改变 `LIGHTHOUSE_REMOTE_ROOT` 或 `LIGHTHOUSE_COMPOSE_PROJECT`；后者决定容器、网络和状态资源集合。

## 6. 先运行只读预检和 dry-run

```bash
code/scripts/lighthouse-deploy.sh preflight

LIGHTHOUSE_DRY_RUN=1 \
  code/scripts/lighthouse-deploy.sh deploy
```

`preflight` 只读取 SSH 目标、OS、架构、非交互 sudo、根磁盘、Docker 和 Caddy 状态。dry-run 在本地验证域名、镜像、秘密文件和发布 bundle，只打印已脱敏动作，不上传或改动服务器。

以下任一情况必须停止：SSH 指向的主机不确定、主机不是专用 Ubuntu、不是 `x86_64`、sudo 需要交互、镜像未固定、域名未指向该实例、80/443 未开放、秘密文件权限不是仅当前用户可读写。

## 7. 首次自动化部署

### 7.1 Bootstrap 空白主机

```bash
code/scripts/lighthouse-deploy.sh bootstrap
```

该动作按 Docker 和 Caddy 官方 apt 仓库安装：

- Docker Engine、CLI、Buildx、Compose plugin；
- Caddy systemd 服务；
- `/opt/agent-learning-hub/releases/`；
- `/etc/agent-learning-hub/`（`0700`）；
- `/var/backups/agent-learning-hub/`（`0700`）。

它会拒绝未知 Linux、非受支持 Ubuntu、ARM，以及发现冲突容器包的主机；不会自动卸载既有软件。Docker 官方也提醒容器发布端口与主机防火墙存在特殊交互，因此应用继续只绑定回环地址。参见 [Docker Ubuntu 安装说明](https://docs.docker.com/engine/install/ubuntu/)。

### 7.2 上传秘密

```bash
code/scripts/lighthouse-deploy.sh configure
```

远端只保存：

- `/etc/agent-learning-hub/application.env`：root `0600`；
- `/etc/agent-learning-hub/backup.env`：root `0600`。

`APP_IMAGE`、回环绑定、端口和备份主机路径由每个 release 的脚本生成，不从秘密文件信任。

### 7.3 部署固定镜像

确认本地 checkout 与要部署的 tag 匹配；bundle 中的数据库维护代码和 lockfile 来自当前 checkout：

```bash
git status --short
git fetch --tags --prune
git checkout --detach v0.1.0

code/scripts/lighthouse-deploy.sh deploy
```

首次 `deploy` 的顺序：

1. 上传 Compose、`docker-deploy.sh`、数据库维护模块、package lock 和 Git revision；不上传 `local-courses/`、数据库、备份、`.git` 或开发产物。
2. 生成 root-only release `.env`，固定镜像、`127.0.0.1`、端口、备份目录和稳定状态卷。
3. 通过 `docker compose config --quiet` 验证配置，不打印展开后的 OAuth secret。
4. 检查 Caddyfile。脚本只替换自己带 marker 的文件；既有未标记配置默认拒绝覆盖。
5. 拉取固定镜像、等待 Compose health、调用内部 `/api/health`。
6. 验证并 reload Caddy。带域名的 Caddy 配置会自动申请和续期 HTTPS 证书；公网 80/443 必须可达。参见 [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)。
7. 只有远端健康成功后才更新 `current`/`previous` 发布指针。
8. 从本机验证公开 HTTPS health 和 HTTP→HTTPS 重定向。

若专用主机已有可安全替换但未标记的 Caddyfile，先人工审查。只有明确确认整台主机专用于本项目时，才可一次性执行：

```bash
LIGHTHOUSE_ALLOW_CADDY_REPLACE=1 \
  code/scripts/lighthouse-deploy.sh deploy
```

不要把该变量设成持久环境默认值。

## 8. 部署后验收

```bash
code/scripts/lighthouse-deploy.sh status
code/scripts/lighthouse-deploy.sh verify
```

脚本自动验证：

- 容器内 health 通过；
- `/api/health` 报告 `status=ok`、`mode=cloud`；
- 公网 HTTPS 可用；
- HTTP 返回重定向；
- Caddy 处于 active；
- 当前/上一 release、备份和磁盘状态可读。

仍须人工验证：匿名页面、真实 GitHub 登录、跨会话恢复、双用户隔离、管理员/普通用户边界、上游链接、云端无 Local Material。把结果写入新的 `docs/acceptance/` 报告，不要修改旧验收记录。

## 9. 备份、调度和服务器外副本

手工触发项目原生在线备份：

```bash
code/scripts/lighthouse-deploy.sh backup
```

脚本在独立 Node 24 维护容器中：

- 只读挂载当前发布工具和 SQLite 状态卷；
- 按 `package-lock.json` 缓存维护依赖；
- 调用 `npm run db:backup --prefix code`；
- 输出 AES-256-GCM 加密文件与 SHA-256 manifest；
- 应用 7 daily/3 weekly 保留；
- 把备份目录只读挂载给应用健康摘要。

从可信、持续在线的运维节点每天调度上述本地命令。脚本没有创建系统定时器，因为调度、凭据生命周期和告警属于部署方平台责任。

每次成功后还要把加密文件复制出服务器。可直接执行手工文档[第 12.2 节](./production-manual.md#122-创建原生一致性加密备份)的 SSH 归档命令，或接入组织批准的异地对象存储。没有服务器外副本时，OPS-003 仍未完成。

## 10. 版本升级

1. 在本地切到与新镜像一致的 tag，确认 clean working tree。
2. 更新 `LIGHTHOUSE_IMAGE` 为新固定 tag/digest。
3. 先手工运行一次 `backup`，把结果复制到服务器外并记录 manifest。
4. dry-run 新部署：

   ```bash
   LIGHTHOUSE_DRY_RUN=1 code/scripts/lighthouse-deploy.sh deploy
   ```

5. 执行部署：

   ```bash
   code/scripts/lighthouse-deploy.sh deploy
   ```

若已经存在 `current`，`deploy` 还会再次创建升级前原生备份；备份失败时部署立即中止。只有发生已经评估并明确批准的紧急情况，才能单次使用：

```bash
LIGHTHOUSE_ALLOW_NO_BACKUP=1 \
  code/scripts/lighthouse-deploy.sh deploy
```

该 break-glass 选项不能替代事后补做备份和事故记录，也不得写入 shell profile、CI 默认变量或自动化平台常驻配置。

## 11. 回滚

`rollback` 只切换到 `previous` release 的固定应用镜像，不恢复数据库。先按手工 Runbook 判断旧应用与当前 schema 是否兼容；未知即停止，走[新卷恢复流程](./production-manual.md#142-在新卷执行恢复演练)。

确认兼容并明确接受后：

```bash
export LIGHTHOUSE_ROLLBACK_CONFIRMED=1
code/scripts/lighthouse-deploy.sh rollback
unset LIGHTHOUSE_ROLLBACK_CONFIRMED
```

脚本默认先再做一次数据库备份，然后启动 previous、等待健康、交换发布指针并验证公网 HTTPS。回滚健康失败时不要连续重试或覆盖卷；停止写入并恢复升级前备份到新卷。

## 12. 状态与日志

```bash
code/scripts/lighthouse-deploy.sh status
code/scripts/lighthouse-deploy.sh verify
code/scripts/lighthouse-deploy.sh logs
```

`logs` 持续跟随应用容器，按 `Ctrl-C` 退出。不要把完整日志直接发布到公开 issue；先抽查并移除 Cookie、授权参数、查询词、私人正文和基础设施标识。Caddy 配置默认不启用 access log。

## 13. 供后续 Agent 直接执行的协议

后续 Agent 可以依据本文执行，但必须遵守以下顺序：

1. 读取本目录 README、本文和手工 Runbook；读取当前 `tasks.md` Phase 7 状态。
2. 只读检查本地 `git status`、目标 tag、脚本帮助和 `preflight`。
3. 核对用户明确提供的目标域名、固定镜像、SSH alias 和秘密文件路径；绝不请求或回显秘密值。
4. 先 dry-run，并向用户报告将改动的远端目录、服务、镜像和卷。
5. `bootstrap/configure/deploy/rollback` 都是外部状态写入；仅在当前请求明确授权相应动作时执行。
6. 不使用 `LIGHTHOUSE_ALLOW_NO_BACKUP` 或 `LIGHTHOUSE_ALLOW_CADDY_REPLACE`，除非用户对本次执行明确批准。
7. 不调用腾讯云快照回滚、不删卷、不执行 `down -v`、不清空 Caddyfile、不改变 DNS/防火墙，除非另有明确授权和目标核对。
8. 完成后保存：UTC 时间、实例标识（脱敏）、Git revision、镜像 digest、状态卷名、备份 manifest、内部/外部 health、OAuth/权限人工结果和回滚结果。
9. 真实证据未齐全时，不勾选 T7.3/T7.5/GATE-07/GATE-10。

## 14. 常见失败

| 失败                              | 含义与处置                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `BatchMode=yes` 登录失败          | SSH alias、密钥、用户名、22 端口或主机指纹不正确；回控制台核对，不降级到明文密码自动化 |
| `sudo=non-interactive` 未出现     | 当前用户不能无交互 sudo；改为受控部署用户或走手工 Runbook                              |
| 冲突容器包                        | 主机不是干净基线；人工评估并按 Docker 官方说明卸载，脚本不会代删                       |
| 镜像被拒绝                        | 未显式 tag/digest 或使用了 `latest`；选择真实发布版本                                  |
| `config --quiet` 失败             | 缺 secret、卷名/路径无效或 Compose 不兼容；不要启动容器                                |
| 拒绝 Caddyfile                    | 主机已有其他站点或非本脚本配置；人工合并，或确认专机后单次授权替换                     |
| 备份失败                          | 口令、状态卷、维护依赖、空间或权限异常；升级必须停止                                   |
| 内部 health 成功、外部 HTTPS 失败 | 检查 DNS、防火墙、80/443、Caddy journal；不要开放 3000 绕过                            |
| rollback health 失败              | 可能是数据库 schema 不兼容；停止写入并按备份恢复到新卷                                 |

## 15. 失败时回到手工文档的哪一节

脚本失败会指向它自己的内部状态。用这张表把 action 翻译回手工流程的对应位置，再照那一节逐条排查：

| 失败的 action | 回到手工文档                                                                              | 先确认                                             |
| ------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `preflight`   | [第 3–4 节](./production-manual.md#3-腾讯云控制面准备) 控制面与 SSH                       | 实例架构、防火墙 22 来源、密钥、非交互 sudo        |
| `bootstrap`   | [第 5–6 节](./production-manual.md#5-手工安装-docker-engine-与-compose) 安装 Docker/Caddy | 主机是否干净基线、是否有冲突的容器包               |
| `configure`   | [第 8 节](./production-manual.md#8-创建-github-oauth-app-与秘密文件) OAuth 与秘密         | 本机 env 文件权限 600、五项变量是否齐全            |
| `deploy`      | [第 7、9 节](./production-manual.md#9-验证-compose-并首次启动) 配置与首次启动             | 镜像是否固定版本、`config --quiet` 是否通过        |
| `verify`      | [第 10–11 节](./production-manual.md#10-配置-https-反向代理) HTTPS 与验收                 | DNS、80/443、Caddy journal；**绝不开放 3000 绕过** |
| `backup`      | [第 12.2 节](./production-manual.md#122-创建原生一致性加密备份)                           | 口令、状态卷名、磁盘空间、维护镜像可拉取           |
| `rollback`    | [第 14 节](./production-manual.md#14-应用回滚与数据库恢复)                                | 旧镜像能否读当前 schema；不能就走数据恢复          |

**脚本不做的三件事**，失败时不要指望它补上：腾讯云控制面（实例/防火墙/DNS/快照）、数据库恢复与切卷（手工第 14.2–14.3 节）、备份的异地副本。

## 16. 相关文档

- [local-manual.md](./local-manual.md) — 本机运行本地服务
- [production-manual.md](./production-manual.md) — 同一流程的完全手工版本
- [docs/deploy/README.md](./README.md) — 三条路径的选择与脚本运行位置分类
- [USER.md 第 4 节](../../USER.md) — 本机构建并推送发布镜像
- [plan.md 第 13.4 节](../plans/plan.md#134-部署容器与数据库运维) — 部署、容器与数据库运维约定
