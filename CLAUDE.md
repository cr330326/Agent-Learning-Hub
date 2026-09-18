# CLAUDE.md

本文件只是查阅索引，不复制规则。需要时用 Read 打开下列原文，不要用 `@` 把整份文档导入上下文。

1. **动手改任何文件之前**，先读 [AGENTS.md](AGENTS.md)：本仓库的全部规则与纪律，所有 Agent 共用。
2. 需要了解项目时读 [README.md](README.md)：项目介绍、技术栈、目录结构、常用命令和当前状态。
3. 按任务查对应的事实源：

| 任务                             | 参考                                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 改产品行为或验收场景             | [docs/plans/spec.md](docs/plans/spec.md)                                                                                                 |
| 改架构、内容模型、部署或备份边界 | [docs/plans/plan.md](docs/plans/plan.md)、[docs/adr/](docs/adr/)                                                                         |
| 查或更新任务状态、实施证据       | [docs/plans/tasks.md](docs/plans/tasks.md)                                                                                               |
| 改脚本、Docker 或部署流程        | [docs/deploy/README.md](docs/deploy/README.md)                                                                                           |
| 改测试或质量门禁                 | [docs/testing-strategy.md](docs/testing-strategy.md)                                                                                     |
| 对齐领域术语                     | [CONTEXT.md](CONTEXT.md)                                                                                                                 |
| 写 Next.js 代码                  | [code/AGENTS.md](code/AGENTS.md)：本项目的 Next.js 版本有破坏性变更，先读随包文档（`npm ci` 后位于 `code/node_modules/next/dist/docs/`） |

新规则写进 AGENTS.md，项目信息写进 README.md，不要写进本文件。
