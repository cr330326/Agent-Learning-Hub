# Hermes Agent Learning Loop 后台复盘机制深度调研报告

## —— 从源码到 OpenCode 插件迁移的可行性分析与实施方案

---

## 执行摘要

本报告基于对 **Hermes Agent 官方源码**（`run_agent.py` 4137 行核心代码）、**Hermione 项目**（将 Hermes Learning Loop 完整移植到 OpenClaw 的插件实现，1425 行 JavaScript）、**OpenCode 官方插件文档**以及 **20+ 篇社区深度分析文章**的系统研究，完整拆解了 Hermes Learning Loop 后台复盘机制的实现原理，并提出了向 OpenCode 插件生态迁移的完整技术方案。

**核心发现：**
- Hermes Learning Loop 的核心不是单一机制，而是 **"计数器触发 → 后台 Fork → 对话快照 → Review Prompt → 工具写入 → 结果反馈"** 的六阶段流水线
- Hermione 已证明 Learning Loop 完全可以以**纯插件方式**移植，无需修改宿主 Agent 核心代码
- OpenCode 的插件钩子体系提供了**所有必要的扩展点**，其中 `experimental.session.compacting` 钩子可以充当 Hermes 的 `agent_end` 角色来触发复盘
- 预计 OpenCode 插件实现可在 **3-4 周内**完成从原型到生产级的迭代

---

## 目录

1. [Hermes Learning Loop 核心机制拆解](#一hermes-learning-loop-核心机制拆解)
2. [触发机制：何时启动后台复盘](#二触发机制何时启动后台复盘)
3. [后台 Fork：临时 Agent 的生命周期](#三后台-fork临时-agent-的生命周期)
4. [Review Prompt 设计：三类复盘提示词](#四review-prompt-设计三类复盘提示词)
5. [对话快照：增量式读取与 cursor 机制](#五对话快照增量式读取与-cursor-机制)
6. [Hermione 参考实现：已验证的插件移植方案](#六hermione-参考实现已验证的插件移植方案)
7. [OpenCode 插件架构与可用钩子](#七opencode-插件架构与可用钩子)
8. [OpenCode 迁移方案：完整技术设计](#八opencode-迁移方案完整技术设计)
9. [关键挑战与风险分析](#九关键挑战与风险分析)
10. [实施路线图](#十实施路线图)

---

## 一、Hermes Learning Loop 核心机制拆解

### 1.1 总体架构

Hermes Learning Loop 是一个**六阶段流水线**：

```
阶段 1: 计数器驱动触发
  每 N 个用户消息 / 每 N 次工具调用 → _turns_since_memory++ / _iters_since_skill++
  达到阈值? → 进入阶段 2

阶段 2: 后台 Fork 临时 Agent  
  _spawn_background_review(messages_snapshot=..., review_memory=..., review_skills=...)
  → 在独立线程/进程中创建新的 AIAgent 实例

阶段 3: 对话快照传输
  将完整对话历史（增量式，cursor-based）传递给临时 Agent
  临时 Agent 读取当前 MEMORY.md + USER.md + skills 索引

阶段 4: Review Prompt 引导
  注入 _MEMORY_REVIEW_PROMPT / _SKILL_REVIEW_PROMPT
  临时 Agent 评估对话内容的价值

阶段 5: 工具写入
  有价值? → 调用 memory tool (add/replace/remove)
           → 或调用 skill_manage tool (create/patch/edit)
  无价值? → 跳过，不写入任何内容

阶段 6: 结果反馈
  成功写入? → 可选返回简短提示 "新 Skill 已创建: xxx"
  失败? → 记录日志，不打扰用户
```

**关键设计原则**：
- **异步非阻塞**：后台复盘不会延迟主 Agent 的回复
- **不可见**：用户看不到复盘过程，仅在成功保存时收到一条简短提示
- **有界**：临时 Agent 最多运行 8 次迭代（`max_iterations=8`），防止无限循环
- **冷却保护**：默认 5 分钟冷却时间（`reviewCooldownMs=300000`），防止复盘风暴

### 1.2 核心代码定位

在 `run_agent.py` 中的关键函数和常量：

| 功能 | 代码位置 | 说明 |
|------|----------|------|
| 计数器递增与阈值检查 | `:8839`（memory）、`:11835`（skill） | 每次用户消息/工具调用后计数 |
| `_spawn_background_review()` | `:2458` | Fork 临时 Agent 的核心函数 |
| `_MEMORY_REVIEW_PROMPT` | `:2423` | 记忆复盘提示词 |
| `_SKILL_REVIEW_PROMPT` | `:2434` | 技能复盘提示词 |
| `_COMBINED_REVIEW_PROMPT` | `:2444` | 组合复盘提示词 |
| Review Agent 迭代上限 | `max_iterations=8` | 防止复盘占用过多资源 |

---

## 二、触发机制：何时启动后台复盘

### 2.1 双计数器系统

Hermes 使用**两个独立计数器**，分别驱动 Memory Review 和 Skill Review：

| 计数器 | 触发条件 | 默认阈值 | 配置键 |
|--------|----------|----------|--------|
| `_turns_since_memory` | 每次收到用户消息 | 10 个 user prompts | `memoryReviewTurns` (default: 10) |
| `_iters_since_skill` | 每次工具调用完成 | 10 次 tool calls | `skillReviewCalls` (default: 10) |

**注意**：两个计数器是独立累加的。当达到 memory 阈值时只触发 memory review，达到 skill 阈值时只触发 skill review。如果两个同时达到，则触发 combined review。

### 2.2 触发逻辑（源码级）

```python
# 伪代码，基于 run_agent.py 实际逻辑
class AIAgent:
    def __init__(self):
        self._turns_since_memory = 0      # memory 复盘计数器
        self._iters_since_skill = 0       # skill 复盘计数器
        self._last_review_at = 0          # 上次复盘时间戳（cooldown 用）
        self._memory_nudge_interval = 10  # memory 阈值
        self._skill_nudge_interval = 10   # skill 阈值
        self._review_cooldown_ms = 300000 # 5 分钟冷却

    async def _on_user_message(self, message):
        """每次收到用户消息后"""
        self._turns_since_memory += 1
        # ... 处理用户消息 ...
        await self._maybe_trigger_review()

    async def _on_tool_executed(self, tool_call, result):
        """每次工具调用完成后"""
        self._iters_since_skill += 1
        # ... 处理工具结果 ...
        await self._maybe_trigger_review()

    async def _maybe_trigger_review(self):
        """检查是否触发复盘"""
        now = time.time() * 1000
        
        # 冷却时间检查
        if now - self._last_review_at < self._review_cooldown_ms:
            return
        
        review_memory = self._turns_since_memory >= self._memory_nudge_interval
        review_skills = self._iters_since_skill >= self._skill_nudge_interval
        
        if not review_memory and not review_skills:
            return
        
        # 重置计数器
        if review_memory:
            self._turns_since_memory = 0
        if review_skills:
            self._iters_since_skill = 0
        self._last_review_at = now
        
        # 构建对话快照
        messages_snapshot = self._build_review_messages()
        
        # Fork 后台复盘 Agent
        await self._spawn_background_review(
            messages_snapshot=messages_snapshot,
            review_memory=review_memory,
            review_skills=review_skills
        )
```

### 2.3 触发条件的 Reset 规则

| 场景 | 行为 |
|------|------|
| Agent 调用 memory tool（手动触发） | `_turns_since_memory = 0`（重置 memory 计数器） |
| Agent 调用 skill_manage tool（手动触发） | `_iters_since_skill = 0`（重置 skill 计数器） |
| 用户发送新消息 | `_turns_since_memory++` |
| 工具调用完成 | `_iters_since_skill++` |
| 冷却期内的触发请求 | 忽略，等待冷却结束 |

**设计意图**：如果 Agent 主动调用了 memory/skill 工具，说明它已经进行了自我维护，不需要后台再复盘。这避免了重复工作。

---

## 三、后台 Fork：临时 Agent 的生命周期

### 3.1 _spawn_background_review() 核心实现

```python
async def _spawn_background_review(
    self,
    messages_snapshot: List[Dict],
    review_memory: bool = False,
    review_skills: bool = False
):
    """Fork 一个临时 Agent 执行后台复盘
    
    关键设计：
    1. 创建全新的 AIAgent 实例（不是线程共享）
    2. 使用相同的 model/provider 配置
    3. 独立的 prompt cache（不干扰主 Agent 的 cache）
    4. 最多 8 次迭代
    5. 不向用户输出（静默执行）
    """
    
    # 1. 选择 Review Prompt
    if review_memory and review_skills:
        review_prompt = self._COMBINED_REVIEW_PROMPT
    elif review_memory:
        review_prompt = self._MEMORY_REVIEW_PROMPT
    elif review_skills:
        review_prompt = self._SKILL_REVIEW_PROMPT
    else:
        return
    
    # 2. 构建 Review Agent 的消息历史
    # 第一跳消息是系统提示 + Review Prompt
    # 后续消息是对话快照（增量式）
    review_messages = [
        {"role": "system", "content": self._build_system_prompt()},
        {"role": "user", "content": review_prompt},
        *messages_snapshot  # 注入对话历史
    ]
    
    # 3. 创建临时 Agent（独立实例）
    review_agent = AIAgent(
        model=self.model,
        provider=self.provider,
        # 继承工具注册（memory, skill_manage 等）
        tools=self.tools,
        max_iterations=8,  # 硬性上限
    )
    
    # 4. 在后台线程/进程中运行
    # 使用 asyncio.create_task 或线程池
    asyncio.create_task(
        self._run_review_in_background(review_agent, review_messages)
    )

async def _run_review_in_background(self, review_agent, review_messages):
    """后台运行复盘 Agent"""
    try:
        result = await review_agent.run_conversation(
            messages=review_messages,
            max_iterations=8
        )
        # 可选：返回简短结果给用户
        if result.tool_calls_executed:  # 如果执行了工具写入
            logger.info(f"Review completed: {result.summary}")
    except Exception as e:
        logger.error(f"Background review failed: {e}")
        # 失败不打扰用户
```

### 3.2 临时 Agent 的特性

| 特性 | 实现方式 | 设计理由 |
|------|----------|----------|
| **独立 Prompt Cache** | 新建 AIAgent 实例 | 不干扰主 Agent 的 Prefix Cache |
| **继承工具集** | `tools=self.tools` | 复用 memory/skill_manage 等工具 |
| **独立 System Prompt** | 重新构建（含当前 MEMORY.md/USER.md） | 确保 Agent 知道已有记忆 |
| **最多 8 次迭代** | `max_iterations=8` | 防止复盘无限消耗资源 |
| **不输出给用户** | 静默执行，仅记录日志 | 不干扰用户体验 |
| **失败容错** | try/except 包裹 | 复盘失败不影响主流程 |
| **使用相同模型** | `model=self.model` | 确保质量（可配置为更便宜的模型） |

### 3.3 Fork 模式的演进：Codex 运行时适配

Hermes v0.14+ 引入了对 Codex App-Server Runtime 的支持。当主 Agent 运行在 Codex 模式时，复盘 Fork 会被**降级到 Codex Responses 模式**（降级到更便宜的 API），这样 Learning Loop 的工具调用（memory, skill_manage）仍然可以正常工作，但成本大幅降低。这对 OpenCode 插件设计有重要启示：**复盘可以用比主 Agent 更便宜的模型**。

---

## 四、Review Prompt 设计：三类复盘提示词

### 4.1 _MEMORY_REVIEW_PROMPT（记忆复盘）

```text
你是一位记忆管理专家。请回顾以下对话历史，判断是否有内容值得长期保存。

请特别关注：
1. **用户偏好**：沟通风格、技术偏好、工作习惯
2. **环境事实**：项目结构、工具版本、系统配置
3. **工作规范**：团队约定、代码规范、流程惯例
4. **踩坑记录**：遇到的问题和解决方案

评估标准：
- 这条信息在未来的对话中是否有价值？
- 这条信息是否容易被重新发现？（不容易重新发现的更值得保存）
- 是否与已有记忆重复？（重复的不要保存）

如果发现有价值的内容，请调用 memory tool 将其保存。
如果 USER.md 中有新的用户画像信息，也请更新。
```

### 4.2 _SKILL_REVIEW_PROMPT（技能复盘）

```text
你是一位方法论提炼专家。请回顾以下对话，判断是否有可复用的工作流程值得保存为 Skill。

触发条件：
1. 任务是否使用了非平凡的方法？（简单的查询不值得）
2. 是否经历了试错过程？（有试错 = 有价值的方法论）
3. 最终结果是否成功？（失败的经验不值得保存为 Skill）
4. 这个方法在未来是否可能复用？

如果满足条件，请调用 skill_manage tool 创建新的 SKILL.md。
Skill 应包含：适用场景、执行步骤、参数定义、常见坑点。
```

### 4.3 _COMBINED_REVIEW_PROMPT（组合复盘）

当两个计数器同时达到阈值时触发，本质上是前两个 prompt 的组合。注意：社区反馈指出这个 prompt **强制要求"创建新 Skill"**，导致即使不值得保存的任务也会触发 Skill 生成。GitHub Issue #12340 提出了改进建议。

### 4.4 Prompt 设计的关键洞察

| 维度 | Hermes 设计 | 社区反馈的问题 |
|------|------------|---------------|
| **自评估倾向** | Agent 几乎总是认为"做得不错" | 导致低质量 Skill 被创建 |
| **强制创建** | Combined prompt 强制要求创建 Skill | Issue #12340 要求可选 |
| **覆盖风险** | 自动更新会覆盖手动编辑 | 高级用户无法接受 |
| **质量门槛** | 仅靠 LLM 自评，无外部验证 | 错误经验可能被固化 |

**改进建议**（OpenCode 实现时应采纳）：
1. Skill 创建应该是**可选行为**而非强制
2. 引入**外部验证**（如单元测试结果、用户反馈）
3. **用户锁定**机制：手动编辑的段落标记 protected
4. **置信度阈值**：低于 0.75 的评估不触发写入

---

## 五、对话快照：增量式读取与 cursor 机制

### 5.1 增量式快照（Hermione 的实现）

Hermione 在 OpenClaw 插件中实现了一套**增量式 cursor-based 对话读取机制**，这是 Learning Loop 高性能的关键：

```javascript
// Hermione 的 review-state.json 结构
{
  "lastReviewCursor": 42,      // 上次复盘读到的消息索引
  "lastReviewAt": 1712234567890, // 上次复盘时间戳
  "turnsSinceMemory": 7,      // memory 计数器
  "callsSinceSkill": 3,       // skill 计数器
  "totalTurns": 15,           // 总会话轮数
  "totalCalls": 12            // 总工具调用次数
}

// 复盘时只读取从上一次 cursor 之后的新消息
const newMessages = messages.slice(lastReviewCursor);
```

**优势**：
- 不需要每次都传输完整对话历史
- 复盘速度更快（只处理新内容）
- Token 消耗更少

### 5.2 会话结束时的 Flush 机制

Hermione 还实现了 **Memory Flush** —— 当会话在达到复盘阈值前结束时，执行轻量级的"补漏"复盘：

```javascript
// agent_end 钩子中的 Flush 逻辑
agent_end → turns >= flushMinTurns(6)? → no review ran? → flushMemories()
```

Flush 是一个轻量版的 review，只提取最关键的信息（用户偏好、环境事实），不生成 Skill。这确保了即使短会话也不会丢失重要记忆。

---

## 六、Hermione 参考实现：已验证的插件移植方案

### 6.1 项目概述

**Hermione**（`github.com/smilebank7/hermione`）是一个 OpenClaw 插件，完整移植了 Hermes Learning Loop 的所有核心功能。它证明了 Learning Loop **完全可以纯插件实现**，无需修改宿主 Agent 核心。

### 6.2 架构设计

```
Hermione (OpenClaw Plugin)
│
├── PART 1: Tool Progress Display
│   └── before_tool_call / after_tool_call 钩子
│   └── 工具执行计数 + Discord 进度推送
│
├── PART 2: Review / Flush Pipeline
│   ├── before_tool_call    → 计数工具调用，重置逻辑
│   ├── after_tool_call     → 检测 Skill 文件变更，验证写入
│   └── agent_end           → 触发 review 或 flush
│
│   Review Pipeline:
│   1. Read session transcript (增量式, cursor-based)
│   2. Load MEMORY.md + USER.md + skills index
│   3. Spawn review subagent (api.runtime.subagent.run)
│   4. Subagent 写入 via native tools (memory/skill_manage)
│   5. Detect changes (before/after diff)
│   6. Send Discord notification
│   7. Update review cursor
│
├── PART 3: Storage
│   ├── MemoryStore    → § 分隔符 + 多行条目 + 容量追踪
│   ├── SkillIndex     → YAML frontmatter + 双层缓存
│   └── Security       → 32 种威胁模式 + 5 类安全检查
```

### 6.3 关键设计决策

| 决策 | 实现方式 | 理由 |
|------|----------|------|
| **子 Agent 启动** | `api.runtime.subagent.run()` | OpenClaw 提供原生子 Agent API |
| **对话读取** | 增量 cursor-based | 高效，只读新内容 |
| **状态持久化** | `review-state.json` | 跨会话保持复盘位置 |
| **容量追踪** | `[67% — 1,474/2,200 chars]` | 让用户感知记忆使用情况 |
| **通知机制** | Discord 推送 | `"💾 +memory: 2 · +skill: deploy-aws"` |
| **写入验证** | before/after diff | 确保写入成功，失败可回滚 |

### 6.4 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `reviewModel` | string/null | null | 复盘专用模型（null=用主模型） |
| `maxIterations` | integer | 8 | Review Agent 最大迭代次数 |
| `memoryReviewTurns` | integer | 10 | Memory review 触发阈值 |
| `skillReviewCalls` | integer | 10 | Skill review 触发阈值 |
| `reviewCooldownMs` | integer | 300000 | 复盘冷却时间（5分钟） |
| `memoryCharLimit` | integer | 2200 | MEMORY.md 字符上限 |
| `userCharLimit` | integer | 1375 | USER.md 字符上限 |
| `flushMinTurns` | integer | 6 | Flush 最小轮数 |
| `reviewMaxMessages` | integer | 30 | 复盘最多读取的消息数 |

---

## 七、OpenCode 插件架构与可用钩子

### 7.1 OpenCode 钩子全景图

OpenCode 使用 **TypeScript/JavaScript 插件** 范式，钩子以 in-process 方式运行：

| 钩子 | 触发时机 | 用途 |
|------|----------|------|
| **`experimental.chat.system.transform`** | 构建 System Prompt 前 | **注入记忆快照**（对应 Hermes 的 system prompt 注入） |
| **`tool`** | 插件注册时 | **注册 memory 工具**（对应 Hermes 的 memory/skill_manage 工具） |
| **`experimental.session.compacting`** | 会话压缩前 | **保留记忆上下文**（对应 Hermes 的压缩时记忆保留） |
| `tool.execute.before` | 工具执行前 | 拦截/修改工具调用参数 |
| `tool.execute.after` | 工具执行后 | **计数工具调用** + 检测 Skill 变更 |
| `chat.message` | 收到用户消息时 | **计数用户消息** + 捕获用户输入 |
| `experimental.chat.messages.transform` | 发送消息前 | 修改完整消息历史 |
| `event` | 会话生命周期事件 | 监听 session.created / idle / compacted |
| `config` | 配置加载时 | 加载插件配置 |
| `command.execute.before` | 执行命令前 | 拦截 slash 命令 |

### 7.2 与 Hermes 钩子的映射关系

| Hermes 机制 | Hermes 实现方式 | OpenCode 对应钩子 | 可行性 |
|-------------|----------------|-------------------|--------|
| MEMORY.md/USER.md 注入 | `build_system_prompt()` 中嵌入 | `experimental.chat.system.transform` | ✅ 完全可行 |
| memory/skill_manage 工具 | `tools/registry.py` 注册 | `tool` 钩子 | ✅ 完全可行 |
| 用户消息计数 | `_turns_since_memory++` | `chat.message` 钩子 | ✅ 完全可行 |
| 工具调用计数 | `_iters_since_skill++` | `tool.execute.after` 钩子 | ✅ 完全可行 |
| 后台 Fork Agent | `_spawn_background_review()` | **需自建**（无原生 subagent API） | ⚠️ 需额外实现 |
| 会话结束 Flush | `agent_end` 钩子 | `experimental.session.compacting` + `session.idle` | ✅ 可行 |
| 压缩时保留上下文 | 内置于压缩流程 | `experimental.session.compacting` | ✅ 完全可行 |

### 7.3 与 OpenClaw 的关键差异

OpenCode **缺少一个关键能力**：`api.runtime.subagent.run`（OpenClaw 提供的子 Agent API）。

这意味着在 OpenCode 中启动后台复盘 Agent 需要**替代方案**：

| 方案 | 实现方式 | 复杂度 | 推荐度 |
|------|----------|--------|--------|
| **A: 直接调用 LLM API** | 用 OpenCode 的 provider 配置直接调 API | 低 | ⭐⭐⭐ 推荐 |
| **B: 异步 Task 队列** | 在插件内维护一个 async task queue | 中 | ⭐⭐ 备选 |
| **C: 利用 session.compacting** | 将复盘延迟到压缩时统一触发 | 低 | ⭐⭐ 简化版 |

---

## 八、OpenCode 迁移方案：完整技术设计

### 8.1 推荐方案：三钩子 + 直接 LLM 调用

基于 OpenCode 现有能力，推荐以下实现架构：

```
OpenCode Learning Loop Plugin (TypeScript)
│
├── 钩子 1: chat.message
│   └── turnsSinceMemory++
│   └── 检查是否达到 memoryReviewTurns 阈值
│   └── 达到? → 标记 pendingMemoryReview = true
│
├── 钩子 2: tool.execute.after  
│   └── callsSinceSkill++
│   └── 检查是否达到 skillReviewCalls 阈值
│   └── 达到? → 标记 pendingSkillReview = true
│
├── 钩子 3: experimental.session.compacting
│   └── 在会话压缩前执行 pending review
│   └── 或者: session.idle 事件触发
│
└── 复盘执行引擎（插件内部）
    ├── 读取增量对话历史（从上次 cursor 位置）
    ├── 读取 MEMORY.md + USER.md + skills 索引
    ├── 直接调用 LLM API（使用 OpenCode 的 provider 配置）
    ├── 让 LLM 决定调用 memory/skill_manage 工具
    ├── 工具调用通过 tool.execute.before/after 拦截执行
    ├── 验证写入结果（diff 检查）
    └── 更新 review cursor
```

### 8.2 核心代码设计

```typescript
// plugin.ts - OpenCode Learning Loop Plugin

import type { Plugin } from "@opencode-ai/plugin";
import { OpenAI } from "openai";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── 配置与默认值 ──
const CONFIG = {
  memoryReviewTurns: 10,
  skillReviewCalls: 10,
  reviewCooldownMs: 5 * 60 * 1000,
  maxIterations: 8,
  memoryCharLimit: 2200,
  userCharLimit: 1375,
  flushMinTurns: 6,
  reviewMaxMessages: 30,
};

// ── 状态管理 ──
interface ReviewState {
  turnsSinceMemory: number;
  callsSinceSkill: number;
  lastReviewAt: number;
  reviewCursor: number;       // 上次复盘读到的消息索引
  pendingMemoryReview: boolean;
  pendingSkillReview: boolean;
}

const state: ReviewState = {
  turnsSinceMemory: 0,
  callsSinceSkill: 0,
  lastReviewAt: 0,
  reviewCursor: 0,
  pendingMemoryReview: false,
  pendingSkillReview: false,
};

// ── Review Prompt 模板 ──
const MEMORY_REVIEW_PROMPT = `Review the conversation below and decide if anything should be saved to persistent memory.

Focus on:
1. User preferences, habits, communication style
2. Environment facts (OS, tools, project structure)
3. Workflow conventions and team agreements
4. Problems encountered and their solutions

Criteria:
- Will this information be useful in future conversations?
- Is it hard to re-discover?
- Is it not already in existing memory?

If valuable, call the memory tool to save it. If USER.md needs updating, do so.`;

const SKILL_REVIEW_PROMPT = `Review the conversation and determine if a reusable skill should be created.

Criteria for creating a skill:
1. Was the approach non-trivial? (not just simple queries)
2. Was there trial and error? (valuable methodology)
3. Did it succeed? (failed attempts aren't worth saving)
4. Is it likely to be reused? (task-specific one-offs aren't)

If all conditions are met, call skill_manage to create a SKILL.md.`;

// ── 插件主入口 ──
const LearningLoopPlugin: Plugin = {
  // 钩子 1: 用户消息计数 + memory review 标记
  "chat.message": async (input, output) => {
    state.turnsSinceMemory++;
    
    if (state.turnsSinceMemory >= CONFIG.memoryReviewTurns) {
      state.pendingMemoryReview = true;
      state.turnsSinceMemory = 0;
    }
  },

  // 钩子 2: 工具调用计数 + skill review 标记
  "tool.execute.after": async (input, output) => {
    // 只计数 memory/skill_manage 之外的工具（避免循环）
    const toolName = input.call?.name;
    if (toolName === "memory" || toolName === "skill_manage") {
      state.callsSinceSkill = 0; // 重置：Agent 已主动维护
      return;
    }
    
    state.callsSinceSkill++;
    
    if (state.callsSinceSkill >= CONFIG.skillReviewCalls) {
      state.pendingSkillReview = true;
      state.callsSinceSkill = 0;
    }
  },

  // 钩子 3: 会话压缩时触发复盘
  "experimental.session.compacting": async (input, output) => {
    await executePendingReview(input);
    
    // 将记忆上下文注入压缩摘要
    const memoryContext = loadMemoryContext();
    if (memoryContext) {
      output.context.push(memoryContext);
    }
  },

  // 钩子 4: 注册 memory 工具
  "tool": async (input, output) => {
    output.tools.push({
      name: "memory",
      description: "Manage persistent memory...",
      parameters: {
        action: { enum: ["add", "replace", "remove", "read", "stage", "commit_stage", "status"] },
        target: { enum: ["memory", "user"] },
        content: { type: "string" },
        old_text: { type: "string" },
        new_content: { type: "string" },
      },
      execute: async (params) => {
        return await executeMemoryTool(params);
      },
    });
    
    output.tools.push({
      name: "skill_manage",
      description: "Manage skills...",
      // ...
    });
  },

  // 钩子 5: System Prompt 注入记忆快照
  "experimental.chat.system.transform": async (input, output) => {
    const memoryBlock = buildMemoryBlock();
    output.system.push(memoryBlock);
  },

  // 事件监听：session 生命周期
  "event": async (input, output) => {
    if (input.event === "session.idle") {
      // 空闲时触发 pending review
      await executePendingReview(input);
    }
    if (input.event === "session.created") {
      // 新会话时重置计数器
      loadReviewState();
    }
  },
};

// ── 复盘执行引擎 ──
async function executePendingReview(input: any): Promise<void> {
  // 冷却检查
  const now = Date.now();
  if (now - state.lastReviewAt < CONFIG.reviewCooldownMs) return;
  
  const shouldReviewMemory = state.pendingMemoryReview;
  const shouldReviewSkills = state.pendingSkillReview;
  
  if (!shouldReviewMemory && !shouldReviewSkills) return;
  
  // 重置标记
  state.pendingMemoryReview = false;
  state.pendingSkillReview = false;
  state.lastReviewAt = now;
  
  // 读取增量对话历史
  const messages = input.messages || [];
  const newMessages = messages.slice(state.reviewCursor);
  
  // 构建 Review Prompt
  const reviewPrompt = buildReviewPrompt(shouldReviewMemory, shouldReviewSkills);
  
  // 直接调用 LLM API
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // 或从 OpenCode 配置读取
    baseURL: input.provider?.baseUrl,
  });
  
  const response = await client.chat.completions.create({
    model: input.model || "gpt-4o-mini", // 可以用更便宜的模型
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: reviewPrompt },
      ...newMessages.map(m => ({ role: m.role, content: m.content })),
    ],
    max_tokens: 4000,
    temperature: 0.3,
  });
  
  // 处理 LLM 的工具调用意图
  // 如果 LLM 输出 tool_call 请求 → 转换为实际工具调用
  await processReviewResponse(response);
  
  // 更新 cursor
  state.reviewCursor = messages.length;
  saveReviewState();
}

// ── 辅助函数 ──
function buildMemoryBlock(): string {
  const memoryPath = join(homedir(), ".config/opencode/memories/MEMORY.md");
  const userPath = join(homedir(), ".config/opencode/memories/USER.md");
  
  const memory = existsSync(memoryPath) ? readFileSync(memoryPath, "utf-8") : "";
  const user = existsSync(userPath) ? readFileSync(userPath, "utf-8") : "";
  
  return `<memory-context>\n## MEMORY\n${memory}\n\n## USER\n${user}\n</memory-context>`;
}

function buildReviewPrompt(memory: boolean, skills: boolean): string {
  if (memory && skills) return MEMORY_REVIEW_PROMPT + "\n\n" + SKILL_REVIEW_PROMPT;
  if (memory) return MEMORY_REVIEW_PROMPT;
  return SKILL_REVIEW_PROMPT;
}

async function executeMemoryTool(params: any): Promise<any> {
  // 实现 memory add/replace/remove/stage/commit_stage/status
  // ...
}

function saveReviewState(): void {
  const statePath = join(homedir(), ".config/opencode/learning-loop-state.json");
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function loadReviewState(): void {
  const statePath = join(homedir(), ".config/opencode/learning-loop-state.json");
  if (existsSync(statePath)) {
    const saved = JSON.parse(readFileSync(statePath, "utf-8"));
    Object.assign(state, saved);
  }
}

export default LearningLoopPlugin;
```

### 8.3 复盘触发策略对比

| 触发时机 | 优点 | 缺点 | 适用场景 |
|----------|------|------|----------|
| **session.compacting** | 利用现有事件，实现简单 | 延迟较大（需等压缩时） | 低频复盘场景 |
| **session.idle** | 空闲时触发，不占用资源 | 需要用户停止交互后才触发 | 实时性要求不高 |
| **消息/工具计数即时触发** | 最及时 | 需要插件内异步处理 | 高频场景 |
| **组合策略**（推荐） | 即时标记 + idle/compacting 执行 | 实现稍复杂 | 通用场景 |

**推荐**：组合策略
- 用 `chat.message` 和 `tool.execute.after` 计数并标记 pending
- 用 `session.idle` 或 `session.compacting` 执行实际复盘
- 这样既不阻塞主流程，又能及时触发

### 8.4 与 Hermione 的关键差异

| 维度 | Hermione (OpenClaw) | OpenCode 实现 | 影响 |
|------|-------------------|---------------|------|
| 子 Agent API | `api.runtime.subagent.run()` | 直接调用 LLM API | 需自建 review 引擎 |
| 对话读取 | 原生消息历史访问 | 通过 `input.messages` | 格式可能不同 |
| 工具执行 | 子 Agent 直接调用 | 需通过 `tool.execute.before` 拦截 | 需适配工具调用协议 |
| Provider 配置 | 继承 OpenClaw 配置 | 从 OpenCode 配置读取 | 需适配配置格式 |
| 通知机制 | Discord 推送 | 可选：TUI 状态更新 | 体验差异 |

---

## 九、关键挑战与风险分析

### 9.1 技术挑战

| 挑战 | 严重程度 | 解决方案 |
|------|----------|----------|
| **OpenCode 无原生 subagent API** | 高 | 直接调用 LLM API，自建 review 引擎 |
| **工具调用协议差异** | 中 | 适配 OpenCode 的工具注册格式 |
| **对话历史格式不兼容** | 中 | 通过 `input.messages` 读取并转换 |
| **Provider 配置读取** | 低 | 从 OpenCode 配置或环境变量读取 |
| **异步执行模型差异** | 中 | 使用 `session.idle`/`compacting` 替代即时 fork |

### 9.2 质量风险

| 风险 | 说明 | 缓解措施 |
|------|------|----------|
| **自我评估不可靠** | Agent 几乎总是认为"做得不错" | 引入外部验证（测试/人工反馈） |
| **低质量 Skill 积累** | Combined prompt 强制创建 Skill | 改为可选，设置置信度阈值 |
| **记忆污染** | Stage 区的低质量信息晋升到持久记忆 | 增加质量关卡和容量限制 |
| **成本膨胀** | 后台复盘消耗额外 Token | 使用更便宜的模型（如 gpt-4o-mini） |

### 9.3 Hermes 社区已知的结构性缺陷

1. **自我恭喜偏差**（Self-congratulation bias）：Agent 倾向于认为自己的工作很好，即使实际上有错误
2. **手动编辑覆盖**：Learning Loop 会覆盖用户手动调优的 Skill
3. **成本不透明**：后台复盘对主模型产生额外的 Token 消耗

---

## 十、实施路线图

### Phase 1：基础框架（第 1-2 周）

| 任务 | 交付物 | 验证方式 |
|------|--------|----------|
| 搭建 TypeScript 插件项目结构 | `src/index.ts` + `package.json` | `npm run build` 成功 |
| 实现 `experimental.chat.system.transform` 钩子 | MEMORY.md/USER.md 注入 | 在 System Prompt 中可见 |
| 实现 `tool` 钩子注册 memory/skill_manage 工具 | 工具 Schema + 执行函数 | 模型可调用 |
| 实现 MemoryStore 读写 | `~/.config/opencode/memories/` 管理 | 文件读写正确 |
| 状态持久化 | `learning-loop-state.json` | 跨会话保留 |

### Phase 2：计数器与触发（第 2-3 周）

| 任务 | 交付物 | 验证方式 |
|------|--------|----------|
| `chat.message` 用户消息计数 | turnsSinceMemory 计数器 | 日志中可见递增 |
| `tool.execute.after` 工具调用计数 | callsSinceSkill 计数器 | 日志中可见递增 |
| 阈值检查与 pending 标记 | 达到阈值时标记 review | 日志输出 |
| `session.idle` 事件监听 | idle 时触发 review | 空闲后自动触发 |
| 冷却时间保护 | 5 分钟 cooldown | 连续触发测试 |

### Phase 3：复盘引擎（第 3-4 周）

| 任务 | 交付物 | 验证方式 |
|------|--------|----------|
| 增量式对话历史读取 | cursor-based 消息切片 | 只读新消息 |
| Review Prompt 模板 | MEMORY_REVIEW_PROMPT + SKILL_REVIEW_PROMPT | LLM 输出合理 |
| LLM API 直接调用 | 使用 OpenCode provider 配置 | 调用成功 |
| 工具调用结果处理 | 解析 LLM 的 tool_call 意图 | 写入正确 |
| 写入验证与 diff | before/after 比较 | 确保写入成功 |
| Flush 机制 | 短会话补漏 | `< 6 turns` 时触发 |

### Phase 4：优化与打磨（第 4-5 周）

| 任务 | 交付物 | 验证方式 |
|------|--------|----------|
| Stage 暂存区 | STAGE.md 两阶段决策 | 低置信度信息先 stage |
| 容量追踪与可视化 | `[67% — 1,474/2,200 chars]` | System Prompt 中可见 |
| 安全扫描 | 32 种威胁模式 | 恶意内容被拒绝 |
| 配置项暴露 | 用户可自定义阈值 | 修改配置后生效 |
| 质量门槛 | 置信度检查 | 低质量内容不写入 |

---

## 结论

Hermes Learning Loop 的底层机制——**双计数器触发 + 后台 Fork + 增量快照 + Review Prompt + 工具写入 + 结果反馈**——是一个经过生产验证的完整流水线。Hermione 项目已证明这套机制完全可以以**纯插件方式**实现，无需修改宿主 Agent 核心。

OpenCode 的插件钩子体系虽然缺少原生的 subagent API，但提供了**所有必要的扩展点**来实现等效功能。通过 `chat.message` + `tool.execute.after` 实现计数器，`experimental.session.compacting` + `session.idle` 实现触发，直接调用 LLM API 实现复盘引擎，完全可以在 OpenCode 中复刻 Hermes Learning Loop 的核心体验。

**最关键的设计决策**：
1. 使用 **session.idle/compacting** 替代即时 Fork，避免阻塞主流程
2. 使用 **更便宜的模型**（如 gpt-4o-mini）运行复盘，降低成本
3. 引入 **Stage 暂存区**和**置信度门槛**，防止记忆污染
4. 采用 **增量 cursor-based** 对话读取，保证性能

预计完整实现可在 **4-5 周**内完成，将为 OpenCode 带来质的飞跃——从"编码助手"进化为"越用越懂你的智能伙伴"。
