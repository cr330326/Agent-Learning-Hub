# 本机 Cloud 凭据配置与真实服务验证

日期：2026-11-15（北京时间）。本轮范围为维护者授权的 GitHub、飞书与根目录 `.env` 配置；GLM 按维护者决定留待后续启用。没有公网部署、充值、仓库写入或真实收录 PR。

## 已配置与已验证

| 项目               | 结果与验证边界                                                                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本机站点           | `http://127.0.0.1:3002`；`BETTER_AUTH_URL`、`APP_PORT` 与 OAuth 回调一致                                                                                                                                                      |
| GitHub OAuth       | 已创建 `Agent Learning Hub Local`；真实 GitHub 授权仅申请 `read:user`，成功返回 `/learning` 并显示已登录账户；已进入 `/admin/discovery`                                                                                       |
| 管理员             | 已配置维护者 GitHub 数字 ID；后台访问已实测                                                                                                                                                                                   |
| GitHub App         | `agent-learning-hub-cr330326`，App ID `5767072`，安装 ID `182134115`；关闭 Webhook，仅安装到 `cr330326/Agent-Learning-Hub`                                                                                                    |
| App 权限           | API 返回 `contents:write`、`pull_requests:write`、`metadata:read`；安装范围为 `selected`，令牌列出的仓库数量为 1                                                                                                              |
| App 签名与安装令牌 | 私钥签名、获取安装令牌及读取 `main` 分支通过；验证用临时令牌已撤销（HTTP 204）；没有创建分支或 PR                                                                                                                             |
| 飞书               | 既有 App ID/Secret 可获取 tenant token；应用身份 `bitable:app:readonly` 已生效，版本管理显示 `1.0.9` 已发布，后续新版本表单显示无权限变更，因此未重复发布                                                                     |
| 九个子表           | 三份 Base 的列表、每表字段列表及单条记录查询均返回 code 0；每表有可读记录。未做全量导入、字段映射保存或完整分页验收                                                                                                           |
| 凭据文件           | `.env` 为 `0600` 且被 Git/Docker 忽略；私钥移至 `~/.config/agent-learning-hub/github-app.pem`，目录 `0700`、文件 `0600`，以只读挂载提供给网页及 worker                                                                        |
| GLM                | 标准接口配置为 `https://open.bigmodel.cn/api/paas/v4/chat/completions`；先前最小调用返回 HTTP 429 / 1113（余额不足或无资源包）。维护者明确暂不启用，已清空 `DISCOVERY_MODEL_NAME`，保留既有 Key、价格与恢复启用注释；没有充值 |

九个已验证子表：

| Base                        | 子表 ID          | 字段数 | 字段 / 记录接口 |
| --------------------------- | ---------------- | ------ | --------------- |
| F2Llb2ZLgaqCQ3skHvWcz2ANnCe | tblnlCl4LPlL04t6 | 7      | code 0 / code 0 |
| 同上                        | tblt8cewdO5FZ6gU | 10     | code 0 / code 0 |
| 同上                        | tblktugZhkcXIAT9 | 14     | code 0 / code 0 |
| YoRgbWDUNaSGnYsfeBgcSIYxnKh | tblI6oJy7yIMZkNl | 8      | code 0 / code 0 |
| 同上                        | tble8qE561mK4cBH | 8      | code 0 / code 0 |
| W5TBbp65Iac5tuschwpc1cZPngd | tblel80VmXfBzyLK | 11     | code 0 / code 0 |
| 同上                        | tblgt0yLtuSmVY4m | 10     | code 0 / code 0 |
| 同上                        | tbl4Iw14iu5lAZTF | 10     | code 0 / code 0 |
| 同上                        | tbl97XGWRSxeUHOM | 9      | code 0 / code 0 |

## 登录跳转修复与回归

真实 OAuth 回调后首次被重定向到 `http://0.0.0.0:3000/learning`。原因是 `/api/auth/github` 根据容器内部 `request.url` 生成成功和失败返回地址。现优先使用已配置的 `BETTER_AUTH_URL`（兼容 `APP_URL`），避免内部监听地址成为浏览器返回地址；认证协议与权限不变。

`github-login-redirect.test.ts` 在修复前两项失败，明确捕获内部地址；修复后通过，亦覆盖不信任客户端 forwarded host。后续真实 GitHub 登录已返回 `http://127.0.0.1:3002/learning`。

| 验证                          | 结果                                         | 证据                                                                             |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| 认证单测                      | 4 个文件、7 项通过                           | [auth-unit.txt](../../code/reports/oauth-configuration-2026-11-15/auth-unit.txt) |
| Cloud HTTP E2E                | 47 项通过                                    | [cloud-e2e.txt](../../code/reports/oauth-configuration-2026-11-15/cloud-e2e.txt) |
| Local HTTP E2E                | 公开路由、健康及状态生命周期通过             | [local-e2e.txt](../../code/reports/oauth-configuration-2026-11-15/local-e2e.txt) |
| 格式、定向 ESLint、TypeScript | 通过                                         | 对改动文件执行 Prettier / ESLint，执行 `npm run typecheck`                       |
| 生产镜像与真实 OAuth          | r15 构建通过，健康、真实登录与管理员访问通过 | 本机 Tabbit 操作与 `alh-cloud-real` 运行实例                                     |

状态 E2E 在同源代码的 Linux builder 镜像内运行，每个模式使用单独容器内的一次性 SQLite；Cloud 服务与测试共享文件系统，使用假 provider 配置，GitHub ID `4242` 加入测试管理员白名单。测试最终删号，未使用维护者真实状态库。真实账户的浏览器登录验证与上述隔离 E2E 是两份独立证据。

## 本机运行与后续事项

本机固定镜像 `agent-learning-hub:phase9-20261115-r15`，manifest digest `sha256:9a52994700c287466dad77f2939dd1b69b6e35d0def1626e2c69cf159b8d9c70`。Compose 项目为 `alh-cloud-real`，仅绑定回环 `3002`；网页与 worker 使用独立于历史验收实例的状态卷，私钥按已有 GitHub App override 只读挂载。信源尚未初始化或导入；API 读取权限通过不代表自动同步业务已验收。

启动或检查时应保留同一项目名与私钥 override，例如从仓库根目录执行：

```bash
COMPOSE_PROJECT_NAME=alh-cloud-real \
COMPOSE_EXTRA_FILES=code/docker/docker-compose.github-app.yml \
bash code/scripts/docker-deploy.sh cloud status
```

后续启用模型前，准备可用的标准 API 额度/Key，再填写 `DISCOVERY_MODEL_NAME=glm-5.3-flash` 并重建 worker 环境。部署域名后同时调整站点地址与 GitHub OAuth 回调；本次本机成功不构成公网 HTTPS、两用户跨会话、真实收录 PR/发布或生产回退验收。
