# Local Material

`local-courses/` 是开发者本机保存的第三方 AI Agent 课程、教程和源码素材目录。它是 Local Mode 的只读素材库，不是本项目的公开内容仓库。

## 归属与交付边界

- 素材正文、附件、构建产物和嵌套 Git 仓库不进入本项目 Git。
- Cloud Mode 不复制、不打包、不挂载也不代理此目录。
- Local Mode 仅通过 `LOCAL_MATERIAL_ROOT` 读取，并要求目录白名单、只读挂载和路径穿越保护。
- 课程目录中的第三方条目必须保留作者、许可证状态和上游地址；本地拥有一份副本不等于获得公开发布许可。
- 本文件是 `local-courses/` 下唯一允许进入 Git 的文件，用于记录元数据和操作约定。

机器可读事实源是 [`docs/content-boundaries.json`](../docs/content-boundaries.json)；架构、内容归属和运行规则汇总在 [`docs/plans/plan.md`](../docs/plans/plan.md)。

## 目录和清单

目录结构应与 `code/content/` 课程目录中声明的 `localPath` 一致；不要依据旧站 `learning-site/data.js` 手工维护第二套清单。当前阶段、课程、路径和异常数量由脚本生成：

```bash
npm run audit:baseline --prefix code
npm run audit:boundaries --prefix code
```

基线统计见 [`code/reports/baseline/baseline.md`](../code/reports/baseline/baseline.md)，内容边界审计见 [`code/reports/content-boundaries/content-boundaries.md`](../code/reports/content-boundaries/content-boundaries.md)。不要把目录大小、Markdown 数量或阅读器条目数量写死在此文件；这些数字会随素材仓库变化。

## Local Mode 启动

从仓库根目录执行：

```bash
code/scripts/docker-deploy.sh local up
```

Compose 会将本目录只读挂载到容器的 `/data/local-courses`。如不使用 Docker，可在 `code/` 启动开发服务并显式指定：

```bash
DEPLOYMENT_MODE=local \
LOCAL_MATERIAL_ROOT="$PWD/local-courses" \
npm run dev --prefix code
```

素材缺失、正文格式不支持或上游仍可用时，页面应给出安全回退；不可把本地文件路径直接暴露到云端响应。

## 检查、审计和索引

在仓库根目录运行：

```bash
npm run materials --prefix code -- check
npm run materials --prefix code -- audit
npm run materials --prefix code -- reindex
npm run materials --prefix code -- drift
```

- `check` 检查目录白名单引用的 Git 仓库 freshness，只读执行，不会 fetch、pull 或修改工作区。
- `audit` 校验 schema、路径、访问策略和本地文件边界，生成 `code/reports/materials/audit/`。
- `reindex` 先审计，再仅索引允许访问的站内正文和本地白名单章节，生成 `code/reports/materials/search-index.json`。
- `drift` 对账目录声明与磁盘实际内容，生成 `code/reports/materials/catalog-drift.md`；发现未收录仓库、失效路径或缺少上游回退时按设计非零退出。它与 `check` 的上游 freshness 状态不同，也不应通过 `--apply` 自动猜测课程归属。

如需检查某个非默认根目录：

```bash
npm run materials --prefix code -- check \
  --local-material-root /path/to/local-courses \
  --output-dir /path/to/material-reports
```

## 单课程更新

更新是显式、单课程、fast-forward-only 操作：

```bash
npm run materials --prefix code -- update <course-id> --yes
```

命令会拒绝未知课程、没有 `localPath` 的课程、非 Git 目录、dirty working tree、分叉历史和无法确认的仓库状态；成功后自动运行本地内容审计并重建搜索索引。更新前后请保留报告，便于定位素材变化。

## 存储建议

素材可能很大，建议：

- 将本目录放在独立磁盘或按需挂载的路径，并通过 `--local-material-root` 或 `LOCAL_MATERIAL_ROOT` 指向它。
- 保留每个素材仓库自己的 `.git`，不要把多个仓库合并成一个不可追踪的目录。
- 定期清理仓库自身的构建缓存、虚拟环境和下载产物；先确认它们不是课程正文或复现实验依赖。
- 不要把 SQLite、备份、`.env`、Token、凭据或私人笔记复制到这里并提交。

旧站启动脚本 `./start-site.sh` 只用于迁移基线；它不会替代新应用的目录、审计、索引和双模式规则。
