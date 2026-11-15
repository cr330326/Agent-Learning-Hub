将 Anthropic Engineering 的长时 Agent Harness 文章加入公开目录，稳定 ID 为 `anthropic-long-running-agent-harness`，关联阶段 3（Harness）和阶段 7（评测与安全）。条目保留作者、上游链接和待确认的许可证状态，采用上游访问方式。

新增目录条目后，原测试写死的数量会导致 CI 失败。测试现依据有效目录核对数量、ID 集合与顺序，保留退场排除、旧 ID 转发和标签筛选断言。同时将 Better Auth 升级到 `^1.7.25`，并适配 GitHub 最小 profile 类型；保留既有稳定用户 ID、权限及隐私规则。

变更共六份文件：两份目录文件、目录测试、认证配置与 package/lockfile。没有加入资讯模块开发代码、运维配置、环境文件或凭据。

验证基于 main 的独立检出及本 PR 的全部六份变更：

- Cloud / Local 各 177 项单测、11 项工具测试，格式、lint、类型、内容审计及生产构建通过。
- Cloud 33 项认证与学习状态 E2E、Local 状态生命周期 E2E 通过，均使用独立一次性数据库。
- `npm audit --omit=dev --audit-level=high` 返回 0 vulnerabilities。

本 PR 供维护者审阅，尚未合并或发布。
