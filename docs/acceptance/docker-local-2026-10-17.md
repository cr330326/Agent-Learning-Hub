# 2026-10-17 本地 Docker 部署与全量端到端验收报告

## 结论

**本机 Docker 部署成功，三层验证全部通过：镜像构建、浏览器端走查与功能回归、协议级双模式端到端。**

正式实例为 `agent-learning-hub:local`（本地构建，未打版本标签），以 Local Mode 运行在
`http://127.0.0.1:3001`，健康检查返回 `status=ok`、`mode=local`，`catalog` 与
`database` 均为 ok，容器状态 `healthy`。

本轮没有部署云端、推送镜像、使用真实 OAuth 或修改素材仓库。真实 GitHub OAuth 两用户
隔离、GHCR 拉取与回滚、公网 HTTPS、异地备份与调度、生产日志复核仍未完成，因此不能
宣称正式发布完成。

## 执行环境

| 项目     | 值                                                              |
| -------- | --------------------------------------------------------------- |
| 日期     | 2026-10-17（Asia/Shanghai）                                     |
| 主机     | macOS，aarch64                                                  |
| Docker   | 29.8.2，Docker Desktop，Compose v5.6.0（10 CPU / 8 GB）         |
| 生产构建 | Next.js 16.4.0；`check:cloud` 与 `check:local` 在提交前均已通过 |
| 依赖审计 | `npm audit --omit=dev --audit-level=high`：0 vulnerabilities    |
| 浏览器   | 本机 Google Chrome（`PLAYWRIGHT_CHANNEL=chrome`）               |
| 测试状态 | 每个阶段使用独立端口或一次性 SQLite 文件，容器用独立命名卷      |

Playwright 只作为本机测试工具临时放入 `code/node_modules`，不写入 `code/package.json`，
也不进入镜像。

## 已执行验证

| 验证                                       | 结果 | 证据                                                                           |
| ------------------------------------------ | ---- | ------------------------------------------------------------------------------ |
| `code/scripts/local-preview.sh`            | 通过 | 镜像构建 → 启动 → 健康等待 → `/api/health` 全部成功，14 s 完成启动阶段         |
| `audit:ui`（Docker 实例，`:3001`）         | 通过 | 48 次抓取 / 0 finding，写入 `code/reports/ui-review-docker-local/`             |
| `audit:functional`（Docker 实例，`:3001`） | 通过 | 21/24 通过、3 条按环境跳过，见下节                                             |
| `test:e2e:local`（一次性实例 `:3100`）     | 通过 | 首页/9 条公开页/健康检查/管理员边界冒烟 + `learning-state-http` 全流程         |
| `test:e2e:cloud`（一次性实例 `:3100`）     | 通过 | **29/29**：真实登录跳转、回调签会话、CSRF 双提交、导出脱敏、删号级联与会话失效 |
| 命名卷持久化                               | 通过 | 写入进度 240 / 笔记 / 收藏 → `docker restart` → 三项全部保留，`position=240`   |
| 干净重建                                   | 通过 | `down` → 删命名卷 → 重新启动，实例回到空状态且健康                             |

两条 e2e 都以删号收尾，因此都指向带独立 `STATE_DATABASE_PATH` 的一次性实例
（`/tmp/alh-e2e-local.sqlite`、`/tmp/alh-e2e-cloud.sqlite`），从未指向 `:3001` 的
日常预览。

## 环境差异：素材库未挂载

本机 `local-courses/` 只有 `README.md`，没有真实素材正文，容器以只读方式挂载同一目录。
因此 `local-preferred` 条目在 Local Mode 下回退到上游链接，阅读器渲染
`.reader-fallback` 而不是 `.reader-body`：

| 检查                                   | 结果 | 原因                                           |
| -------------------------------------- | ---- | ---------------------------------------------- |
| reader opens the course document       | SKIP | 本地素材未挂载，该条目回退到上游，无正文可断言 |
| reader chapter tabs switch content     | SKIP | 同上                                           |
| reader has previous/next chapter links | SKIP | 同上                                           |

这三条不是回归：08-25 的报告在素材库可用时全部通过，Cloud 模式的同一批断言本轮也
仍然通过（Cloud 读站内自有内容）。为避免在无素材机器上长期假红，`functional-regression.mjs`
新增了 `SkipCheck`：页面既无正文也无回退时仍然 FAIL，只有回退成立才记 SKIP，报告与
标准输出都单独标注 `skipped` 数量。

## 环境准备记录（不属于仓库内容）

Docker Hub 在本机网络不可达（`auth.docker.io` 超时、`Bad Gateway`），首次构建在
`FROM node:24-bookworm` 处失败。为 Docker Desktop 配置了 registry mirror
（`https://docker.m.daocloud.io`、`https://docker.1ms.run`）后构建成功；原配置已备份为
`~/.docker/daemon.json.bak-*`。这是本机环境设置，不写入仓库、不影响 CI 与云端 Runbook。

## 复现命令

```bash
export PATH="$HOME/.docker/bin:$PATH"

# 1. 部署
code/scripts/local-preview.sh

# 2. 浏览器端验证（需要运行中的实例与 Playwright）
PLAYWRIGHT_CHANNEL=chrome node code/scripts/ui-review.mjs \
  --base-url http://127.0.0.1:3001 --output-dir code/reports/ui-review-docker-local
PLAYWRIGHT_CHANNEL=chrome node code/scripts/functional-regression.mjs \
  --base-url http://127.0.0.1:3001 --output-dir code/reports/functional-regression-docker-local

# 3. 协议级端到端（一次性实例，结尾删号）
PORT=3100 DEPLOYMENT_MODE=local STATE_DATABASE_PATH=/tmp/e2e-local.sqlite npm start --prefix code
APP_URL=http://127.0.0.1:3100 npm run test:e2e:local --prefix code

# 4. 云端身份链路（GitHub 端点打桩，不需要真实 OAuth App）
PORT=3100 DEPLOYMENT_MODE=cloud STATE_DATABASE_PATH=/tmp/e2e-cloud.sqlite \
  BETTER_AUTH_SECRET=<任意长随机值> BETTER_AUTH_URL=http://127.0.0.1:3100 \
  GITHUB_CLIENT_ID=test GITHUB_CLIENT_SECRET=test npm start --prefix code
APP_URL=http://127.0.0.1:3100 npm run test:e2e:cloud --prefix code
```

## 未覆盖

- 素材库可用时的本地阅读器正文、章节切换与上下章翻页（需要真实 `local-courses/` 内容）。
- 真实 GitHub OAuth 的两用户隔离（本轮打桩）、GHCR 固定镜像拉取与回滚。
- 公网 HTTPS、DNS、异地备份调度、生产日志抽查。
