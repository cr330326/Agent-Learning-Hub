# Local Courses

从 GitHub 下载到本地的 AI Agent 课程 / 教程 / 源码素材。约 11 GB，8800+ 篇 Markdown。

目录按**四条学习轨道**组织，`learning-site/` 的站点结构与之一一对应——改这里的目录名，
就必须同步改 `learning-site/data.js`（校验办法见文末）。

| 轨道 | 定位 | 体积 | Markdown |
| --- | --- | --- | --- |
| `Learning/` | 系统课程与教材：从零建立 Agent 认知 | 697 MB | 472 |
| `Agentic/` | 框架、记忆层与 Harness 理论 | 3.7 GB | 2548 |
| `AICoding/` | Coding agent 的源码、文档与插件生态 | 5.6 GB | 5630 |
| `Application/` | 落地应用与工具：agent 装进产品之后长什么样 | 1.4 GB | 213 |

> `AI-Coding/` 已改名为 `AICoding/`。站点侧只需改 `data.js` 里 `tracks[].dir`
> 和引用字符串，轨道 id（`ai-coding`）保持不变，用户已存的进度不受影响。

---

## Learning · 系统课程与教材

| 项目 | 路径 | 说明 | 站点状态 |
| --- | --- | --- | --- |
| Hello-Agents | `Learning/hello-agents/` | Datawhale 中文系统教程：16 章正文 + 12 扩展章节 + 2 附加章 + 35 个共创项目 + 逐章 code | ✅ 阅读器 5 组 |
| claw0 | `Learning/claw0/` | 从 agent loop 到 OpenClaw-like gateway。`sessions/zh/` 下 10 章中文讲义 + 配套 Python | ✅ 阅读器 2 组 |
| Easy Agent | `Learning/easy-agent/` | ConardLi 从零复刻 Claude Code 的终端 Agent，`step/` 下 step1–18 渐进源码 | ✅ README |
| easy-learn-ai | `Learning/easy-learn-ai/` | ConardLi 的 AI 学习知识网站源码，`ai-sites/` 下 50+ 概念可视化 | ✅ README |
| Hello-Agents PDF | `Learning/Book/Hello-Agents-V1.0.0-20251103.pdf` | 正式版电子书（74 MB） | 📄 浏览器直开 |
| LLM Book | `Learning/Book/LLMBook.pdf` | 大语言模型基础教材（10 MB） | 📄 浏览器直开 |
| Palantir 本体论 | `Learning/Book/Palantir-Ontology/本体论.pdf` | 企业本体建模中文资料（18 MB） | 📄 浏览器直开 |

## Agentic · 框架、记忆与理论

| 项目 | 路径 | 说明 | 站点状态 |
| --- | --- | --- | --- |
| Learn Harness Engineering | `Agentic/Document/learn-harness-engineering/` | 12 讲中文理论课 + 6 个实战项目 + 技能与资料库 | ✅ 阅读器 1 组（16 篇） |
| Harness Books | `Agentic/Document/harness-books/` | 双册短书：Book 1 拆 Claude Code，Book 2 对比 CC 与 Codex | ✅ 阅读器 2 组 |
| 驾驭工程：从 CC 到 AI Coding | `Agentic/Document/harness-engineering-from-cc-to-ai-coding/` | 基于 Claude Code v2.1.88 逆向源码的 30+ 章技术书 | ✅ 阅读器 3 组 |
| mem0 | `Agentic/Memory/mem0/` | 生产级 agent 记忆层：抽取 / 存储 / 检索三段式管道 | ✅ README + LLM.md |
| LangChain | `Agentic/Langchain-ai/langchain/` | 链式调用框架本体 | ✅ README |
| LangGraph | `Agentic/Langchain-ai/langgraph/` | 有状态图式 agent 编排 | ✅ README |
| DeepAgents | `Agentic/Langchain-ai/deepagents/` | 长任务深度 agent：子 agent + 计划文件 | ✅ README + AGENTS.md |
| CrewAI | `Agentic/crewAI/` | 团队 + 角色 + 任务模型的多 agent 框架 | ✅ README |
| MetaGPT | `Agentic/MetaGPT/` | 把软件公司 SOP 编码成多 agent 协作 | ✅ README |
| AutoGPT | `Agentic/AutoGPT/` | 第一代自主 agent，现已演进为带可视化编排的 Platform | ✅ README |
| OpenHands | `Agentic/OpenHands/` | 面向真实软件工程任务的 agent 平台（含完整前端与运行时） | ✅ README |
| PI | `Agentic/PI/pi-mono/` | PI agent toolkit monorepo | ✅ README + AGENTS.md |
| openworker | `Agentic/openworker/` | 「数字同事」形态：personas / connectors / memory / TUI + GUI | ✅ README |
| AI Agent Deep Dive | `Agentic/ai-agent-deep-dive/` | 现代 coding agent 逐项拆解：17 篇短文 + 2 版 PDF 报告 | ✅ 阅读器 1 组（18 篇） |
| Multica | `Agentic/multica/` | 人机协作平台：CLI + daemon + Web，含自托管与架构交接审计 | ✅ 阅读器 7 篇 |
| Open Agent SDK | `Agentic/open-agent-sdk-typescript/` | 进程内跑完整 agent loop 的 TS SDK，兼容 Anthropic / OpenAI | ✅ README |

## AICoding · Coding Agent 与 Harness

### Claude 生态（`AICoding/claude/`）

| 项目 | 路径 | 说明 | 站点状态 |
| --- | --- | --- | --- |
| learn-claude-code | `claude/document/learn-claude-code/` | 从零复刻 Claude Code-like nano agent，s01–s20 共 20 章，每章可运行 | ✅ 阅读器 1 组（21 篇） |
| Claude Code Guide | `claude/document/claude-code-guide/` | 官方用法指南整理 | ✅ README |
| ClaudeMD 范例 | `claude/document/ClaudeMD/` | CLAUDE.md 工程范例 + Karpathy Skills 中文版 | ✅ 3 篇 |
| 源码逆向分析 | `claude/code/claude-code-analysis/` | 20 篇专题分析：架构 / 安全 / 记忆 / 工具 / Skills / MCP / 沙箱 / 上下文 | ✅ 阅读器 1 组（13 篇） |
| 源码合集 | `claude/code/collection-claude-code-source-code/` | 原始源码 + claw-code + nano-claude-code + 深度解读 | ✅ 中文 README |
| 源码解读 | `claude/code/claude-code-source-code/` | 多语言 README（中/英/日/韩）+ `docs/zh/` 5 篇专题 | ✅ 中文 README |
| Claude Code Lens | `claude/code/claude-code-lens/` | 本地可观测代理：记录 system prompt / tool calls / token | ✅ README |
| awesome-claude-code | `claude/code/awesome-claude-code/` | 生态精选清单（72 KB README，当检索表用） | ✅ README |
| claude-init / templates | `claude/code/claude-init/`、`claude-code-templates/` | 项目初始化脚手架与组件模板市场 | ✅ 3 篇 |
| claude-code-haha / rev | `claude/code/claude-code-haha/`、`claude-code-rev/` | 第三方重实现与逆向实验，适合和原版对照 | ✅ 3 篇 |
| 插件 ×5 | `claude/plugins/` | claude-mem（记忆压缩）、claudian、claude-mermaid、claude-stt、auto-mode-unlock（含 26 KB 逆向方法论） | ✅ 阅读器 8 篇 |

### 其他 Coding Agent

| 项目 | 路径 | 说明 | 站点状态 |
| --- | --- | --- | --- |
| OpenClaw | `AICoding/openclaw/` | 本地优先个人 agent。`doc/openclaw_guide/` 16 章官方指南 + 附录；`openclaw-code/` 本体源码；`channels/openclaw-lark/` 飞书通道 | ✅ 阅读器 1 组（23 篇） |
| OpenAI Codex | `AICoding/codex/codex-code/` | 官方 coding agent CLI（Rust + TS），沙箱与 approval 流程 | ✅ README |
| OpenCode 中文实战课 | `AICoding/opencode/learn-opencode/` | 零基础中文教程：安装、模型、界面、Agent、MCP | ✅ 阅读器 11 篇 |
| OpenCode 生态 | `AICoding/opencode/` | `code/opencode/` 本体 + `awesome-opencode/` 索引 + openchamber / openwork / supermemory + `plugins/wakatime` | ✅ 7 篇 |
| Hermes Agent | `AICoding/hermes/` | 自进化 agent：learning loop、skill 自创建、跨会话记忆。含 2 篇中文深度调研 | ✅ 阅读器 4 篇 |
| CyberClaw | `AICoding/CyberClaw/` | 企业级透明可控智能体：白盒决策、两段式安全调用、双水位记忆 | ✅ 阅读器 4 篇 |
| MiMo-Code | `AICoding/MiMo-Code/` | 小米开源终端 coding assistant，monorepo 组织 | ✅ README + AGENTS.md |

## Application · 落地应用与工具

学到最后，东西得能装进产品。这条轨道收的是成品应用和开发框架，不是教程——
读法是「看它怎么做的」，不是「跟着做一遍」。

| 项目 | 路径 | 说明 | 站点状态 |
| --- | --- | --- | --- |
| cc-switch | `Application/cc-switch/` | Claude Code / Codex 供应商切换器（Tauri）。中文用户手册 5 部分 + 6 篇中文路由指南 | ✅ 阅读器 1 组（19 篇） |
| CodexSwitch | `Application/CodexSwitch/` | 多个 Codex / OpenAI OAuth 账号管理（Tauri 2），含 38 KB 完整 SPEC | ✅ 阅读器 5 篇 |
| WorkAny | `Application/workany/` | 自然语言驱动的桌面 AI agent：实时代码生成、工具执行、工作区管理 | ✅ 阅读器 2 篇 |
| Solon-AI | `Application/solon-ai/` | Java 全场景 AI 应用开发框架：core / MCP / A2A / ANP / Flow / RAG 模块化拆分 | ✅ 阅读器 4 篇 |

---

## 未下载

| 项目 | 原因 |
| --- | --- |
| microsoft/ai-agents-for-beginners | 12 课系统化入门，但仓库约 3.7 GB 含视频素材。站点保留外链卡片，建议只 clone 文档部分 |

---

## 怎么用

在仓库根目录：

```bash
./start-site.sh
```

它会先校验课程路径，再起本地服务并打开 <http://localhost:8765/learning-site/>。
阅读器会自动把 GitHub raw 图片地址转成本地路径、记录阅读位置、标记已完成章节。

## 动过这个目录之后必须做的事

站点的 314 条阅读器条目和 40 张课程卡片，路径全部硬编码在 `learning-site/data.js`。
这里的任何改动都会以两种方式之一悄悄破坏站点：

- **改名或移动** → `data.js` 的引用指向空气。页面照常渲染，只有点开某一章才 404。
  （`AI-Coding/` → `AICoding/` 那次一口气废掉 119 条。）
- **新下载课程** → 目录躺在磁盘上，`data.js` 里没人提，站点上压根不存在。这一类
  连 404 都没有，只会一直没人发现。

一条命令同时查两个方向：

```bash
cd learning-site && python3 scripts/audit_paths.py
```

失效路径会列清单并以非 0 退出码结束；未收录的项目只提示，提醒你去 `data.js` 补
`courses` / `menuData`。`start-site.sh` 每次启动都会自动跑它。
