# Hermes 定位分析与混沌测试 Agent 选型评估

> 生成时间：2026-07-15
> 项目路径：`local-courses/hermes/hermes-agent`
> 分析依据：README.md、AGENTS.md（开发指南，本地架构文档的实际载体）、仓库目录结构
> 评估背景：拟基于 Hermes 构建一个 7×24 运行的混沌测试 AI Agent——自动起集群、注入故障、调多语言 SDK 跑测试、收集日志、生成报告、通过飞书通知团队

---

## 〇、阅读前提：仓库结构的两个偏差

在展开分析前先纠正两个常见预期偏差：

1. **仓库没有 `src/` 目录。** Hermes 采用平铺结构：`run_agent.py`、`cli.py`、`hermes_state.py` 等核心文件直接位于仓库根目录，配合 `agent/`、`tools/`、`gateway/`、`cron/`、`plugins/` 等顶层目录。
2. **仓库没有 `docs/architecture.md`。** 架构文档托管在官网（hermes-agent.nousresearch.com/docs），本地 `docs/` 只有若干专项设计文档（session-lifecycle、relay-connector-contract 等）。**本地最接近架构文档的是根目录的 `AGENTS.md`**（约 72KB 的开发指南），它包含项目结构、核心类说明、设计原则与贡献边界，且坦率程度远超一般官方文档。

---

## 一、核心定位

**Hermes 是一个"个人 AI 助理运行时"：同一个 agent 核心跑在 CLI、消息平台、TUI、桌面端，强调跨会话自我学习（memory + skills）和随处可达。**

它的自我定义是 "self-improving personal AI agent"——服务对象是**一个人**，不是一套系统。这个定位不是营销话术，而是渗透在几乎所有设计决策里：

- 认证模型是"谁允许跟我的 bot 说话"（pairing / allowlist），而非 RBAC；
- 学习闭环（自建 skills、用户建模、跨会话记忆）都围绕"越用越懂你"展开；
- 部署叙事是"$5 VPS 上跑一个属于你的 agent，在 Telegram 上随时找它"。

`AGENTS.md` 开篇给出了两条统领一切设计评审的原则，值得原样记录：

1. **Per-conversation prompt caching is sacred（会话级提示缓存神圣不可侵犯）**——对话中途不改历史上下文、不换工具集、不重建 system prompt，唯一例外是上下文压缩。任何破坏缓存的改动会成倍放大用户成本。
2. **The core is a narrow waist; capability lives at the edges（核心是窄腰，能力长在边缘）**——每个核心工具都会随每次 API 调用发送并计费，因此新增核心工具的门槛极高；新能力优先以 CLI 命令 + skill、插件、MCP server 的形式落地。

---

## 二、核心抽象

| 抽象 | 位置 | 一句话作用 |
| --- | --- | --- |
| **AIAgent** | `run_agent.py`（~12k 行） | 核心对话循环：同步 while 循环，模型调用 → 工具执行 → 追加消息，受 `max_iterations`（默认 90）与 iteration budget 双重约束 |
| **Tools / Toolsets** | `tools/registry.py` + `toolsets.py` | 工具在 import 时自注册；toolset 决定哪些工具进入模型 schema，核心工具集刻意收窄以控制每次调用的 token 成本 |
| **Terminal Environments** | `tools/environments/` | agent 执行 shell 的后端抽象，六种：local、Docker、SSH、Singularity、Modal、Daytona——本质是"给 agent 一个 shell"，不是集群管理 |
| **Gateway + Platform Adapters** | `gateway/` + `gateway/platforms/` | 一个长驻进程接约 20 个消息平台（Telegram、Discord、Slack、**飞书**、企微、钉钉等），把消息路由到 agent 会话 |
| **Skills** | `skills/` + `tools/skills_*.py` | Markdown 指令包形式的"程序性记忆"，agent 可自行创建与改进，兼容 agentskills.io 开放标准 |
| **Curator** | `agent/curator.py` | skills 的后台生命周期管理：用量追踪、陈旧检测、自动归档（永不删除，归档可恢复），只管 agent 自建的技能 |
| **Memory** | `agent/memory_manager.py` + `plugins/memory/` | 跨会话持久记忆，provider 可插拔（honcho、mem0、supermemory 等） |
| **Cron** | `cron/scheduler.py` + `cron/jobs.py` | 定时任务：支持自然语言调度（"every monday 9am"）、5 段 cron 表达式、一次性 ISO 时间戳，结果可投递到任意消息平台 |
| **Delegation** | `tools/delegate_tool.py` | 派生隔离子代理（独立上下文 + 终端会话），支持并行 batch，orchestrator/leaf 角色分层，默认并发上限 3 |
| **Kanban** | `tools/kanban_tools.py` + `plugins/kanban/` | SQLite 持久化的多 agent 工作队列：dispatcher 认领任务、派发 worker、连续失败自动 block |
| **SessionDB** | `hermes_state.py` | SQLite 会话存储 + FTS5 全文搜索，支撑跨会话回忆 |
| **Plugins** | `plugins/` | 所有"别人的产品"与边缘能力的落点；第三方集成明确不允许进核心树 |

### 抽象之间的依赖链

```
tools/registry.py  （无依赖——被所有工具文件 import）
       ↑
tools/*.py  （import 时各自调用 registry.register()）
       ↑
model_tools.py  （工具编排：discover_builtin_tools() / handle_function_call()）
       ↑
run_agent.py（AIAgent）、cli.py、batch_runner.py、environments/
```

---

## 三、设计边界：Hermes 不解决什么

这一节是选型判断的关键。`AGENTS.md` 对边界的表述异常坦白，以下每条都有文档或代码依据。

### 3.1 不是工作流 / 编排引擎

没有 DAG、没有步骤级重试语义、没有 artifact 管理。执行的"可靠性"依赖 LLM 循环自行兜底，而非确定性编排。多步任务的推荐方式是让 agent 写 Python 脚本经 RPC 调用工具（把多步流水线折叠成零上下文成本的单轮），这是省 token 的技巧，不是编排保障。

### 3.2 不是长任务执行引擎——且有防御性设计对抗这种用法

- **Cron 会话有 3 分钟硬中断**：防止失控的 agent 循环独占调度器。这是刻意的 hardening invariant，不是可调参数疏漏。
- **后台 delegation 不跨进程重启存活**：文档明说 background `delegate_task` 是 process-local 的，"要求跨重启存活的工作，请改用 `cronjob` 或 `terminal(background=True, notify_on_complete=True)`"。
- Cron 会话默认 `skip_memory=True`，catchup 窗口被钳制在 120s–2h——处处体现"定时任务应该短小"的假设。

### 3.3 不是多租户服务

单用户假设贯穿始终。profiles 机制支持多实例，kanban 有 board（硬边界）/ tenant（软命名空间）的隔离，但这些是"一个人的多个分身 / 一支专家小队服务几家小业务"的尺度，不是平台级多租户。

### 3.4 核心刻意不长新能力

"Footprint Ladder"明文规定新能力的落地优先级：**扩展现有代码 → CLI 命令 + skill → 服务门控工具 → 插件 → MCP catalog → 新核心工具（最后手段）**。且贡献规则明确：观测后端、vendor SaaS 集成等"别人的产品"即使做得再好也不收进核心树，必须发独立插件仓库。

### 3.5 上下文不可变

Prompt caching 神圣性意味着：对话中途不能换工具集、不能重建 system prompt、不能重载记忆。需要动态切换上下文 / 工具的场景与它的根本约束冲突。改变 system-prompt 状态的操作默认"下个会话生效"。

---

## 四、运行模型

### 4.1 进程模型

两个主入口：

```
hermes            # 交互 CLI：单进程，HermesCLI 包着 AIAgent 同步循环
hermes gateway    # 长驻 async 进程（gateway/run.py，单文件约 1MB）
                  #   ├── ~20 个消息平台适配器
                  #   ├── cron scheduler 的 tick 循环（默认跑在 gateway 内）
                  #   └── kanban dispatcher（默认 kanban.dispatch_in_gateway: true）
```

TUI 是另一对进程：Node（Ink/React）负责渲染，Python（`tui_gateway/`）负责会话、工具与模型调用，两者之间是 stdio 上的 newline-delimited JSON-RPC。桌面端（Electron）与 ACP 适配器（VS Code / Zed / JetBrains）复用同一 agent 核心。

Agent 循环本体（`run_conversation()`）**完全同步**，带中断检查、预算追踪和一次超预算的 grace call。消息遵循 OpenAI 格式。

### 4.2 配置加载

- `~/.hermes/config.yaml`——**所有行为配置**（超时、阈值、开关、显示偏好）。
- `~/.hermes/.env`——**仅密钥**（API key、token、密码）。"非密钥配置进 .env"是明确会被拒收 PR 的行为。
- **三条加载路径并存**，这是文档自己承认的坑：

| 加载器 | 使用方 | 位置 |
| --- | --- | --- |
| `load_cli_config()` | 交互 CLI | `cli.py`，合并 CLI 默认值 + 用户 YAML |
| `load_config()` | `hermes tools` / `hermes setup` 等子命令 | `hermes_cli/config.py`，合并 `DEFAULT_CONFIG` + 用户 YAML |
| 直接读 YAML | Gateway 运行时 | `gateway/run.py` + `gateway/config.py` |

加了配置键但"CLI 看得见、gateway 看不见"（或反之）＝走错了加载器。二次开发时这是高频踩坑点。

### 4.3 状态管理

全部是 SQLite + 本地文件，无外部依赖、无分布式状态：

- 会话：`hermes_state.py` 的 `SessionDB`（SQLite + FTS5 全文搜索）；
- Kanban：SQLite board；
- Skills / Memory：`~/.hermes/` 下的文件（skills 带 `.usage.json` 用量 sidecar）；
- Cron：job store + 文件锁（`~/.hermes/cron/.tick.lock`）防跨进程重复 tick；
- 日志：`~/.hermes/logs/`（agent.log / errors.log / gateway.log），profile 感知。

---

## 五、选型评估：Hermes × 7×24 混沌测试 Agent

### 5.1 结论先行

**方向部分重叠，核心气质不匹配。Hermes 适合当这套系统里的"值班分析员 + 通知层"，不适合当混沌测试的执行引擎。** 如果预期是 fork Hermes 往核心里塞混沌测试能力，这条路会与上游的设计哲学和演进速度持续对抗，不建议。

### 5.2 匹配的部分（有几处意外地好）

| 需求 | Hermes 现状 | 匹配度 |
| --- | --- | --- |
| 飞书通知 | `gateway/platforms/` 有 feishu 适配器；`tools/` 里有现成的 `feishu_doc_tool.py`、`feishu_drive_tool.py`（飞书文档/云盘工具） | ★★★ 飞书是一等公民，通知链路几乎零成本 |
| 7×24 长驻 + 定时 | gateway 长驻进程 + cron 原生调度与多平台投递 | ★★★ 调度和投递不用自己写 |
| 驱动终端跑测试 / 收日志 | 六种终端后端（含 Docker / SSH），agent 能驱动真实 shell；后台进程带完成通知 | ★★☆ 能干，但见 5.3 的可靠性问题 |
| 生成报告 | 文件工具 + 飞书文档工具齐备 | ★★☆ 报告可信度取决于执行层可信度 |
| 并行 / 多 worker | delegate_task 并行 batch、kanban 持久队列 | ★★☆ 有原语，但语义不是编排语义 |

### 5.3 不匹配的部分（硬性）

1. **可靠性模型错位——这是最根本的一条。** 混沌测试平台的产出必须**可重复、可归因、可信**：同样的故障注入序列能重放，失败能定位到具体注入点。Hermes 把每一步交给 LLM 现场决策，7×24 运行下行为漂移是必然的。如果报告的前提是"agent 这次记得注入了哪些故障"，报告本身就不可信。更本质地说：**起集群、注入故障、跑测试、收日志这些确定性步骤，本来就不该由 LLM 执行**——那是脚本的活，LLM 参与只会引入不确定性而不带来价值。

2. **Cron 的 3 分钟硬中断直接顶着需求。** 一轮"起集群 → 注入 → 跑多语言 SDK → 收日志"远超 3 分钟。这个限制是框架为防失控专门设计的，绕它就是在对抗框架。而官方认可的绕法——cron job 的 `script` 字段先跑数据采集脚本、把 stdout 注入 prompt、agent 只做分析——恰恰反过来印证了 5.4 的正确架构。

3. **后台任务不跨进程重启存活。** 7×24 服务必须容忍重启。Kanban 是持久的，但它是任务队列不是编排器：没有"步骤 3 失败从步骤 3 重试"的语义，failure_limit 到了直接 block 任务。

4. **"自动起集群"完全在 Hermes 职责之外。** Docker/SSH 后端的语义是"给 agent 一个容器/远程机当 shell"，不是集群生命周期管理（无拓扑、无健康检查、无编排）。这块需要完全自建。

5. **项目哲学明确反对重度二开。** Footprint Ladder + "第三方产品不进核心树"意味着：按 Hermes 自己的方式，整套混沌测试能力应该长成 **skills + cron jobs + 独立插件仓库**，而不是改核心。fork 改核心则要面对一个以 `fix` 为主、产品面激进扩张的快速上游。

6. **单用户假设。** 团队场景下的权限、审计、多人协作不在其模型内；kanban 的 tenant 只是软命名空间。

### 5.4 建议架构：确定性归脚本，判断力归 Agent

```
┌─────────────────────────────────────────────────────────┐
│ 执行层（确定性，自建，不依赖 LLM）                          │
│   集群生命周期管理 · 故障注入器 · 多语言 SDK 测试运行器      │
│   日志/指标采集 —— 普通脚本或流水线，可重放、可审计           │
└──────────────────────────┬──────────────────────────────┘
                           │ 结构化产物（日志、结果 JSON、指标）
┌──────────────────────────▼──────────────────────────────┐
│ 分析层（Hermes 的真正价值所在）                             │
│   cron 触发执行层脚本（script 字段 / 后台终端进程）           │
│   agent 读取产物：分析失败日志、诊断根因、写人类可读报告        │
│   决策类工作："这轮发现了什么，下轮该注入什么故障"              │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│ 通知层（Hermes 现成能力）                                  │
│   gateway feishu 适配器推送 · feishu_doc_tool 写文档报告    │
└─────────────────────────────────────────────────────────┘
```

要点：

- **执行层不进 agent 循环**。混沌实验的编排（顺序、重试、超时、清理）用确定性工具实现——哪怕只是一组带状态文件的 shell/Python 脚本，也比 LLM 循环可靠且可审计。
- **Hermes 只消费产物**：cron job 用 `script` 预跑采集、`context_from` 串联任务链、`workdir` 加载项目上下文，agent 拿到结构化输出后做分析与写作。这与 3 分钟硬中断、跨重启持久化等所有约束天然兼容。
- **按 Hermes 的扩展方式落地**：分析规程写成 skills（如"混沌日志诊断"、"报告模板"），飞书投递走现成 gateway，不改核心。

### 5.5 如果坚持把 Hermes 当底座

需要清醒接受的成本：

- 背上大量用不到的个人助理机制（自进化 skills、用户建模、20 个消息平台、TUI、桌面端）；
- 最需要的能力——可重复编排、审计追溯、跨重启的持久任务流——恰恰是它的弱项或**明确的非目标**；
- 三条配置加载路径、1MB 的 `gateway/run.py`、12k 行的 `run_agent.py`，二开的理解成本不低；
- 上游演进快，fork 的维护成本会随时间累积。

替代思路：若只需要"能跑 shell、能定时、能发飞书的 agent 运行时"，可以评估更薄的 agent 框架 + 自建编排；或者干脆编排层用成熟 CI/工作流系统（本身就有重试、审计、可重放），只把 LLM 嵌入"分析 + 报告"一个环节。

---

## 六、开放问题

- 混沌实验的"探索性"部分（下一轮注入什么故障）交给 LLM 决策到什么程度合适？完全随机（经典混沌工程）与 LLM 引导各有可辩护的理由，需要团队定义评价标准。
- Hermes 的 kanban 若用作"实验任务队列"，其 board/tenant 隔离和 failure_limit 语义是否够用，需要小规模试点验证。
- 飞书适配器与 feishu_doc_tool 的实际成熟度（本分析仅确认其存在与接口形态，未实测）。

## 七、参考

- `local-courses/hermes/hermes-agent/README.md` — 产品定位与功能总览
- `local-courses/hermes/hermes-agent/AGENTS.md` — 开发指南：项目结构、AIAgent 类、Footprint Ladder、cron/kanban/delegation 契约、配置加载三路径
- `local-courses/hermes/hermes-agent/docs/` — session-lifecycle、chronos-managed-cron-contract 等专项设计文档
- 同目录：[工程解读报告.md](./工程解读报告.md) — 此前的代码工程通读报告（v0.13.0），与本文互补：彼篇重"是什么"，本篇重"边界与选型判断"
