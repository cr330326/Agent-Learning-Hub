# Agent Learning Hub

## 项目定位

Agent Learning Hub 是一个以实践成果为主线的 Agent 工程学习网站。它用九阶段路线组织四类学习轨道，同时支持云端公开学习和本地素材库深度阅读。

当前处于新全栈应用实施前期。产品范围和验收以 [spec.md](docs/plans/spec.md) 为准，实施顺序以 [tasks.md](docs/plans/tasks.md) 为准。

## 核心架构

- 新应用统一规划在 `code/`，采用 Next.js App Router + TypeScript 全栈工程。
- 同一代码库支持 `cloud` 和 `local` 两种运行模式，差异收敛在 Content Resolver 的 Cloud/Local Adapter。
- Git 管公开课程与自有内容；SQLite 只管身份、会话和个人学习状态。
- 云端不依赖、不打包、不代理 `local-courses/`；本地模式将其只读挂载，缺失内容回退到上游网页。
- 架构图、接口和数据模型详见 [plan.md](docs/plans/plan.md) 与 [spec.md](docs/plans/spec.md)；关键取舍见 [ADR](docs/adr/)；领域术语见 [CONTEXT.md](CONTEXT.md)。

## 关键模块

- `catalog`：公开课程、阶段和资料的读取、校验与查询。
- `content-resolver`：统一解析站内正文、本地文件、上游链接和不可用状态。
- `reader`、`search`：安全阅读策展内容，并只索引允许访问的内容。
- `auth`、`learning-state`：GitHub/本地身份，以及进度、笔记、收藏和阶段成果。
- `freshness`：读取素材状态；Git 检查和更新由宿主机命令执行。

## 关键约定

- `code/` 是新前端和后端的唯一现役工程目录；不要再创建 `apps/web/` 或第二套应用。
- `learning-site/` 与根 `index.html` 是迁移基线，暂不移动进 `code/`，也不新增产品功能；Phase 8 对等验收后再归档。
- 公开内容不存 SQLite；第三方条目必须保留作者、许可证状态和上游地址。
- 学习条目 ID 在云端、本地保持一致；阅读或点击只表示开始，完成必须由用户主动确认。
- 本地文件必须来自目录白名单并限制在只读挂载根内；禁止路径穿越和可执行 MDX。
- 网站进程不得直接更新嵌套素材仓库；单课程更新只允许 clean working tree 上的 fast-forward。
- 按 [tasks.md](docs/plans/tasks.md) 的 Phase 和依赖实施；改变运行模式、内容归属或数据库边界时先更新 ADR/spec/tasks。
- 架构图、接口清单和数据模型只维护在 `docs/`，本文件不复制详细定义。

## 怎么跑

当前可运行的是迁移基线：在仓库根目录执行 `./start-site.sh`，默认访问 `http://localhost:8765/learning-site/`；脚本会先运行本地路径审计。不要直接用 `file://` 打开页面。

新应用位于 `code/`，以 `code/package.json` 的 scripts 和部署文档为唯一命令来源。首次安装并启动开发服务器：`cd code && npm ci && npm run dev`，默认访问 `http://localhost:3000`。提交前运行 `npm run check:cloud` 与 `npm run check:local`；它们分别验证两种运行模式的格式、lint、类型、测试和生产构建。

## 禁区

## 历史包袱
