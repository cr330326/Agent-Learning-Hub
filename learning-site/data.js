/**
 * Agent Learning Hub — 内容数据层
 *
 * 所有本地路径都写成相对 `local-courses/` 的形式（例如 "Learning/hello-agents/README.md"），
 * 由 app.js 的 docUrl() 统一补上 `../local-courses/` 前缀。
 * 目录再次调整时，只改这里的字符串，不用碰渲染逻辑。
 *
 * 校验：node scripts/audit-paths.mjs（或 python3 scripts/audit_paths.py）
 */

(function () {

const COURSE_ROOT = "../local-courses/";

/* ---------------------------------------------------------------------------
 * 四条学习轨道 — 与 local-courses/ 的一级目录一一对应
 *
 * id 是站点内部标识（CSS 选择器、localStorage 都按它走），dir 才是磁盘上的目录名。
 * 两者刻意分开：目录曾从 AI-Coding 改名成 AICoding，只需改 dir，不用动样式和已存进度。
 * ------------------------------------------------------------------------- */
const tracks = [
  {
    id: "learning",
    dir: "Learning",
    name: "Learning",
    zh: "系统课程与教材",
    desc: "从零建立 Agent 认知的主线教材：概念、范式、记忆、协议、评估，配套可运行代码。"
  },
  {
    id: "ai-coding",
    dir: "AICoding",
    name: "AICoding",
    zh: "Coding Agent 与 Harness",
    desc: "Claude Code / Codex / OpenClaw / OpenCode 等真实 coding agent 的源码、文档与插件生态。"
  },
  {
    id: "agentic",
    dir: "Agentic",
    name: "Agentic",
    zh: "框架、记忆与理论",
    desc: "多 Agent 框架、记忆层，以及 Harness Engineering 的理论书与讲义。"
  },
  {
    id: "application",
    dir: "Application",
    name: "Application",
    zh: "落地应用与工具",
    desc: "把 agent 装进产品：桌面客户端、供应商切换器、企业级开发框架——学完之后东西长什么样。"
  }
];

/* ---------------------------------------------------------------------------
 * 学习进阶路线
 * ------------------------------------------------------------------------- */
const stages = [
  {
    id: "stage-0",
    badge: "Stage 0",
    title: "理解 Agent 是什么",
    summary: "区分 chatbot、workflow、agent 和 multi-agent，建立 observe → think → act → observe 的基本模型。",
    tasks: ["画出 agent loop", "读 Anthropic effective agents", "读 OpenAI agent guide"],
    output: "产出：一页短笔记，解释你的场景为什么需要 Agent。",
    reading: [
      { label: "Hello-Agents 第 1 章", doc: "Learning/hello-agents/docs/chapter1/第一章 初识智能体.md" }
    ]
  },
  {
    id: "stage-1",
    badge: "Stage 1",
    title: "构建最小 Agent Loop",
    summary: "用 LLM API、结构化 JSON、工具函数和错误边界做出 50-150 行的最小 agent。",
    tasks: ["实现工具选择", "执行 calculator/search/read_file", "加入最大步数、超时和错误处理"],
    output: "产出：一个能选择工具并返回最终答案的最小 agent。",
    reading: [
      { label: "learn-claude-code s01", doc: "AICoding/claude/document/learn-claude-code/s01_agent_loop/README.md" },
      { label: "claw0 s01 Agent Loop", doc: "Learning/claw0/sessions/zh/s01_agent_loop.md" }
    ]
  },
  {
    id: "stage-2",
    badge: "Stage 2",
    title: "工具、RAG 与记忆",
    summary: "把搜索、文件、数据库、浏览器和代码执行接成工具，理解短期上下文、会话记忆和长期记忆。",
    tasks: ["实现 chunk/embed/retrieve", "回答附带引用", "处理空结果、失败和重复调用"],
    output: "产出：一个资料研究助手。",
    reading: [
      { label: "Hello-Agents 第 8 章 记忆与检索", doc: "Learning/hello-agents/docs/chapter8/第八章 记忆与检索.md" },
      { label: "mem0 架构总览", doc: "Agentic/Memory/mem0/LLM.md" }
    ]
  },
  {
    id: "stage-3",
    badge: "Stage 3",
    title: "研究现代 Agent Harness",
    summary: "深入一个系统，拆 agent loop、tool registry、permission gate、session store、context compaction。",
    tasks: ["跑通最小示例", "加一个自定义工具", "观察一次完整 trace"],
    output: "产出：可调试的 harness demo。",
    reading: [
      { label: "Harness Engineering 第 2 讲", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-02-what-a-harness-actually-is/index.md" },
      { label: "驾驭工程书 第 3 章 Agent Loop", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part1/ch03.md" }
    ]
  },
  {
    id: "stage-4",
    badge: "Stage 4",
    title: "多 Agent 协调",
    summary: "把 multi-agent 当作可控协作问题，而不是让角色随意聊天。",
    tasks: ["定义 planner/executor/reviewer 边界", "设计 schema 和停止条件", "防止循环和上下文膨胀"],
    output: "产出：research → write → review → revise 小系统。",
    reading: [
      { label: "learn-claude-code s15 Agent Teams", doc: "AICoding/claude/document/learn-claude-code/s15_agent_teams/README.md" },
      { label: "驾驭工程书 第 20 章 派生与编排", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch20.md" }
    ]
  },
  {
    id: "stage-5",
    badge: "Stage 5",
    title: "Skills 与协议",
    summary: "理解 Skill、Tool、Prompt、MCP、A2A、ACP 的边界，把流程知识打包为可复用能力。",
    tasks: ["写最小 SKILL.md", "加入脚本或模板", "写 smoke test"],
    output: "产出：一个可复用 skill pack。",
    reading: [
      { label: "Hello-Agents 第 10 章 通信协议", doc: "Learning/hello-agents/docs/chapter10/第十章 智能体通信协议.md" },
      { label: "扩展 08：如何写出好的 Skill", doc: "Learning/hello-agents/Extra-Chapter/Extra08-如何写出好的Skill.md" }
    ]
  },
  {
    id: "stage-6",
    badge: "Stage 6",
    title: "Browser / Computer-Use Agent",
    summary: "学习网页和桌面操作 agent，记录截图、DOM、动作日志，并处理页面变化和失败恢复。",
    tasks: ["用 Playwright 或 browser-use 操作公开网页", "设置安全限制", "保存动作日志"],
    output: "产出：一个公开网页信息提取 agent。",
    reading: [
      { label: "扩展 11：Web Agent 科普与实战", doc: "Learning/hello-agents/Extra-Chapter/Extra11-WebAgent科普与实战.md" },
      { label: "扩展 06：GUI Agent 科普与实战", doc: "Learning/hello-agents/Extra-Chapter/Extra06-GUIAgent科普与实战.md" }
    ]
  },
  {
    id: "stage-7",
    badge: "Stage 7",
    title: "评测、可观测性与安全",
    summary: "用固定测试集、trace、失败分类、成本和延迟指标来迭代 agent。",
    tasks: ["准备 20 个测试任务", "记录成功率和失败原因", "给危险工具加人工确认"],
    output: "产出：agent eval 表格和回归测试。",
    reading: [
      { label: "Hello-Agents 第 12 章 性能评估", doc: "Learning/hello-agents/docs/chapter12/第十二章 智能体性能评估.md" },
      { label: "Harness Engineering 第 11 讲 可观测性", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-11-why-observability-belongs-inside-the-harness/index.md" }
    ]
  },
  {
    id: "stage-8",
    badge: "Stage 8",
    title: "交付真实 Agent",
    summary: "明确用户、任务、成功标准、日志、权限边界、部署方式和 README。",
    tasks: ["设置成本上限和超时", "加入 trace 和错误重试", "选择 CLI/Web/Slack/GitHub Action 部署"],
    output: "产出：别人能 clone 后运行的 agent 项目。",
    reading: [
      { label: "Harness Engineering 第 12 讲 干净交接", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-12-why-every-session-must-leave-a-clean-state/index.md" },
      { label: "驾驭工程书 第 30 章 构建你自己的 Agent", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part7/ch30.md" },
      { label: "OpenChamber 安全与权限边界", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/security.mdx" }
    ]
  }
];

/* ---------------------------------------------------------------------------
 * 课程与仓库卡片
 * local = 站内阅读器可读；pdf = 浏览器直接打开；remote = 仅外链
 * ------------------------------------------------------------------------- */
const courses = [
  /* ---------------- Learning ---------------- */
  {
    title: "Hello-Agents",
    mono: "HA",
    track: "learning",
    kind: "local",
    tag: "主线教材",
    summary: "Datawhale 中文系统教程，覆盖 Agent 概念、经典范式、框架开发、记忆检索、协议、评估和综合案例。",
    focus: "建议作为主线课程：16 章正文 + 12 个扩展章节 + 35 个共创项目，边读边跑 code 目录。",
    links: [
      ["本地 README", "Learning/hello-agents/README.md"],
      ["前言", "Learning/hello-agents/docs/前言.md"],
      ["GitHub", "https://github.com/datawhalechina/hello-agents"]
    ],
    featured: true
  },
  {
    title: "Hello-Agents 正式版 PDF",
    mono: "HA",
    track: "learning",
    kind: "pdf",
    tag: "PDF 教材",
    summary: "Hello-Agents V1.0.0 正式版电子书（2025-11-03），排版完整，适合离线通读。",
    focus: "网页阅读器读章节、PDF 通读全书，两者对照使用。",
    links: [["打开 PDF", "Learning/Book/Hello-Agents-V1.0.0-20251103.pdf"]]
  },
  {
    title: "Easy Agent",
    mono: "EA",
    track: "learning",
    kind: "local",
    tag: "渐进源码",
    summary: "ConardLi 出品，从零复刻 Claude Code 体验的终端 Agent 工程项目，step1–step18 渐进式源码演进。",
    focus: "配合 learn-claude-code 对照学习：step 目录逐步从最小 loop 演进到完整 agent。",
    links: [
      ["本地 README（中文）", "Learning/easy-agent/README.zh-CN.md"],
      ["GitHub", "https://github.com/ConardLi/easy-agent"]
    ]
  },
  {
    title: "claw0",
    mono: "C0",
    track: "learning",
    kind: "local",
    tag: "10 章实战",
    summary: "从 agent loop 走向 OpenClaw-like gateway，覆盖 session、channel、memory、delivery、resilience 和 concurrency。",
    focus: "sessions/zh 下 10 章中文讲义 + 配套 Python，适合 Stage 3 之后进阶，重点学长运行 agent 的系统边界。",
    links: [
      ["本地 README", "Learning/claw0/README.md"],
      ["s01 Agent Loop", "Learning/claw0/sessions/zh/s01_agent_loop.md"],
      ["GitHub", "https://github.com/shareAI-lab/claw0"]
    ],
    featured: true
  },
  {
    title: "Easy AI（easy-learn-ai）",
    mono: "EL",
    track: "learning",
    kind: "local",
    tag: "知识站源码",
    summary: "ConardLi 的 AI 学习知识网站源码：概念图解、提示词拆解、模型速查、教程与日报的完整站点实现。",
    focus: "既是 AI 学习资料入口，也是一个「知识网站怎么做」的工程参考（ai-sites 下 50+ 概念可视化）。",
    links: [
      ["本地 README", "Learning/easy-learn-ai/readme.md"],
      ["GitHub", "https://github.com/ConardLi/easy-learn-ai"]
    ]
  },
  {
    title: "LLM Book",
    mono: "LB",
    track: "learning",
    kind: "pdf",
    tag: "PDF 教材",
    summary: "大语言模型基础教材 PDF，补齐 Agent 之下的模型层知识。",
    focus: "Stage 0-1 的背景阅读：先搞清模型能力边界，再谈 agent 编排。",
    links: [["打开 PDF", "Learning/Book/LLMBook.pdf"]]
  },
  {
    title: "Palantir 本体论",
    mono: "PO",
    track: "learning",
    kind: "pdf",
    tag: "PDF 资料",
    summary: "Palantir Ontology 中文资料，讲企业如何用本体（对象、关系、动作）为业务和 AI 建模。",
    focus: "拓展阅读：理解 agent 在企业数据语义层上行动的另一种范式。",
    links: [["打开 PDF", "Learning/Book/Palantir-Ontology/本体论.pdf"]]
  },

  /* ---------------- AICoding ---------------- */
  {
    title: "learn-claude-code",
    mark: "claude",
    track: "ai-coding",
    kind: "local",
    tag: "20 章实战",
    summary: "从零复刻 Claude Code-like nano agent，s01–s20 共 20 个渐进章节，每章一个可运行的 Python 实现。",
    focus: "从 Agent Loop 到 Permission、Hooks、Memory、Teams、MCP，最后 s20 汇总为完整 agent。边读边跑每章 code.py。",
    links: [
      ["本地 README（中文）", "AICoding/claude/document/learn-claude-code/README-zh.md"],
      ["GitHub", "https://github.com/shareAI-lab/learn-claude-code"]
    ],
    featured: true
  },
  {
    title: "Claude Code 源码逆向分析",
    mark: "claude",
    track: "ai-coding",
    kind: "local",
    tag: "深度拆解",
    summary: "对 Claude Code 的架构、安全、记忆、工具调用、Skills、MCP、沙箱、上下文与提示词管理的逐项分析报告。",
    focus: "Stage 3 的一手材料：20 篇专题分析 + 代码证据索引，配合驾驭工程书交叉验证。",
    links: [
      ["本地 README", "AICoding/claude/code/claude-code-analysis/README.md"],
      ["架构总览", "AICoding/claude/code/claude-code-analysis/analysis/01-architecture-overview.md"]
    ]
  },
  {
    title: "Claude Code 源码合集",
    mark: "claude",
    track: "ai-coding",
    kind: "local",
    tag: "源码归档",
    summary: "多个 Claude Code 源码版本的合集：原始源码、claw-code、nano-claude-code，以及 haha / rev 两个第三方重实现。",
    focus: "想直接读 harness 实现时的入口目录，中文 README 先看结构再选版本；重实现适合和原版对照着看差在哪。",
    links: [
      ["中文 README", "AICoding/claude/code/collection-claude-code-source-code/README-CN.md"],
      ["源码解读（中文）", "AICoding/claude/code/claude-code-source-code/README_CN.md"],
      ["claude-code-haha", "AICoding/claude/code/claude-code-haha/README.md"],
      ["claude-code-rev", "AICoding/claude/code/claude-code-rev/README.md"]
    ]
  },
  {
    title: "Claude Code Lens",
    mark: "claude",
    track: "ai-coding",
    kind: "local",
    tag: "可观测工具",
    summary: "本地 Claude Code 可观测代理：记录每次请求的 system prompt、tool calls、streaming response 和 token usage。",
    focus: "Stage 7 可观测性实战工具：用它观察 Claude Code 的真实请求，理解 harness 的控制面。",
    links: [
      ["本地 README（中文）", "AICoding/claude/code/claude-code-lens/README.zh-CN.md"],
      ["GitHub", "https://github.com/ningzimu/claude-code-lens"]
    ]
  },
  {
    title: "Claude 文档与范例",
    mark: "claude",
    track: "ai-coding",
    kind: "local",
    tag: "参考资料",
    summary: "Claude Code Guide、CLAUDE.md 工程范例、Karpathy Skills 中文版等一手参考资料。",
    focus: "写自己项目的 CLAUDE.md / SKILL.md 之前，先抄这里的结构。",
    links: [
      ["Claude Code Guide", "AICoding/claude/document/claude-code-guide/README.md"],
      ["CLAUDE.md 范例", "AICoding/claude/document/ClaudeMD/App/claude.md"],
      ["Karpathy Skills", "AICoding/claude/document/ClaudeMD/andrej-karpathy-skills/README.zh.md"]
    ]
  },
  {
    title: "Claude 插件生态",
    mark: "claude",
    track: "ai-coding",
    kind: "local",
    tag: "插件 ×5",
    summary: "claude-mem（记忆压缩）、claudian、claude-mermaid、claude-stt、auto-mode-unlock 五个插件源码。",
    focus: "看 hooks / MCP / 上下文注入这些扩展点在真实插件里怎么落地。auto-mode-unlock 的 METHODOLOGY.md 是一份完整的逆向方法论，26 KB，本身就值得单独读。",
    links: [
      ["claude-mem", "AICoding/claude/plugins/claude-mem/README.md"],
      ["claudian", "AICoding/claude/plugins/claudian/README.md"],
      ["claude-mermaid", "AICoding/claude/plugins/claude-mermaid/README.md"],
      ["auto-mode-unlock 方法论", "AICoding/claude/plugins/claude-auto-mode-unlock/METHODOLOGY.md"]
    ]
  },
  {
    title: "awesome-claude-code",
    mark: "claude",
    track: "ai-coding",
    kind: "local",
    tag: "资源索引",
    summary: "Claude Code 生态的精选资源清单：命令、hooks、workflow、CLAUDE.md 范例与社区工具，配 claude-init / templates 两套脚手架。",
    focus: "当作检索表用，不要通读。找某类扩展时回来查；要起新项目时直接抄 templates 的组件结构。",
    links: [
      ["本地 README", "AICoding/claude/code/awesome-claude-code/README.md"],
      ["claude-init", "AICoding/claude/code/claude-init/README.md"],
      ["claude-code-templates", "AICoding/claude/code/claude-code-templates/README.md"]
    ]
  },
  {
    title: "OpenAI Codex",
    mark: "openai",
    track: "ai-coding",
    kind: "local",
    tag: "官方 CLI",
    summary: "OpenAI 开源的 coding agent CLI，支持本地运行、沙箱执行、approval 流程和真实代码库操作。",
    focus: "重点研究 sandbox、approval、CLI 产品形态和代码库编辑的安全边界。",
    links: [
      ["本地 README", "AICoding/codex/codex-code/README.md"],
      ["GitHub", "https://github.com/openai/codex"]
    ]
  },
  {
    title: "OpenClaw",
    mono: "OC",
    track: "ai-coding",
    kind: "local",
    tag: "16 章指南",
    summary: "本地优先的个人 agent，适合研究长运行 agent、skills、消息入口、系统工具和安全边界。",
    focus: "官方指南 16 章 + 附录；目标是理解 always-on agent 与一次性 workflow 的差异。本体源码在 openclaw-code/，VISION.md 讲清了产品取舍。",
    links: [
      ["官方指南", "AICoding/openclaw/doc/openclaw_guide/README.md"],
      ["源码 VISION", "AICoding/openclaw/openclaw-code/VISION.md"],
      ["Lark 通道（中文）", "AICoding/openclaw/channels/openclaw-lark/README.zh.md"],
      ["GitHub", "https://github.com/openclaw/openclaw"]
    ],
    featured: true
  },
  {
    title: "OpenCode 中文实战课",
    mark: "opencode",
    track: "ai-coding",
    kind: "local",
    tag: "中文实战",
    summary: "零基础中文 OpenCode 实战教程，覆盖安装配置、模型连接、日常界面、Agent 工作流和 MCP 高级功能。",
    focus: "适合快速上手 OpenCode 作为 coding agent 工具，重点看 Agent 配置和 MCP 接入。",
    links: [
      ["本地 README", "AICoding/opencode/learn-opencode/README.md"],
      ["课程导览", "AICoding/opencode/learn-opencode/docs/index.md"],
      ["GitHub", "https://github.com/vbgate/learn-opencode"]
    ]
  },
  {
    title: "OpenCode 生态",
    mark: "opencode",
    track: "ai-coding",
    kind: "local",
    tag: "本体 + 生态",
    summary: "OpenCode 本体源码，加上 awesome-opencode 资源索引与 openchamber、openwork、wakatime 插件等周边项目。",
    focus: "先读本体的 AGENTS.md 看它自己怎么约束 agent，再看同一个 harness 之上社区如何长出记忆、多窗口、时间统计等扩展。openchamber 已单独收在 Agentic 轨道，这里只留一个入口。",
    links: [
      ["OpenCode 本体", "AICoding/opencode/code/opencode/README.md"],
      ["awesome-opencode", "AICoding/opencode/awesome-opencode/README.md"],
      ["openchamber", "Agentic/openchamber/README.md"],
      ["openwork（中文）", "AICoding/opencode/code/openwork/README_ZH.md"],
      ["supermemory 工程解读", "AICoding/opencode/code/opencode-supermemory/工程解读报告.md"]
    ]
  },
  {
    title: "Hermes Agent",
    mono: "HM",
    track: "ai-coding",
    kind: "local",
    tag: "自进化",
    summary: "Nous Research 构建的自进化 AI agent，内置学习循环、技能自创建、跨会话记忆和多平台消息网关。",
    focus: "重点学习 learning loop、skill 自进化、记忆机制和长期用户建模。",
    links: [
      ["本地 README", "AICoding/hermes/hermes-agent/README.md"],
      ["记忆机制调研", "AICoding/hermes/docs/Kimi_Agent_Hermes 记忆机制/hermes-memory-deep-dive.md"],
      ["GitHub", "https://github.com/NousResearch/hermes-agent"]
    ]
  },
  {
    title: "CyberClaw",
    mono: "CB",
    track: "ai-coding",
    kind: "local",
    tag: "企业级",
    summary: "企业级透明可控智能体，专注白盒化决策、两段式安全调用、双水位记忆系统和心跳任务编排。",
    focus: "重点学习全行为审计、两段式执行、双水位记忆和透明 agent 架构设计。",
    links: [
      ["本地 README", "AICoding/CyberClaw/README.md"],
      ["Lazy Loading 指南", "AICoding/CyberClaw/docs/LAZY_LOADING_GUIDE.md"],
      ["GitHub", "https://github.com/ttguy0707/CyberClaw"]
    ]
  },
  {
    title: "MiMo-Code",
    mark: "xiaomi",
    track: "ai-coding",
    kind: "local",
    tag: "国产开源",
    summary: "小米开源的终端 AI coding assistant，主打模型与 agent 协同进化、持久记忆和自我改进。",
    focus: "作为国产开源 coding agent harness 的对照样本，重点看记忆系统与 monorepo 工程组织。",
    links: [
      ["本地 README（中文）", "AICoding/MiMo-Code/README.zh.md"],
      ["工程约定 AGENTS.md", "AICoding/MiMo-Code/AGENTS.md"],
      ["GitHub", "https://github.com/XiaomiMiMo/MiMo-Code"]
    ]
  },

  /* ---------------- Agentic ---------------- */
  {
    title: "Learn Harness Engineering",
    mono: "LH",
    track: "agentic",
    kind: "local",
    tag: "12 讲理论",
    summary: "系统化 Harness Engineering 课程：12 讲理论讲义 + 6 个实战项目 + 技能与资料库，参考 OpenAI / Anthropic 官方实践。",
    focus: "建议作为 Stage 3 的理论主线：为什么强模型仍会失败、仓库如何成为事实来源、如何验证与交接。",
    links: [
      ["课程导览", "Agentic/Document/learn-harness-engineering/docs/zh/index.md"],
      ["GitHub", "https://github.com/walkinglabs/learn-harness-engineering"]
    ],
    featured: true
  },
  {
    title: "Harness Books（双册）",
    mono: "HB",
    track: "agentic",
    kind: "local",
    tag: "双册短书",
    summary: "两本短书：Book 1 从源码视角拆 Claude Code 驾驭工程；Book 2 对比 Claude Code 与 Codex 两种控制平面。",
    focus: "Book 1 看 prompt 控制面、循环心跳、上下文压缩；Book 2 看两家 harness 的收敛与分歧。",
    links: [
      ["Book 1 导读", "Agentic/Document/harness-books/book1-claude-code/index.md"],
      ["Book 2 前言", "Agentic/Document/harness-books/book2-comparing/preface.md"]
    ]
  },
  {
    title: "驾驭工程：从 CC 到 AI Coding",
    mono: "HE",
    track: "agentic",
    kind: "local",
    tag: "30+ 章",
    summary: "基于 Claude Code v2.1.88 逆向源码写成的 30+ 章技术书，覆盖架构、提示工程、上下文、缓存、安全与高级子系统。",
    focus: "全书最硬核的 Claude Code 内幕资料。第 3 章 Agent Loop 是全书锚点，建议先读第一篇再按需跳章。",
    links: [
      ["本地前言", "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/preface.md"],
      ["GitHub", "https://github.com/ZhangHanDong/harness-engineering-from-cc-to-ai-coding"]
    ],
    featured: true
  },
  {
    title: "mem0",
    mono: "M0",
    track: "agentic",
    kind: "local",
    tag: "记忆层",
    summary: "生产级 agent 记忆层：抽取、存储、检索三段式记忆管道，支持向量库、图记忆和多平台 SDK。",
    focus: "Stage 2 记忆专题的工业参照：对比自己实现的 memory 与 mem0 的抽取/检索策略。",
    links: [
      ["本地 README", "Agentic/Memory/mem0/README.md"],
      ["架构总览 LLM.md", "Agentic/Memory/mem0/LLM.md"],
      ["GitHub", "https://github.com/mem0ai/mem0"]
    ]
  },
  {
    title: "LangChain 全家桶",
    mark: "langchain",
    track: "agentic",
    kind: "local",
    tag: "框架 ×3",
    summary: "LangChain、LangGraph、DeepAgents 三个仓库：从链式调用到有状态图，再到长任务深度 agent。",
    focus: "重点看 LangGraph 的状态机模型和 DeepAgents 的子 agent / 计划文件设计，而不是抄 chain 模板。",
    links: [
      ["LangChain", "Agentic/Langchain-ai/langchain/README.md"],
      ["LangGraph", "Agentic/Langchain-ai/langgraph/README.md"],
      ["DeepAgents", "Agentic/Langchain-ai/deepagents/README.md"]
    ]
  },
  {
    title: "CrewAI",
    mark: "crewai",
    track: "agentic",
    kind: "local",
    tag: "多 Agent",
    summary: "以「团队 + 角色 + 任务」为模型的多 agent 框架，独立于 LangChain，强调流程编排与工具集成。",
    focus: "了解即可，别当主线。关注它怎么定义角色边界和任务交接，而不是角色扮演本身。",
    links: [
      ["本地 README", "Agentic/crewAI/README.md"],
      ["GitHub", "https://github.com/crewAIInc/crewAI"]
    ]
  },
  {
    title: "MetaGPT",
    mono: "MG",
    track: "agentic",
    kind: "local",
    tag: "多 Agent",
    summary: "把软件公司流程编码成多 agent 协作：需求、设计、编码、测试各由角色承担，含 SOP 与数据解释器。",
    focus: "作为「流程即 prompt」的极端样本研究，重点看 SOP 如何压缩协作不确定性。",
    links: [
      ["本地 README", "Agentic/MetaGPT/README.md"],
      ["GitHub", "https://github.com/FoundationAgents/MetaGPT"]
    ]
  },
  {
    title: "AutoGPT",
    mono: "AG",
    track: "agentic",
    kind: "local",
    tag: "平台化",
    summary: "早期自主 agent 的代表，现已演进为带可视化编排的 AutoGPT Platform（前后端 + block 系统）。",
    focus: "对照 classic 目录看第一代自主 agent 的失败模式，再看平台版怎么用 block 把不确定性收回来。",
    links: [
      ["本地 README", "Agentic/AutoGPT/README.md"],
      ["GitHub", "https://github.com/Significant-Gravitas/AutoGPT"]
    ]
  },
  {
    title: "OpenHands",
    mono: "OH",
    track: "agentic",
    kind: "local",
    tag: "软件工程",
    summary: "面向真实软件工程任务的 agent 平台：读写代码、跑命令、浏览网页、调 API，带完整前端与运行时。",
    focus: "研究 agent 在容器化运行时里的权限、回放与 e2e 测试组织方式。",
    links: [
      ["本地 README", "Agentic/OpenHands/README.md"],
      ["GitHub", "https://github.com/OpenHands/OpenHands"]
    ]
  },
  {
    title: "PI（pi-mono）",
    mono: "PI",
    track: "agentic",
    kind: "local",
    tag: "工具链",
    summary: "PI agent toolkit 的 monorepo：agent 运行时、工具协议与配套包的统一工程组织。",
    focus: "看 AGENTS.md 里的工程约定，是 monorepo 下多包 agent 项目的组织参考。",
    links: [
      ["本地 README", "Agentic/PI/pi-mono/README.md"],
      ["工程约定 AGENTS.md", "Agentic/PI/pi-mono/AGENTS.md"]
    ]
  },
  {
    title: "openworker",
    mono: "OW",
    track: "agentic",
    kind: "local",
    tag: "数字同事",
    summary: "把 agent 做成「数字同事」的项目：personas、connectors、memory、automation、TUI 与 GUI 多入口。",
    focus: "关注 connectors + personas 的分层，是长运行个人 agent 的另一种产品形态。",
    links: [
      ["本地 README", "Agentic/openworker/README.md"]
    ]
  },
  {
    title: "OpenChamber",
    mark: "openchamber",
    track: "agentic",
    kind: "local",
    tag: "中文文档 ×45",
    summary: "围绕 OpenCode 的可视化工作台：桌面 / Web / VS Code / 移动端共用一套会话，管会话目标、Multi-run、改动导读、预览与远程接入。",
    focus: "全站中文文档最全的 agent 产品（45 篇官方译文）。看它怎么把「监督 agent 干活」做成界面：目标怎么判完成、并行五个模型怎么选、大 diff 怎么讲成导读。",
    links: [
      ["中文文档首页", "Agentic/openchamber/packages/docs/content/docs/zh-cn/index.mdx"],
      ["本地 README", "Agentic/openchamber/README.md"],
      ["GitHub", "https://github.com/openchamber/openchamber"]
    ]
  },
  {
    title: "AI Agent Deep Dive",
    mono: "DD",
    track: "agentic",
    kind: "local",
    tag: "17 篇拆解",
    summary: "对现代 coding agent 的逐项拆解：系统提示词与编排、工具权限、Skills/MCP、记忆会话、运行时循环、上下文与任务模型。",
    focus: "篇幅短、密度高，17 篇每篇 1-4 KB。适合在读大部头之前先用它把 harness 的部件名对齐一遍。",
    links: [
      ["本地 README", "Agentic/ai-agent-deep-dive/README.md"],
      ["产品总览", "Agentic/ai-agent-deep-dive/docs/00-product-overview.md"],
      ["打开 PDF（v2）", "Agentic/ai-agent-deep-dive/ai-agent-deep-dive-v2.pdf"]
    ]
  },
  {
    title: "Multica",
    mono: "MC",
    track: "agentic",
    kind: "local",
    tag: "协作平台",
    summary: "人与 AI 并肩工作的多 agent 协作平台：CLI + daemon + Web，带自托管方案和完整的架构交接审计。",
    focus: "看它怎么把「多 agent」做成可部署的产品：CLI/daemon 分层、handoff 架构，以及 19 KB 的 CLAUDE.md 如何驱动自身开发。",
    links: [
      ["本地 README（中文）", "Agentic/multica/README.zh-CN.md"],
      ["设计文档", "Agentic/multica/docs/design.md"],
      ["CLI 与 Daemon", "Agentic/multica/CLI_AND_DAEMON.md"]
    ]
  },
  {
    title: "smolagents",
    mono: "SM",
    track: "agentic",
    kind: "local",
    tag: "中文文档",
    summary: "Hugging Face 的极简 agent 库，主打 code agent——让模型直接写 Python 调工具，而不是拼 JSON。",
    focus: "库本身几千行，适合通读。中文文档齐全：导览 + 4 篇教程 + 3 篇概念指南，其中「写出好 agent」和「安全代码执行」两篇最值得读。",
    links: [
      ["本地 README", "Agentic/smolagents/README.md"],
      ["中文导览", "Agentic/smolagents/docs/source/zh/guided_tour.md"],
      ["GitHub", "https://github.com/huggingface/smolagents"]
    ]
  },
  {
    title: "Open Agent SDK（TypeScript）",
    mono: "OS",
    track: "agentic",
    kind: "local",
    tag: "进程内 SDK",
    summary: "在进程内跑完整 agent loop 的开源 SDK，不需要拉子进程或 CLI，同时支持 Anthropic 与 OpenAI 兼容接口。",
    focus: "Stage 8 部署形态的对照样本：同样一个 loop，做成库和做成 CLI 在边界上差在哪。examples/ 可直接跑。",
    links: [
      ["本地 README", "Agentic/open-agent-sdk-typescript/README.md"],
      ["GitHub", "https://github.com/codeany-ai/open-agent-sdk"]
    ]
  },
  {
    title: "Microsoft AI Agents for Beginners",
    mono: "MS",
    track: "agentic",
    kind: "remote",
    tag: "未下载",
    summary: "系统化入门课程，适合把 agent 概念、工具调用、模式和产品化案例串起来。",
    focus: "适合 Stage 0-2 辅助学习。仓库约 3.7GB 含视频素材，建议只 clone 文档部分。",
    links: [["GitHub", "https://github.com/microsoft/ai-agents-for-beginners"]]
  },

  /* ---------------- Application ---------------- */
  {
    title: "cc-switch",
    mono: "CS",
    track: "application",
    kind: "local",
    tag: "中文手册",
    summary: "Claude Code / Codex 供应商切换器（Tauri 桌面端）：多套 API 配置一键切换，带代理、会话历史统一和 deeplink。",
    focus: "本轨道里文档最全的一个：中文用户手册分 5 部分，另有 6 篇中文路由指南。想做 agent 周边工具，先看它怎么处理配置和鉴权。",
    links: [
      ["本地 README（中文）", "Application/cc-switch/README_ZH.md"],
      ["用户手册（中文）", "Application/cc-switch/docs/user-manual/zh/README.md"],
      ["GitHub", "https://github.com/farion1231/cc-switch"]
    ],
    featured: true
  },
  {
    title: "CodexSwitch",
    mono: "CX",
    track: "application",
    kind: "local",
    tag: "Tauri 桌面",
    summary: "管理多个本地 Codex / OpenAI OAuth 账号的 Tauri 2 桌面应用，含 38 KB 的完整 SPEC 和接口清单。",
    focus: "SPEC.md 是一份写得很细的需求规格样本——想让 agent 照着规格干活，这就是规格该长的样子。",
    links: [
      ["本地 README", "Application/CodexSwitch/README.md"],
      ["设计文档", "Application/CodexSwitch/DESIGN.md"],
      ["完整 SPEC", "Application/CodexSwitch/SPEC.md"]
    ]
  },
  {
    title: "WorkAny",
    mono: "WA",
    track: "application",
    kind: "local",
    tag: "桌面 Agent",
    summary: "用自然语言驱动的桌面 AI agent 应用：实时代码生成、工具执行和工作区管理，前端 + src-api + Tauri 三层。",
    focus: "看 agent 做成消费级桌面产品时，工作区隔离和任务可视化是怎么呈现给普通用户的。",
    links: [
      ["本地 README", "Application/workany/README.md"],
      ["官网", "https://workany.ai"]
    ]
  },
  {
    title: "Solon-AI",
    mono: "SA",
    track: "application",
    kind: "local",
    tag: "Java 框架",
    summary: "Java 全场景 AI（智能体）应用开发框架：core、MCP、A2A、ANP、Flow、RAG 载入与存储，模块化拆分。",
    focus: "本仓库唯一的 JVM 侧样本。重点看它怎么把 MCP / A2A / ANP 三种协议做成并列模块，而不是绑死一种。",
    links: [
      ["本地 README", "Application/solon-ai/README.md"],
      ["A2A 模块", "Application/solon-ai/solon-ai-a2a/README.md"],
      ["Flow 模块", "Application/solon-ai/solon-ai-flow/README.md"],
      ["Gitee", "https://gitee.com/noear/solon-ai"]
    ]
  }
];

/* ---------------------------------------------------------------------------
 * 项目阶梯
 * ------------------------------------------------------------------------- */
const projects = [
  ["Level 1", "Calculator Agent", "最小 tool call loop"],
  ["Level 2", "Web Research Agent", "搜索、筛选、引用、总结"],
  ["Level 3", "PDF QA Agent", "RAG、chunk、retrieval、citation"],
  ["Level 4", "Coding Review Agent", "读取 diff、风险排序、测试建议"],
  ["Level 5", "Browser Agent", "页面观察、点击、提取、失败恢复"],
  ["Level 6", "Claude Code-like Nano Agent", "shell、文件编辑、权限、session、compact"],
  ["Level 7", "OpenClaw-like Gateway", "channel、routing、session、memory、heartbeat、delivery"],
  ["Level 8", "Reusable Skill Pack", "SKILL.md、脚本、模板、触发条件、smoke test"],
  ["Level 9", "Multi-Agent Writer", "planner、writer、reviewer 协作"],
  ["Level 10", "Personal Agent", "记忆、skills、消息入口和长运行任务"],
  ["Level 11", "Production Harness", "evals、trace、权限、CI、runner、回放"]
];

/* ---------------------------------------------------------------------------
 * 核心内容速记
 * ------------------------------------------------------------------------- */
const resources = [
  {
    title: "Agent Loop",
    body: "Agent 的基础循环是 observe → think → act → observe。真正的工程难点在工具执行、状态更新、错误恢复和停止条件。"
  },
  {
    title: "Harness Engineering",
    body: "模型只是其中一部分。harness 决定工具协议、权限、安全沙箱、上下文压缩、日志、trace、回放和 CI。"
  },
  {
    title: "RAG & Memory",
    body: "RAG 解决知识接入，memory 解决跨轮状态。要区分短期上下文、会话记忆和长期记忆，并给答案保留证据。"
  },
  {
    title: "Skills",
    body: "Skill 不是一次 prompt，而是可发现、可版本化、可分发的流程知识包，通常包含说明、脚本、模板和验收标准。"
  },
  {
    title: "Multi-Agent",
    body: "多 agent 的核心是协调：职责边界、输入输出 schema、停止条件和冲突处理，比角色命名更重要。"
  },
  {
    title: "Evaluation",
    body: "没有 eval 的 agent 只是 demo。准备固定测试集，记录成功率、失败原因、工具调用次数、成本、延迟和 trace。"
  }
];

/* ---------------------------------------------------------------------------
 * 阅读器菜单
 * ------------------------------------------------------------------------- */
const menuData = [
  {
    title: "项目导览",
    track: "learning",
    items: [
      { label: "Agent Learning Hub README", doc: "@root/README.md" },
      { label: "本地课程总览", doc: "README.md" }
    ]
  },

  /* ---------------- Learning ---------------- */
  {
    title: "Hello-Agents · 前言与基础",
    track: "learning",
    items: [
      { label: "总览 README", doc: "Learning/hello-agents/README.md" },
      { label: "前言", doc: "Learning/hello-agents/docs/前言.md" },
      { label: "第 1 章：初识智能体", doc: "Learning/hello-agents/docs/chapter1/第一章 初识智能体.md" },
      { label: "第 2 章：智能体发展史", doc: "Learning/hello-agents/docs/chapter2/第二章 智能体发展史.md" },
      { label: "第 3 章：大语言模型基础", doc: "Learning/hello-agents/docs/chapter3/第三章 大语言模型基础.md" }
    ]
  },
  {
    title: "Hello-Agents · 构建",
    track: "learning",
    items: [
      { label: "第 4 章：智能体经典范式构建", doc: "Learning/hello-agents/docs/chapter4/第四章 智能体经典范式构建.md" },
      { label: "第 5 章：低代码平台搭建", doc: "Learning/hello-agents/docs/chapter5/第五章 基于低代码平台的智能体搭建.md" },
      { label: "第 6 章：框架开发实践", doc: "Learning/hello-agents/docs/chapter6/第六章 框架开发实践.md" },
      { label: "第 7 章：构建你的 Agent 框架", doc: "Learning/hello-agents/docs/chapter7/第七章 构建你的Agent框架.md" }
    ]
  },
  {
    title: "Hello-Agents · 高级",
    track: "learning",
    items: [
      { label: "第 8 章：记忆与检索", doc: "Learning/hello-agents/docs/chapter8/第八章 记忆与检索.md" },
      { label: "第 9 章：上下文工程", doc: "Learning/hello-agents/docs/chapter9/第九章 上下文工程.md" },
      { label: "第 10 章：智能体通信协议", doc: "Learning/hello-agents/docs/chapter10/第十章 智能体通信协议.md" },
      { label: "第 11 章：Agentic-RL", doc: "Learning/hello-agents/docs/chapter11/第十一章 Agentic-RL.md" },
      { label: "第 12 章：智能体性能评估", doc: "Learning/hello-agents/docs/chapter12/第十二章 智能体性能评估.md" }
    ]
  },
  {
    title: "Hello-Agents · 实战与展望",
    track: "learning",
    items: [
      { label: "第 13 章：智能旅行助手", doc: "Learning/hello-agents/docs/chapter13/第十三章 智能旅行助手.md" },
      { label: "第 14 章：自动化深度研究智能体", doc: "Learning/hello-agents/docs/chapter14/第十四章 自动化深度研究智能体.md" },
      { label: "第 15 章：构建赛博小镇", doc: "Learning/hello-agents/docs/chapter15/第十五章 构建赛博小镇.md" },
      { label: "第 16 章：毕业设计", doc: "Learning/hello-agents/docs/chapter16/第十六章 毕业设计.md" }
    ]
  },
  {
    title: "Hello-Agents · 扩展章节",
    track: "learning",
    items: [
      { label: "扩展 01：面试问题总结", doc: "Learning/hello-agents/Extra-Chapter/Extra01-面试问题总结.md" },
      { label: "扩展 02：上下文工程补充", doc: "Learning/hello-agents/Extra-Chapter/Extra02-上下文工程补充知识.md" },
      { label: "扩展 03：Dify 智能体创建", doc: "Learning/hello-agents/Extra-Chapter/Extra03-Dify智能体创建保姆级操作流程.md" },
      { label: "扩展 04：Datawhale FAQ", doc: "Learning/hello-agents/Extra-Chapter/Extra04-DatawhaleFAQ.md" },
      { label: "扩展 05：Agent Skills 解读", doc: "Learning/hello-agents/Extra-Chapter/Extra05-AgentSkills解读.md" },
      { label: "扩展 06：GUI Agent 科普与实战", doc: "Learning/hello-agents/Extra-Chapter/Extra06-GUIAgent科普与实战.md" },
      { label: "扩展 07：环境配置", doc: "Learning/hello-agents/Extra-Chapter/Extra07-环境配置.md" },
      { label: "扩展 08：如何写出好的 Skill", doc: "Learning/hello-agents/Extra-Chapter/Extra08-如何写出好的Skill.md" },
      { label: "扩展 09：开发踩坑与经验", doc: "Learning/hello-agents/Extra-Chapter/Extra09-Agent应用开发实践踩坑与经验分享.md" },
      { label: "扩展 10：Agent 自进化", doc: "Learning/hello-agents/Extra-Chapter/Extra10-Agent自进化.md" },
      { label: "扩展 11：Web Agent 科普与实战", doc: "Learning/hello-agents/Extra-Chapter/Extra11-WebAgent科普与实战.md" },
      { label: "扩展 12：旅行助手后训练", doc: "Learning/hello-agents/Extra-Chapter/Extra12-旅行助手后训练实战.md" },
      { label: "附加：N8N 安装指南", doc: "Learning/hello-agents/Additional-Chapter/N8N_INSTALL_GUIDE.md" },
      { label: "附加：Node.js 安装指南", doc: "Learning/hello-agents/Additional-Chapter/NODEJS_INSTALL_GUIDE.md" }
    ]
  },
  {
    title: "claw0 · 10 章中文讲义",
    track: "learning",
    items: [
      { label: "总览 README", doc: "Learning/claw0/README.md" },
      { label: "s01：Agent Loop", doc: "Learning/claw0/sessions/zh/s01_agent_loop.md" },
      { label: "s02：Tool Use", doc: "Learning/claw0/sessions/zh/s02_tool_use.md" },
      { label: "s03：Sessions", doc: "Learning/claw0/sessions/zh/s03_sessions.md" },
      { label: "s04：Channels", doc: "Learning/claw0/sessions/zh/s04_channels.md" },
      { label: "s05：Gateway Routing", doc: "Learning/claw0/sessions/zh/s05_gateway_routing.md" },
      { label: "s06：Intelligence", doc: "Learning/claw0/sessions/zh/s06_intelligence.md" },
      { label: "s07：Heartbeat & Cron", doc: "Learning/claw0/sessions/zh/s07_heartbeat_cron.md" },
      { label: "s08：Delivery", doc: "Learning/claw0/sessions/zh/s08_delivery.md" },
      { label: "s09：Resilience", doc: "Learning/claw0/sessions/zh/s09_resilience.md" },
      { label: "s10：Concurrency", doc: "Learning/claw0/sessions/zh/s10_concurrency.md" }
    ]
  },
  {
    title: "claw0 · workspace 约定",
    track: "learning",
    items: [
      { label: "AGENTS.md", doc: "Learning/claw0/workspace/AGENTS.md" },
      { label: "BOOTSTRAP.md", doc: "Learning/claw0/workspace/BOOTSTRAP.md" },
      { label: "HEARTBEAT.md", doc: "Learning/claw0/workspace/HEARTBEAT.md" },
      { label: "IDENTITY.md", doc: "Learning/claw0/workspace/IDENTITY.md" },
      { label: "MEMORY.md", doc: "Learning/claw0/workspace/MEMORY.md" },
      { label: "SOUL.md", doc: "Learning/claw0/workspace/SOUL.md" },
      { label: "TOOLS.md", doc: "Learning/claw0/workspace/TOOLS.md" },
      { label: "USER.md", doc: "Learning/claw0/workspace/USER.md" }
    ]
  },
  {
    title: "Easy Agent / Easy AI",
    track: "learning",
    items: [
      { label: "Easy Agent README（中文）", doc: "Learning/easy-agent/README.zh-CN.md" },
      { label: "Easy AI README", doc: "Learning/easy-learn-ai/readme.md" }
    ]
  },

  /* ---------------- AICoding ---------------- */
  {
    title: "learn-claude-code · 20 章",
    track: "ai-coding",
    items: [
      { label: "总览 README（中文）", doc: "AICoding/claude/document/learn-claude-code/README-zh.md" },
      { label: "s01：Agent Loop — 一个循环就够了", doc: "AICoding/claude/document/learn-claude-code/s01_agent_loop/README.md" },
      { label: "s02：Tool Use — 多加一个工具只加一行", doc: "AICoding/claude/document/learn-claude-code/s02_tool_use/README.md" },
      { label: "s03：Permission — 执行前做权限判断", doc: "AICoding/claude/document/learn-claude-code/s03_permission/README.md" },
      { label: "s04：Hooks — 挂在循环上", doc: "AICoding/claude/document/learn-claude-code/s04_hooks/README.md" },
      { label: "s05：TodoWrite — 有计划才不跑偏", doc: "AICoding/claude/document/learn-claude-code/s05_todo_write/README.md" },
      { label: "s06：Subagent — 干净上下文拆任务", doc: "AICoding/claude/document/learn-claude-code/s06_subagent/README.md" },
      { label: "s07：Skill Loading — 用到才加载", doc: "AICoding/claude/document/learn-claude-code/s07_skill_loading/README.md" },
      { label: "s08：Context Compact — 给上下文腾地方", doc: "AICoding/claude/document/learn-claude-code/s08_context_compact/README.md" },
      { label: "s09：Memory — 一层不丢的记忆", doc: "AICoding/claude/document/learn-claude-code/s09_memory/README.md" },
      { label: "s10：System Prompt — 运行时组装", doc: "AICoding/claude/document/learn-claude-code/s10_system_prompt/README.md" },
      { label: "s11：Error Recovery — 错误是重试的开始", doc: "AICoding/claude/document/learn-claude-code/s11_error_recovery/README.md" },
      { label: "s12：Task System — 目标拆成小任务", doc: "AICoding/claude/document/learn-claude-code/s12_task_system/README.md" },
      { label: "s13：Background Tasks — 慢操作放后台", doc: "AICoding/claude/document/learn-claude-code/s13_background_tasks/README.md" },
      { label: "s14：Cron Scheduler — 按时间表生产工作", doc: "AICoding/claude/document/learn-claude-code/s14_cron_scheduler/README.md" },
      { label: "s15：Agent Teams — 一个搞不定就组队", doc: "AICoding/claude/document/learn-claude-code/s15_agent_teams/README.md" },
      { label: "s16：Team Protocols — 队友间要有约定", doc: "AICoding/claude/document/learn-claude-code/s16_team_protocols/README.md" },
      { label: "s17：Autonomous Agents — 自己看板自己认领", doc: "AICoding/claude/document/learn-claude-code/s17_autonomous_agents/README.md" },
      { label: "s18：Worktree Isolation — 各干各的", doc: "AICoding/claude/document/learn-claude-code/s18_worktree_isolation/README.md" },
      { label: "s19：MCP Tools — 外接工具标准协议", doc: "AICoding/claude/document/learn-claude-code/s19_mcp_plugin/README.md" },
      { label: "s20：Comprehensive — 全部机制归到一个循环", doc: "AICoding/claude/document/learn-claude-code/s20_comprehensive/README.md" }
    ]
  },
  {
    title: "Claude Code 源码逆向分析",
    track: "ai-coding",
    items: [
      { label: "分析总览 README", doc: "AICoding/claude/code/claude-code-analysis/README.md" },
      { label: "01 架构总览", doc: "AICoding/claude/code/claude-code-analysis/analysis/01-architecture-overview.md" },
      { label: "02 安全分析", doc: "AICoding/claude/code/claude-code-analysis/analysis/02-security-analysis.md" },
      { label: "04 Agent 记忆", doc: "AICoding/claude/code/claude-code-analysis/analysis/04-agent-memory.md" },
      { label: "04b 工具调用实现", doc: "AICoding/claude/code/claude-code-analysis/analysis/04b-tool-call-implementation.md" },
      { label: "04c Skills 实现", doc: "AICoding/claude/code/claude-code-analysis/analysis/04c-skills-implementation.md" },
      { label: "04d MCP 实现", doc: "AICoding/claude/code/claude-code-analysis/analysis/04d-mcp-implementation.md" },
      { label: "04e 沙箱实现", doc: "AICoding/claude/code/claude-code-analysis/analysis/04e-sandbox-implementation.md" },
      { label: "04f 上下文管理", doc: "AICoding/claude/code/claude-code-analysis/analysis/04f-context-management.md" },
      { label: "04g 提示词管理", doc: "AICoding/claude/code/claude-code-analysis/analysis/04g-prompt-management.md" },
      { label: "04h 多 Agent", doc: "AICoding/claude/code/claude-code-analysis/analysis/04h-multi-agent.md" },
      { label: "04i 会话存储与恢复", doc: "AICoding/claude/code/claude-code-analysis/analysis/04i-session-storage-resume.md" },
      { label: "07 代码证据索引", doc: "AICoding/claude/code/claude-code-analysis/analysis/07-code-evidence-index.md" }
    ]
  },
  {
    title: "Claude 文档 · 插件 · 资源",
    track: "ai-coding",
    items: [
      { label: "Claude Code Guide", doc: "AICoding/claude/document/claude-code-guide/README.md" },
      { label: "CLAUDE.md 范例：App", doc: "AICoding/claude/document/ClaudeMD/App/claude.md" },
      { label: "CLAUDE.md 范例：Constitution", doc: "AICoding/claude/document/ClaudeMD/App/constitution.md" },
      { label: "Karpathy Skills（中文）", doc: "AICoding/claude/document/ClaudeMD/andrej-karpathy-skills/README.zh.md" },
      { label: "claude-mem 记忆压缩", doc: "AICoding/claude/plugins/claude-mem/README.md" },
      { label: "claude-mem · Cursor Hooks", doc: "AICoding/claude/plugins/claude-mem/cursor-hooks/README.md" },
      { label: "claude-mem · 上下文注入", doc: "AICoding/claude/plugins/claude-mem/cursor-hooks/CONTEXT-INJECTION.md" },
      { label: "claudian", doc: "AICoding/claude/plugins/claudian/README.md" },
      { label: "claude-mermaid", doc: "AICoding/claude/plugins/claude-mermaid/README.md" },
      { label: "claude-stt", doc: "AICoding/claude/plugins/claude-stt/README.md" },
      { label: "auto-mode-unlock", doc: "AICoding/claude/plugins/claude-auto-mode-unlock/README.md" },
      { label: "auto-mode-unlock · 逆向方法论", doc: "AICoding/claude/plugins/claude-auto-mode-unlock/METHODOLOGY.md" },
      { label: "Claude Code Lens（中文）", doc: "AICoding/claude/code/claude-code-lens/README.zh-CN.md" },
      { label: "源码合集（中文）", doc: "AICoding/claude/code/collection-claude-code-source-code/README-CN.md" },
      { label: "源码解读（中文）", doc: "AICoding/claude/code/claude-code-source-code/README_CN.md" },
      { label: "claude-code-haha（重实现）", doc: "AICoding/claude/code/claude-code-haha/README.md" },
      { label: "claude-code-rev（逆向实验）", doc: "AICoding/claude/code/claude-code-rev/README.md" },
      { label: "claude-code-rev AGENTS.md", doc: "AICoding/claude/code/claude-code-rev/AGENTS.md" },
      { label: "awesome-claude-code", doc: "AICoding/claude/code/awesome-claude-code/README.md" },
      { label: "claude-init", doc: "AICoding/claude/code/claude-init/README.md" },
      { label: "claude-code-templates", doc: "AICoding/claude/code/claude-code-templates/README.md" },
      { label: "claude-code-templates · CLAUDE.md", doc: "AICoding/claude/code/claude-code-templates/CLAUDE.md" }
    ]
  },
  {
    title: "OpenClaw · 16 章指南",
    track: "ai-coding",
    items: [
      { label: "总览 README", doc: "AICoding/openclaw/doc/openclaw_guide/README.md" },
      { label: "01 概述", doc: "AICoding/openclaw/doc/openclaw_guide/01_overview/README.md" },
      { label: "02 安装与配置", doc: "AICoding/openclaw/doc/openclaw_guide/02_setup/README.md" },
      { label: "03 最小循环", doc: "AICoding/openclaw/doc/openclaw_guide/03_minimal_loop/README.md" },
      { label: "04 模型配置", doc: "AICoding/openclaw/doc/openclaw_guide/04_config_models/README.md" },
      { label: "05 工具与技能", doc: "AICoding/openclaw/doc/openclaw_guide/05_tools_skills/README.md" },
      { label: "06 上下文与记忆", doc: "AICoding/openclaw/doc/openclaw_guide/06_context_memory/README.md" },
      { label: "07 多 Agent", doc: "AICoding/openclaw/doc/openclaw_guide/07_multi_agent/README.md" },
      { label: "08 自动化运维", doc: "AICoding/openclaw/doc/openclaw_guide/08_automation_ops/README.md" },
      { label: "09 网关协议", doc: "AICoding/openclaw/doc/openclaw_guide/09_gateway_protocol/README.md" },
      { label: "10 Agent 循环", doc: "AICoding/openclaw/doc/openclaw_guide/10_agent_loop/README.md" },
      { label: "11 可靠性与安全", doc: "AICoding/openclaw/doc/openclaw_guide/11_reliability_security/README.md" },
      { label: "12 扩展工程", doc: "AICoding/openclaw/doc/openclaw_guide/12_extension_engineering/README.md" },
      { label: "13 实战案例", doc: "AICoding/openclaw/doc/openclaw_guide/13_practical_cases/README.md" },
      { label: "14 性能与成本", doc: "AICoding/openclaw/doc/openclaw_guide/14_performance_cost/README.md" },
      { label: "15 故障排查", doc: "AICoding/openclaw/doc/openclaw_guide/15_troubleshooting_trees/README.md" },
      { label: "16 Claude 生态", doc: "AICoding/openclaw/doc/openclaw_guide/16_claude_ecosystem/README.md" },
      { label: "附录", doc: "AICoding/openclaw/doc/openclaw_guide/appendix/README.md" },
      { label: "Lark 通道（中文）", doc: "AICoding/openclaw/channels/openclaw-lark/README.zh.md" },
      { label: "源码 · VISION", doc: "AICoding/openclaw/openclaw-code/VISION.md" },
      { label: "源码 · AGENTS.md", doc: "AICoding/openclaw/openclaw-code/AGENTS.md" },
      { label: "源码 · ACP 协议", doc: "AICoding/openclaw/openclaw-code/docs.acp.md" },
      { label: "源码 · 安全模型", doc: "AICoding/openclaw/openclaw-code/SECURITY.md" }
    ]
  },
  {
    title: "OpenCode 中文实战课",
    track: "ai-coding",
    items: [
      { label: "总览 README", doc: "AICoding/opencode/learn-opencode/README.md" },
      { label: "课程导览", doc: "AICoding/opencode/learn-opencode/docs/index.md" },
      { label: "01 介绍", doc: "AICoding/opencode/learn-opencode/docs/1-start/01-intro.md" },
      { label: "02 安装", doc: "AICoding/opencode/learn-opencode/docs/1-start/02-install.md" },
      { label: "04 连接模型", doc: "AICoding/opencode/learn-opencode/docs/1-start/04-connect.md" },
      { label: "日常界面", doc: "AICoding/opencode/learn-opencode/docs/2-daily/01-interface.md" },
      { label: "Agent 工作流", doc: "AICoding/opencode/learn-opencode/docs/3-workflow/02-agents.md" },
      { label: "编码场景", doc: "AICoding/opencode/learn-opencode/docs/4-scenarios/coder-daily.md" },
      { label: "Agent 快速开始", doc: "AICoding/opencode/learn-opencode/docs/5-advanced/02a-agent-quickstart.md" },
      { label: "MCP 基础", doc: "AICoding/opencode/learn-opencode/docs/5-advanced/07a-mcp-basics.md" },
      { label: "FAQ", doc: "AICoding/opencode/learn-opencode/docs/appendix/faq.md" },
      { label: "OpenCode 本体 README", doc: "AICoding/opencode/code/opencode/README.md" },
      { label: "OpenCode 本体 AGENTS.md", doc: "AICoding/opencode/code/opencode/AGENTS.md" },
      { label: "awesome-opencode 索引", doc: "AICoding/opencode/awesome-opencode/README.md" },
      { label: "openchamber（见 Agentic 轨道）", doc: "Agentic/openchamber/README.md" },
      { label: "openwork（中文）", doc: "AICoding/opencode/code/openwork/README_ZH.md" },
      { label: "opencode-supermemory", doc: "AICoding/opencode/code/opencode-supermemory/README.md" },
      { label: "supermemory 工程解读报告", doc: "AICoding/opencode/code/opencode-supermemory/工程解读报告.md" },
      { label: "opencode-wakatime 插件", doc: "AICoding/opencode/plugins/opencode-wakatime/README.md" }
    ]
  },
  {
    title: "Codex · Hermes · CyberClaw · MiMo",
    track: "ai-coding",
    items: [
      { label: "OpenAI Codex README", doc: "AICoding/codex/codex-code/README.md" },
      { label: "Hermes Agent README", doc: "AICoding/hermes/hermes-agent/README.md" },
      { label: "Hermes 记忆机制深度调研", doc: "AICoding/hermes/docs/Kimi_Agent_Hermes 记忆机制/hermes-memory-deep-dive.md" },
      { label: "Hermes Learning Loop 调研", doc: "AICoding/hermes/docs/Kimi_Agent_Hermes 记忆机制/Hermes_LearningLoop_深度调研报告.md" },
      { label: "CyberClaw README", doc: "AICoding/CyberClaw/README.md" },
      { label: "CyberClaw · Lazy Loading 指南", doc: "AICoding/CyberClaw/docs/LAZY_LOADING_GUIDE.md" },
      { label: "CyberClaw · 快速开始", doc: "AICoding/CyberClaw/docs/LAZY_LOADING_QUICKSTART.md" },
      { label: "CyberClaw · 总结", doc: "AICoding/CyberClaw/docs/LAZY_LOADING_SUMMARY.md" },
      { label: "MiMo-Code README（中文）", doc: "AICoding/MiMo-Code/README.zh.md" },
      { label: "MiMo-Code AGENTS.md", doc: "AICoding/MiMo-Code/AGENTS.md" }
    ]
  },

  /* ---------------- Agentic ---------------- */
  {
    title: "Learn Harness Engineering · 12 讲",
    track: "agentic",
    items: [
      { label: "课程导览", doc: "Agentic/Document/learn-harness-engineering/docs/zh/index.md" },
      { label: "第 1 讲：模型能力强 ≠ 执行可靠", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-01-why-capable-agents-still-fail/index.md" },
      { label: "第 2 讲：Harness 到底是什么", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-02-what-a-harness-actually-is/index.md" },
      { label: "第 3 讲：仓库成为唯一事实来源", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-03-why-the-repository-must-become-the-system-of-record/index.md" },
      { label: "第 4 讲：把指令拆分到不同文件", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-04-why-one-giant-instruction-file-fails/index.md" },
      { label: "第 5 讲：跨会话任务的上下文连续", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-05-why-long-running-tasks-lose-continuity/index.md" },
      { label: "第 6 讲：工作前先初始化", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-06-why-initialization-needs-its-own-phase/index.md" },
      { label: "第 7 讲：划清每次任务的边界", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-07-why-agents-overreach-and-under-finish/index.md" },
      { label: "第 8 讲：用功能清单约束 agent", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-08-why-feature-lists-are-harness-primitives/index.md" },
      { label: "第 9 讲：防止提前宣告完成", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-09-why-agents-declare-victory-too-early/index.md" },
      { label: "第 10 讲：跑通完整流程才算验证", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-10-why-end-to-end-testing-changes-results/index.md" },
      { label: "第 11 讲：运行过程可观测", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-11-why-observability-belongs-inside-the-harness/index.md" },
      { label: "第 12 讲：会话结束前做好交接", doc: "Agentic/Document/learn-harness-engineering/docs/zh/lectures/lecture-12-why-every-session-must-leave-a-clean-state/index.md" },
      { label: "实战项目导览", doc: "Agentic/Document/learn-harness-engineering/docs/zh/projects/index.md" },
      { label: "技能库导览", doc: "Agentic/Document/learn-harness-engineering/docs/zh/skills/index.md" },
      { label: "资料库导览", doc: "Agentic/Document/learn-harness-engineering/docs/zh/resources/index.md" }
    ]
  },
  {
    title: "Harness Books · Book 1：Claude Code 驾驭工程",
    track: "agentic",
    items: [
      { label: "导读", doc: "Agentic/Document/harness-books/book1-claude-code/index.md" },
      { label: "前言", doc: "Agentic/Document/harness-books/book1-claude-code/preface.md" },
      { label: "第 1 章：为什么是驾驭工程", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-01-why-harness-engineering.md" },
      { label: "第 2 章：Prompt 是控制平面", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-02-prompt-is-control-plane.md" },
      { label: "第 3 章：查询循环与心跳", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-03-query-loop-heartbeat.md" },
      { label: "第 4 章：工具、权限与中断", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-04-tools-permissions-interrupts.md" },
      { label: "第 5 章：上下文、记忆与压缩", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-05-context-memory-compact.md" },
      { label: "第 6 章：错误与恢复", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-06-errors-and-recovery.md" },
      { label: "第 7 章：多 Agent 与验证", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-07-multi-agent-and-verification.md" },
      { label: "第 8 章：团队落地实践", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-08-team-landing-practices.md" },
      { label: "第 9 章：十条原则", doc: "Agentic/Document/harness-books/book1-claude-code/chapter-09-ten-principles.md" },
      { label: "附录 A：检查清单", doc: "Agentic/Document/harness-books/book1-claude-code/appendix-a-checklists.md" },
      { label: "附录 C：源码地图", doc: "Agentic/Document/harness-books/book1-claude-code/appendix-c-source-map.md" }
    ]
  },
  {
    title: "Harness Books · Book 2：CC vs Codex",
    track: "agentic",
    items: [
      { label: "前言", doc: "Agentic/Document/harness-books/book2-comparing/preface.md" },
      { label: "第 0 章：阅读地图", doc: "Agentic/Document/harness-books/book2-comparing/chapter-00-reading-map.md" },
      { label: "第 1 章：为什么做这个对比", doc: "Agentic/Document/harness-books/book2-comparing/chapter-01-why-this-comparison.md" },
      { label: "第 2 章：两个控制平面", doc: "Agentic/Document/harness-books/book2-comparing/chapter-02-two-control-planes.md" },
      { label: "第 3 章：Loop、Thread 与 Rollout", doc: "Agentic/Document/harness-books/book2-comparing/chapter-03-loop-thread-and-rollout.md" },
      { label: "第 4 章：工具、沙箱与执行策略", doc: "Agentic/Document/harness-books/book2-comparing/chapter-04-tools-sandbox-and-exec-policy.md" },
      { label: "第 5 章：Skills、Hooks 与本地治理", doc: "Agentic/Document/harness-books/book2-comparing/chapter-05-skills-hooks-and-local-governance.md" },
      { label: "第 6 章：委派、验证与状态", doc: "Agentic/Document/harness-books/book2-comparing/chapter-06-delegation-verification-and-state.md" },
      { label: "第 7 章：收敛与分歧", doc: "Agentic/Document/harness-books/book2-comparing/chapter-07-convergence-and-divergence.md" },
      { label: "第 8 章：如何选择或自建", doc: "Agentic/Document/harness-books/book2-comparing/chapter-08-how-to-choose-or-build.md" },
      { label: "附录 B：检查清单", doc: "Agentic/Document/harness-books/book2-comparing/appendix-b-checklists.md" }
    ]
  },
  {
    title: "驾驭工程书 · 架构与提示工程",
    track: "agentic",
    items: [
      { label: "前言", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/preface.md" },
      { label: "第 1 章：AI 编码 Agent 的完整技术栈", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part1/ch01.md" },
      { label: "第 2 章：工具系统 — 40+ 工具", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part1/ch02.md" },
      { label: "第 3 章：Agent Loop 完整生命周期", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part1/ch03.md" },
      { label: "第 4 章：工具执行编排", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part1/ch04.md" },
      { label: "第 4b 章：计划模式", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part1/ch04b.md" },
      { label: "第 5 章：系统提示词架构", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part2/ch05.md" },
      { label: "第 6 章：通过提示词引导行为", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part2/ch06.md" },
      { label: "第 6b 章：API 通信层", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part2/ch06b.md" },
      { label: "第 7 章：模型特定调优与 A/B 测试", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part2/ch07.md" },
      { label: "第 8 章：工具提示词作为微型驾驭器", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part2/ch08.md" }
    ]
  },
  {
    title: "驾驭工程书 · 上下文、缓存与安全",
    track: "agentic",
    items: [
      { label: "第 9 章：自动压缩", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part3/ch09.md" },
      { label: "第 10 章：压缩后的文件状态保留", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part3/ch10.md" },
      { label: "第 11 章：微压缩", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part3/ch11.md" },
      { label: "第 12 章：Token 预算策略", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part3/ch12.md" },
      { label: "第 13 章：缓存架构与断点设计", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part4/ch13.md" },
      { label: "第 14 章：缓存中断检测系统", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part4/ch14.md" },
      { label: "第 15 章：缓存优化模式", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part4/ch15.md" },
      { label: "第 16 章：权限系统", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part5/ch16.md" },
      { label: "第 17 章：YOLO 分类器", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part5/ch17.md" },
      { label: "第 17b 章：提示注入防御", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part5/ch17b.md" },
      { label: "第 18 章：Hooks 拦截点", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part5/ch18.md" },
      { label: "第 18b 章：沙箱系统", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part5/ch18b.md" },
      { label: "第 19 章：CLAUDE.md 作为覆盖层", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part5/ch19.md" }
    ]
  },
  {
    title: "驾驭工程书 · 高级子系统与经验",
    track: "agentic",
    items: [
      { label: "第 20 章：Agent 派生与编排", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch20.md" },
      { label: "第 20b 章：Teams 与多进程协作", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch20b.md" },
      { label: "第 20c 章：Ultraplan 远程多代理规划", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch20c.md" },
      { label: "第 21 章：Effort、Fast Mode 与 Thinking", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch21.md" },
      { label: "第 22 章：技能系统", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch22.md" },
      { label: "第 22b 章：插件系统", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch22b.md" },
      { label: "第 23 章：未发布功能管线", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch23.md" },
      { label: "第 24 章：跨会话记忆", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part6/ch24.md" },
      { label: "第 25 章：驾驭工程原则", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part7/ch25.md" },
      { label: "第 26 章：上下文管理作为核心能力", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part7/ch26.md" },
      { label: "第 27 章：生产级 AI 编码模式", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part7/ch27.md" },
      { label: "第 28 章：Claude Code 的不足之处", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part7/ch28.md" },
      { label: "第 29 章：可观测性工程", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part7/ch29.md" },
      { label: "第 30 章：构建你自己的 AI Agent", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/part7/ch30.md" },
      { label: "附录 B：环境变量参考", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/appendix/b-env-vars.md" },
      { label: "附录 E：版本演化记录", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/appendix/e-version-evolution.md" },
      { label: "附录 F：端到端案例追踪", doc: "Agentic/Document/harness-engineering-from-cc-to-ai-coding/book/src/appendix/f-e2e-traces.md" }
    ]
  },
  {
    title: "记忆层与多 Agent 框架",
    track: "agentic",
    items: [
      { label: "mem0 README", doc: "Agentic/Memory/mem0/README.md" },
      { label: "mem0 LLM.md（架构总览）", doc: "Agentic/Memory/mem0/LLM.md" },
      { label: "LangChain", doc: "Agentic/Langchain-ai/langchain/README.md" },
      { label: "LangGraph", doc: "Agentic/Langchain-ai/langgraph/README.md" },
      { label: "DeepAgents", doc: "Agentic/Langchain-ai/deepagents/README.md" },
      { label: "DeepAgents AGENTS.md", doc: "Agentic/Langchain-ai/deepagents/AGENTS.md" },
      { label: "CrewAI", doc: "Agentic/crewAI/README.md" },
      { label: "MetaGPT", doc: "Agentic/MetaGPT/README.md" },
      { label: "AutoGPT", doc: "Agentic/AutoGPT/README.md" },
      { label: "OpenHands", doc: "Agentic/OpenHands/README.md" },
      { label: "PI（pi-mono）", doc: "Agentic/PI/pi-mono/README.md" },
      { label: "PI AGENTS.md", doc: "Agentic/PI/pi-mono/AGENTS.md" },
      { label: "openworker", doc: "Agentic/openworker/README.md" },
      { label: "Open Agent SDK（TypeScript）", doc: "Agentic/open-agent-sdk-typescript/README.md" }
    ]
  },
  {
    title: "AI Agent Deep Dive · 17 篇拆解",
    track: "agentic",
    items: [
      { label: "总览 README", doc: "Agentic/ai-agent-deep-dive/README.md" },
      { label: "00 产品总览", doc: "Agentic/ai-agent-deep-dive/docs/00-product-overview.md" },
      { label: "01 系统提示词与编排", doc: "Agentic/ai-agent-deep-dive/docs/01-system-prompt-and-orchestration.md" },
      { label: "02 工具、权限与执行", doc: "Agentic/ai-agent-deep-dive/docs/02-tools-permissions-and-execution.md" },
      { label: "03 Skills、插件与 MCP", doc: "Agentic/ai-agent-deep-dive/docs/03-skills-plugins-mcp.md" },
      { label: "04 记忆与会话", doc: "Agentic/ai-agent-deep-dive/docs/04-memory-and-session.md" },
      { label: "05 命令、UI 与操作体验", doc: "Agentic/ai-agent-deep-dive/docs/05-commands-ui-and-operator-experience.md" },
      { label: "06 验证与质量", doc: "Agentic/ai-agent-deep-dive/docs/06-verification-and-quality.md" },
      { label: "07 架构地图", doc: "Agentic/ai-agent-deep-dive/docs/07-architecture-map.md" },
      { label: "08 Agent 运行时循环", doc: "Agentic/ai-agent-deep-dive/docs/08-agent-runtime-loop.md" },
      { label: "09 消息模型与状态", doc: "Agentic/ai-agent-deep-dive/docs/09-message-model-and-state.md" },
      { label: "10 上下文管理", doc: "Agentic/ai-agent-deep-dive/docs/10-context-management.md" },
      { label: "11 任务模型", doc: "Agentic/ai-agent-deep-dive/docs/11-task-model.md" },
      { label: "12 工作区与隔离", doc: "Agentic/ai-agent-deep-dive/docs/12-workspace-and-isolation.md" },
      { label: "13 失败恢复", doc: "Agentic/ai-agent-deep-dive/docs/13-failure-recovery.md" },
      { label: "14 配置系统", doc: "Agentic/ai-agent-deep-dive/docs/14-configuration-system.md" },
      { label: "15 MVP 范围", doc: "Agentic/ai-agent-deep-dive/docs/15-mvp-scope.md" },
      { label: "16 Python 实现笔记", doc: "Agentic/ai-agent-deep-dive/docs/16-python-implementation-notes.md" }
    ]
  },
  {
    title: "smolagents · 中文文档",
    track: "agentic",
    items: [
      { label: "总览 README", doc: "Agentic/smolagents/README.md" },
      { label: "文档首页", doc: "Agentic/smolagents/docs/source/zh/index.md" },
      { label: "导览：上手 smolagents", doc: "Agentic/smolagents/docs/source/zh/guided_tour.md" },
      { label: "教程：Agent 入门", doc: "Agentic/smolagents/docs/source/zh/conceptual_guides/intro_agents.md" },
      { label: "教程：ReAct 范式", doc: "Agentic/smolagents/docs/source/zh/conceptual_guides/react.md" },
      { label: "教程：写出好的 Agent", doc: "Agentic/smolagents/docs/source/zh/tutorials/building_good_agents.md" },
      { label: "教程：工具", doc: "Agentic/smolagents/docs/source/zh/tutorials/tools.md" },
      { label: "教程：记忆", doc: "Agentic/smolagents/docs/source/zh/tutorials/memory.md" },
      { label: "教程：安全代码执行", doc: "Agentic/smolagents/docs/source/zh/tutorials/secure_code_execution.md" },
      { label: "教程：检查运行过程", doc: "Agentic/smolagents/docs/source/zh/tutorials/inspect_runs.md" }
    ]
  },
  {
    title: "Multica · 多 Agent 协作平台",
    track: "agentic",
    items: [
      { label: "README（中文）", doc: "Agentic/multica/README.zh-CN.md" },
      { label: "设计文档", doc: "Agentic/multica/docs/design.md" },
      { label: "产品总览", doc: "Agentic/multica/docs/product-overview.md" },
      { label: "CLI 与 Daemon", doc: "Agentic/multica/CLI_AND_DAEMON.md" },
      { label: "架构交接审计", doc: "Agentic/multica/HANDOFF_ARCHITECTURE_AUDIT.md" },
      { label: "自托管指南", doc: "Agentic/multica/SELF_HOSTING.md" },
      { label: "工程约定 CLAUDE.md", doc: "Agentic/multica/CLAUDE.md" }
    ]
  },
  {
    title: "CrewAI · 上手与核心概念",
    track: "agentic",
    items: [
      { label: "介绍", doc: "Agentic/crewAI/docs/edge/en/introduction.mdx" },
      { label: "安装", doc: "Agentic/crewAI/docs/edge/en/installation.mdx" },
      { label: "快速开始：第一个 Flow", doc: "Agentic/crewAI/docs/edge/en/quickstart.mdx" },
      { label: "Agents：角色与能力", doc: "Agentic/crewAI/docs/edge/en/concepts/agents.mdx" },
      { label: "Tasks：任务定义与产出", doc: "Agentic/crewAI/docs/edge/en/concepts/tasks.mdx" },
      { label: "Crews：团队编排", doc: "Agentic/crewAI/docs/edge/en/concepts/crews.mdx" },
      { label: "Processes：串行与层级", doc: "Agentic/crewAI/docs/edge/en/concepts/processes.mdx" },
      { label: "Flows：状态与执行顺序", doc: "Agentic/crewAI/docs/edge/en/concepts/flows.mdx" },
      { label: "Collaboration：协作与交接", doc: "Agentic/crewAI/docs/edge/en/concepts/collaboration.mdx" },
      { label: "Agent 能力面板", doc: "Agentic/crewAI/docs/edge/en/concepts/agent-capabilities.mdx" },
      { label: "生产架构", doc: "Agentic/crewAI/docs/edge/en/concepts/production-architecture.mdx" }
    ]
  },
  {
    title: "CrewAI · 记忆、知识与运行时",
    track: "agentic",
    items: [
      { label: "Memory：记忆系统", doc: "Agentic/crewAI/docs/edge/en/concepts/memory.mdx" },
      { label: "Knowledge：知识库", doc: "Agentic/crewAI/docs/edge/en/concepts/knowledge.mdx" },
      { label: "Tools：工具集成", doc: "Agentic/crewAI/docs/edge/en/concepts/tools.mdx" },
      { label: "LLMs：模型接入", doc: "Agentic/crewAI/docs/edge/en/concepts/llms.mdx" },
      { label: "Planning：规划", doc: "Agentic/crewAI/docs/edge/en/concepts/planning.mdx" },
      { label: "Reasoning：推理", doc: "Agentic/crewAI/docs/edge/en/concepts/reasoning.mdx" },
      { label: "Training：训练与反馈", doc: "Agentic/crewAI/docs/edge/en/concepts/training.mdx" },
      { label: "Testing：评估", doc: "Agentic/crewAI/docs/edge/en/concepts/testing.mdx" },
      { label: "Skills：技能", doc: "Agentic/crewAI/docs/edge/en/concepts/skills.mdx" },
      { label: "Streaming：流式输出", doc: "Agentic/crewAI/docs/edge/en/concepts/streaming.mdx" },
      { label: "Checkpointing：断点续跑", doc: "Agentic/crewAI/docs/edge/en/concepts/checkpointing.mdx" },
      { label: "Event Listener：事件总线", doc: "Agentic/crewAI/docs/edge/en/concepts/event-listener.mdx" },
      { label: "Files：文件处理", doc: "Agentic/crewAI/docs/edge/en/concepts/files.mdx" },
      { label: "CLI 参考", doc: "Agentic/crewAI/docs/edge/en/concepts/cli.mdx" }
    ]
  },
  {
    title: "CrewAI · 实战指南",
    track: "agentic",
    items: [
      { label: "指南总览", doc: "Agentic/crewAI/docs/edge/en/learn/overview.mdx" },
      { label: "串行流程", doc: "Agentic/crewAI/docs/edge/en/learn/sequential-process.mdx" },
      { label: "层级流程", doc: "Agentic/crewAI/docs/edge/en/learn/hierarchical-process.mdx" },
      { label: "自定义 Manager Agent", doc: "Agentic/crewAI/docs/edge/en/learn/custom-manager-agent.mdx" },
      { label: "人类在环", doc: "Agentic/crewAI/docs/edge/en/learn/human-in-the-loop.mdx" },
      { label: "自定义工具", doc: "Agentic/crewAI/docs/edge/en/learn/create-custom-tools.mdx" },
      { label: "接入自己的 Agent", doc: "Agentic/crewAI/docs/edge/en/learn/bring-your-own-agent.mdx" },
      { label: "模型选型指南", doc: "Agentic/crewAI/docs/edge/en/learn/llm-selection-guide.mdx" },
      { label: "Coding Agents", doc: "Agentic/crewAI/docs/edge/en/learn/coding-agents.mdx" },
      { label: "多模态 Agent", doc: "Agentic/crewAI/docs/edge/en/learn/multimodal-agents.mdx" }
    ]
  },
  {
    title: "AutoGPT · 平台与 Blocks",
    track: "agentic",
    items: [
      { label: "总览 README", doc: "Agentic/AutoGPT/README.md" },
      { label: "文档首页", doc: "Agentic/AutoGPT/docs/content/index.md" },
      { label: "什么是 AutoGPT Platform", doc: "Agentic/AutoGPT/docs/platform/what-is-autogpt-platform.md" },
      { label: "上手指南", doc: "Agentic/AutoGPT/docs/platform/getting-started.md" },
      { label: "做第一个 Agent", doc: "Agentic/AutoGPT/docs/platform/create-basic-agent.md" },
      { label: "Agent Blocks", doc: "Agentic/AutoGPT/docs/platform/agent-blocks.md" },
      { label: "Block SDK 指南", doc: "Agentic/AutoGPT/docs/platform/block-sdk-guide.md" },
      { label: "新建 Block", doc: "Agentic/AutoGPT/docs/platform/new_blocks.md" },
      { label: "进阶部署", doc: "Agentic/AutoGPT/docs/platform/advanced_setup.md" },
      { label: "本地模型：Ollama", doc: "Agentic/AutoGPT/docs/platform/ollama.md" },
      { label: "Copilot 接本地 LLM", doc: "Agentic/AutoGPT/docs/platform/copilot-local-llm.md" },
      { label: "工作区与媒体架构", doc: "Agentic/AutoGPT/docs/platform/workspace-media-architecture.md" },
      { label: "组织功能矩阵", doc: "Agentic/AutoGPT/docs/platform/org-feature-map.md" },
      { label: "工程约定 AGENTS.md", doc: "Agentic/AutoGPT/AGENTS.md" }
    ]
  },
  {
    title: "AutoGPT · Classic 与 Forge",
    track: "agentic",
    items: [
      { label: "Classic 首页", doc: "Agentic/AutoGPT/docs/content/classic/index.md" },
      { label: "Classic 用法", doc: "Agentic/AutoGPT/docs/content/classic/usage.md" },
      { label: "Classic 安装", doc: "Agentic/AutoGPT/docs/content/classic/setup/index.md" },
      { label: "Docker 部署", doc: "Agentic/AutoGPT/docs/content/classic/setup/docker.md" },
      { label: "配置项", doc: "Agentic/AutoGPT/docs/content/classic/configuration/options.md" },
      { label: "Forge 上手", doc: "Agentic/AutoGPT/docs/content/forge/get-started.md" },
      { label: "组件化：introduction", doc: "Agentic/AutoGPT/docs/content/forge/components/introduction.md" },
      { label: "内置组件", doc: "Agentic/AutoGPT/docs/content/forge/components/built-in-components.md" },
      { label: "自己写组件", doc: "Agentic/AutoGPT/docs/content/forge/components/creating-components.md" },
      { label: "Commands", doc: "Agentic/AutoGPT/docs/content/forge/components/commands.md" },
      { label: "Protocols", doc: "Agentic/AutoGPT/docs/content/forge/components/protocols.md" },
      { label: "挑战集：introduction", doc: "Agentic/AutoGPT/docs/content/challenges/introduction.md" },
      { label: "挑战集：怎么出题", doc: "Agentic/AutoGPT/docs/content/challenges/building_challenges.md" }
    ]
  },
  {
    title: "LangChain · LangGraph · DeepAgents",
    track: "agentic",
    items: [
      { label: "LangChain README", doc: "Agentic/Langchain-ai/langchain/README.md" },
      { label: "LangChain 工程约定", doc: "Agentic/Langchain-ai/langchain/AGENTS.md" },
      { label: "LangChain libs 总览", doc: "Agentic/Langchain-ai/langchain/libs/README.md" },
      { label: "LangGraph README", doc: "Agentic/Langchain-ai/langgraph/README.md" },
      { label: "LangGraph 工程约定", doc: "Agentic/Langchain-ai/langgraph/AGENTS.md" },
      { label: "LangGraph 示例索引", doc: "Agentic/Langchain-ai/langgraph/examples/README.md" },
      { label: "DeepAgents README", doc: "Agentic/Langchain-ai/deepagents/README.md" },
      { label: "DeepAgents 工程约定", doc: "Agentic/Langchain-ai/deepagents/AGENTS.md" },
      { label: "DeepAgents Wiki 首页", doc: "Agentic/Langchain-ai/deepagents/openwiki/index.md" },
      { label: "DeepAgents 快速开始", doc: "Agentic/Langchain-ai/deepagents/openwiki/quickstart.md" },
      { label: "DeepAgents 架构总览", doc: "Agentic/Langchain-ai/deepagents/openwiki/architecture/overview.md" },
      { label: "工作流：deep-agents-code", doc: "Agentic/Langchain-ai/deepagents/openwiki/workflows/deep-agents-code.md" },
      { label: "工作流：评估与发布", doc: "Agentic/Langchain-ai/deepagents/openwiki/workflows/evaluation-and-release.md" },
      { label: "工程：运维与测试", doc: "Agentic/Langchain-ai/deepagents/openwiki/engineering/operations-and-testing.md" }
    ]
  },
  {
    title: "MetaGPT · OpenHands · openworker",
    track: "agentic",
    items: [
      { label: "MetaGPT README", doc: "Agentic/MetaGPT/README.md" },
      { label: "MetaGPT README（中文）", doc: "Agentic/MetaGPT/docs/README_CN.md" },
      { label: "MetaGPT 用法教程（中文）", doc: "Agentic/MetaGPT/docs/tutorial/usage_cn.md" },
      { label: "MetaGPT 命令行安装（中文）", doc: "Agentic/MetaGPT/docs/install/cli_install_cn.md" },
      { label: "MetaGPT Docker 安装（中文）", doc: "Agentic/MetaGPT/docs/install/docker_install_cn.md" },
      { label: "MetaGPT FAQ", doc: "Agentic/MetaGPT/docs/FAQ-EN.md" },
      { label: "MetaGPT 路线图", doc: "Agentic/MetaGPT/docs/ROADMAP.md" },
      { label: "MetaGPT 相关论文", doc: "Agentic/MetaGPT/docs/ACADEMIC_WORK.md" },
      { label: "OpenHands README", doc: "Agentic/OpenHands/README.md" },
      { label: "OpenHands 架构", doc: "Agentic/OpenHands/docs/architecture.md" },
      { label: "OpenHands 开发指南", doc: "Agentic/OpenHands/docs/DEVELOPMENT.md" },
      { label: "OpenHands 自托管", doc: "Agentic/OpenHands/docs/SELF_HOSTING.md" },
      { label: "OpenHands ACP Agents", doc: "Agentic/OpenHands/docs/ACP_AGENTS.md" },
      { label: "openworker README", doc: "Agentic/openworker/README.md" },
      { label: "openworker GUI", doc: "Agentic/openworker/surfaces/gui/README.md" }
    ]
  },
  {
    title: "PI · pi-mono 工具链",
    track: "agentic",
    items: [
      { label: "总览 README", doc: "Agentic/PI/pi-mono/README.md" },
      { label: "工程约定 AGENTS.md", doc: "Agentic/PI/pi-mono/AGENTS.md" },
      { label: "贡献指南", doc: "Agentic/PI/pi-mono/CONTRIBUTING.md" },
      { label: "TUI 设计方案", doc: "Agentic/PI/pi-mono/tui-plan.md" },
      { label: "包：agent", doc: "Agentic/PI/pi-mono/packages/agent/README.md" },
      { label: "包：coding-agent", doc: "Agentic/PI/pi-mono/packages/coding-agent/README.md" },
      { label: "包：protocol", doc: "Agentic/PI/pi-mono/packages/protocol/README.md" },
      { label: "包：server", doc: "Agentic/PI/pi-mono/packages/server/README.md" },
      { label: "包：client", doc: "Agentic/PI/pi-mono/packages/client/README.md" },
      { label: "包：tui", doc: "Agentic/PI/pi-mono/packages/tui/README.md" },
      { label: "包：ai", doc: "Agentic/PI/pi-mono/packages/ai/README.md" },
      { label: "包：evals", doc: "Agentic/PI/pi-mono/packages/evals/README.md" }
    ]
  },
  {
    title: "OpenChamber · 上手与工作流",
    track: "agentic",
    items: [
      { label: "概览", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/index.mdx" },
      { label: "安装", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/install.mdx" },
      { label: "快速开始", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/quickstart.mdx" },
      { label: "OpenCode 服务器", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/opencode-server.mdx" },
      { label: "环境变量", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/environment.mdx" },
      { label: "项目", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/projects.mdx" },
      { label: "上下文", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/context.mdx" },
      { label: "笔记、待办与计划", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/notes-todos-plans.mdx" },
      { label: "计划任务", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/scheduled-tasks.mdx" },
      { label: "智能体控制工具", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/agent-control-tool.mdx" },
      { label: "会话目标", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/session-goals.mdx" },
      { label: "项目操作", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/project-actions.mdx" },
      { label: "预览与开发服务器", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/preview.mdx" },
      { label: "Worktree 会话", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/worktrees.mdx" },
      { label: "Multi-run", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/multi-run.mdx" },
      { label: "Git & GitHub", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/git.mdx" },
      { label: "改动导读", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/walkthrough.mdx" },
      { label: "GitHub 工单与 PR", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/github.mdx" },
      { label: "魔法提示词", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/magic-prompts.mdx" },
      { label: "Git 身份", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/git-identities.mdx" }
    ]
  },
  {
    title: "OpenChamber · OpenCode 配置与远程访问",
    track: "agentic",
    items: [
      { label: "提供商、模型与智能体", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/providers.mdx" },
      { label: "MCP 服务器", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/mcp.mdx" },
      { label: "技能", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/skills.mdx" },
      { label: "技能目录", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/skills-catalog.mdx" },
      { label: "命令与代码片段", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/commands-snippets.mdx" },
      { label: "用量与配额", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/usage.mdx" },
      { label: "连接设备", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/connect-devices.mdx" },
      { label: "私密中继", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/private-relay.mdx" },
      { label: "隧道", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/tunnels.mdx" },
      { label: "反向代理", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/reverse-proxy.mdx" },
      { label: "移动应用与 PWA", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/mobile.mdx" },
      { label: "安全", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/security.mdx" }
    ]
  },
  {
    title: "OpenChamber · 自定义 · 桌面端 · 排查",
    track: "agentic",
    items: [
      { label: "主题", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/themes.mdx" },
      { label: "通知", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/notifications.mdx" },
      { label: "语音模式", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/voice.mdx" },
      { label: "项目图标", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/project-icons.mdx" },
      { label: "远程实例", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/remote-instances.mdx" },
      { label: "桌面浏览器", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/desktop-browser.mdx" },
      { label: "桌面端隧道", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/desktop-tunnels.mdx" },
      { label: "SSH 主机与代理", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/ssh-hosts-proxying.mdx" },
      { label: "更新", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/updates.mdx" },
      { label: "问题排查", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/troubleshooting.mdx" },
      { label: "OpenCode 连接", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/troubleshooting/opencode-connection.mdx" },
      { label: "Worktree 与 Git", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/troubleshooting/worktrees-git.mdx" },
      { label: "远程访问", doc: "Agentic/openchamber/packages/docs/content/docs/zh-cn/troubleshooting/remote-access.mdx" }
    ]
  },

  /* ---------------- Application ---------------- */
  {
    title: "cc-switch · 中文用户手册",
    track: "application",
    items: [
      { label: "README（中文）", doc: "Application/cc-switch/README_ZH.md" },
      { label: "手册导览", doc: "Application/cc-switch/docs/user-manual/zh/README.md" },
      { label: "1.1 简介", doc: "Application/cc-switch/docs/user-manual/zh/1-getting-started/1.1-introduction.md" },
      { label: "1.2 安装", doc: "Application/cc-switch/docs/user-manual/zh/1-getting-started/1.2-installation.md" },
      { label: "1.3 界面", doc: "Application/cc-switch/docs/user-manual/zh/1-getting-started/1.3-interface.md" },
      { label: "1.4 快速开始", doc: "Application/cc-switch/docs/user-manual/zh/1-getting-started/1.4-quickstart.md" },
      { label: "1.5 设置", doc: "Application/cc-switch/docs/user-manual/zh/1-getting-started/1.5-settings.md" },
      { label: "2.1 添加供应商", doc: "Application/cc-switch/docs/user-manual/zh/2-providers/2.1-add.md" },
      { label: "2.2 切换供应商", doc: "Application/cc-switch/docs/user-manual/zh/2-providers/2.2-switch.md" },
      { label: "2.5 用量查询", doc: "Application/cc-switch/docs/user-manual/zh/2-providers/2.5-usage-query.md" },
      { label: "2.6 Claude Desktop", doc: "Application/cc-switch/docs/user-manual/zh/2-providers/2.6-claude-desktop.md" },
      { label: "5.1 配置文件", doc: "Application/cc-switch/docs/user-manual/zh/5-faq/5.1-config-files.md" },
      { label: "5.2 常见问题", doc: "Application/cc-switch/docs/user-manual/zh/5-faq/5.2-questions.md" },
      { label: "5.4 环境变量冲突", doc: "Application/cc-switch/docs/user-manual/zh/5-faq/5.4-env-conflict.md" },
      { label: "路由指南：Claude", doc: "Application/cc-switch/docs/guides/codex-claude-routing-guide-zh.md" },
      { label: "路由指南：DeepSeek", doc: "Application/cc-switch/docs/guides/codex-deepseek-routing-guide-zh.md" },
      { label: "路由指南：Kimi", doc: "Application/cc-switch/docs/guides/codex-kimi-routing-guide-zh.md" },
      { label: "代理配置指南", doc: "Application/cc-switch/docs/guides/proxy-guide-zh.md" },
      { label: "会话管理器设计", doc: "Application/cc-switch/session-manager.md" }
    ]
  },
  {
    title: "CodexSwitch · WorkAny · Solon-AI",
    track: "application",
    items: [
      { label: "CodexSwitch README", doc: "Application/CodexSwitch/README.md" },
      { label: "CodexSwitch 设计文档", doc: "Application/CodexSwitch/DESIGN.md" },
      { label: "CodexSwitch 完整 SPEC", doc: "Application/CodexSwitch/SPEC.md" },
      { label: "CodexSwitch 工程约定", doc: "Application/CodexSwitch/AGENTS.md" },
      { label: "Codex 上游接口清单", doc: "Application/CodexSwitch/docs/codex-upstream-api-inventory.md" },
      { label: "WorkAny README", doc: "Application/workany/README.md" },
      { label: "WorkAny 贡献指南", doc: "Application/workany/CONTRIBUTING.md" },
      { label: "Solon-AI README", doc: "Application/solon-ai/README.md" },
      { label: "Solon-AI · A2A 模块", doc: "Application/solon-ai/solon-ai-a2a/README.md" },
      { label: "Solon-AI · ANP 模块", doc: "Application/solon-ai/solon-ai-anp/README.md" },
      { label: "Solon-AI · Flow 模块", doc: "Application/solon-ai/solon-ai-flow/README.md" },
      { label: "Solon-AI 更新日志", doc: "Application/solon-ai/UPDATE_LOG.md" }
    ]
  }
];

/* ---------------------------------------------------------------------------
 * 图片路径修复规则：GitHub raw URL → 本地 local-courses 路径
 * ------------------------------------------------------------------------- */
const imageRewrites = [
  [/^https:\/\/raw\.githubusercontent\.com\/datawhalechina\/Hello-Agents\/main\/docs\/images\//i, "Learning/hello-agents/docs/images/"],
  [/^https:\/\/raw\.githubusercontent\.com\/shareAI-lab\/learn-claude-code\/main\//i, "AICoding/claude/document/learn-claude-code/"],
  [/^https:\/\/raw\.githubusercontent\.com\/openclaw\/openclaw\/main\//i, "AICoding/openclaw/"],
  [/^https:\/\/raw\.githubusercontent\.com\/shareAI-lab\/claw0\/main\//i, "Learning/claw0/workspace/"]
];

window.HubData = { COURSE_ROOT, tracks, stages, courses, projects, resources, menuData, imageRewrites };

})();
