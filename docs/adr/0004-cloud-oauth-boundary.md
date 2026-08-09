# ADR-0004：Better Auth 负责云端 GitHub 身份边界

## 状态

已采纳（2026-08-09）。

## 背景

云端需要 GitHub 登录、稳定用户 ID、最低身份权限、可过期会话和学习状态
关联。身份协议细节不应散落在页面或状态 repository 中；同时，项目已有
`users`、`accounts`、`sessions` 表和“SQLite 不保存第三方 Token”的隐私边界。

## 决策

- 使用 Better Auth 1.6.26 的 Next.js catch-all handler，生产 OAuth 回调为
  `/api/auth/callback/github`。
- GitHub 只申请 `read:user`；自定义 profile 读取只请求 `/user`，保存 GitHub
  数字 ID 和截断后的显示名，不请求或保存邮箱。
- 使用自定义 DB adapter 映射现有学习状态表：用户 ID 为
  `github-${githubId}`，账号只保留 provider/provider account ID，会话只保留
  SHA-256 `token_hash`。Better Auth 需要的原始会话 Token 只在请求处理期间
  存在于 cookie/API 内存中。
- OAuth state 使用 Better Auth 的短期签名 cookie；账户自动关联关闭；会话
  cookie 使用 `HttpOnly`、`SameSite=Lax`，HTTPS 下启用 `Secure`。
- 学习状态写操作继续使用独立的双提交 CSRF cookie/header；云端登录后的
  `/api/session` 会为已认证用户签发可读 CSRF cookie。
- 管理员判定继续只比较 `githubId` 白名单，不把邮箱、Token 或私人笔记带入
  管理员摘要、日志或导出。

## 兼容与迁移

旧的内部 OAuth seam 仍保留为单元测试/迁移参考，但不再作为生产回调入口；
`/api/auth/github/callback` 明确返回 `410`，避免两套回调流程并存。已有学习
状态表无需迁移，Better Auth adapter 直接复用现有列和级联关系。

## 验证

`code/modules/auth/better-auth.test.ts` 覆盖最低 scope、mock GitHub 回调、
不保存 provider/session secret、有效会话、过期会话和登出；
`better-auth-adapter.test.ts` 覆盖字段最小化和 token hash；双模式质量命令
另行验证构建、类型、lint、测试和 audit。
