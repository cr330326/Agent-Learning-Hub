# Hermes Agent 深度解析报告 — 记忆系统核心机制

---

## 一、Hermes 是什么

**Hermes Agent** 是由 NousResearch 于 2026 年 2 月底开源的 AI Agent 框架，GitHub 星数在两个月内突破 14 万。它的核心定位是 **"与你共同成长的自进化个人智能体"（The agent that grows with you）**。

与 OpenClaw（多智能体协同调度框架）不同，Hermes 的核心差异化在于：
- **内置学习闭环**：Agent 能从任务执行中自动生成 Skill、改进 Skill、持久化知识
- **原生持久记忆系统**：跨 Session 的记忆保持能力，无需手动配置
- **策展式记忆管理**：Agent 主动决定什么值得记住，而非全量记录
- **冻结快照模式**：系统提示词在会话内保持不变，最大化 LLM Prefix Cache 命中率

支持 200+ 模型（OpenAI、Claude、OpenRouter、NVIDIA NIM、Kimi/Moonshot、MiniMax 等），可通过 `hermes model` 一键切换。部署方式从轻量（$5 VPS）到集群均可。

---

## 二、核心原理概览

### 2.1 四层记忆架构

Hermes 的记忆系统被设计为一个四层栈（实际代码中更复杂，但教学上常用四层模型）：

| 层级 | 名称 | 存储内容 | 技术实现 | 生效时机 |
|------|------|----------|----------|----------|
| **Layer 1** | 常驻提示记忆 | 环境事实、用户偏好、工作规范 | `MEMORY.md` + `USER.md` (~3,575 字符硬限制) | 每次会话开始时注入系统提示词 |
| **Layer 2** | 会话归档 | 完整对话历史 | SQLite + FTS5 全文索引 | 按需通过 `session_search` 工具检索 |
| **Layer 3** | Skill 记忆 | 可复用的任务执行方法论 | `~/.hermes/skills/*.md` | 默认只加载索引，使用时按需加载全文 |
| **Layer 4** | 外部记忆提供者 | 深度用户建模 (可选) | Honcho / Mem0 / Hindsight 等插件 | 实时查询，通过 MemoryProvider ABC 接入 |

### 2.2 核心设计原则

1. **有界 (Bounded)**：严格的字符限制 (MEMORY.md: 2,200 字符 / USER.md: 1,375 字符)，强迫 Agent 做信息筛选和压缩，而非无差别存储
2. **策展式 (Curated)**：Agent 主动决定保存什么，而非自动录制一切
3. **缓存友好 (Cache-Friendly)**：冻结快照 + 用户角色注入，不破坏 Anthropic `system_and_3` 等缓存策略

### 2.3 学习闭环 (Learning Loop)

```
用户交互 -> 行为记录 -> 结果评估 -> 策略优化 -> Skill 沉淀 -> 记忆固化
     ^                                                        |
     |_________________________ 下次会话复用 ___________________|
```

---

## 三、MEMORY.md 与 USER.md -- 初始化与加载流程 (重点)

### 3.1 文件定位与默认内容

两个文件默认存放在 `~/.hermes/memories/` 目录下：

| 文件 | 用途 | 字符上限 | 内容示例 |
|------|------|----------|----------|
| **MEMORY.md** | Agent 的"个人笔记" | ~2,200 字符 (~800 tokens) | 项目路径、环境配置、工具使用惯例、踩坑记录 |
| **USER.md** | Agent 的"用户档案" | ~1,375 字符 (~500 tokens) | 用户名、时区、沟通风格偏好、技术背景 |

**初始化时，如果文件不存在，Hermes 会自动创建空文件。** 没有预置的默认模板内容 -- 记忆完全从实际交互中积累。

### 3.2 Session 启动时的加载流程

当创建新 Session 时，Hermes 按以下顺序构建系统提示词 (`AIAgent._build_system_prompt()`)：

```
系统提示词构建顺序 (13 层)：

 1. SOUL.md -- Agent 身份定义 (~/.hermes/SOUL.md，不存在则用 DEFAULT_AGENT_IDENTITY)
 2. 工具使用强制指导 -- 按模型族过滤 (TOOL_USE_ENFORCEMENT_GUIDANCE)
 3. 模型特定执行指导 -- OpenAI/Google 等专用
 4. 用户/Gateway 系统消息
 5. Memory 使用指导 -- MEMORY_GUIDANCE (告诉模型如何用 memory 工具)
 6. MEMORY 快照 -- ~/.hermes/memories/MEMORY.md (冻结)
 7. USER PROFILE 快照 -- ~/.hermes/memories/USER.md (冻结)
 8. 外部 Memory Provider 块 -- Honcho/Mem0 等 (若启用)
 9. Skills 索引 -- 扫描 ~/.hermes/skills/ 生成
10. 项目上下文文件 -- .hermes.md -> AGENTS.md -> CLAUDE.md -> .cursorrules
11. 会话元数据 -- 时间戳、Model、Provider、Session ID
12. 平台提示 -- PLATFORM_HINTS[platform]
13. 会话上下文 -- Gateway 注入的来源信息
```

**关键代码** (`agent/prompt_builder.py` + `run_agent.py`)：

```python
# 第 6-7 层的注入实现
# MEMORY.md 和 USER.md 在会话开始时被读取一次，嵌入为不可变块

from tools.memory_tool import ENTRY_DELIMITER  # "\n§\n"

def _render_memory_block(memory_text: str, user_text: str) -> str:
    block = "== MEMORY (your personal notes) ==\n"
    block += f"{memory_text}\n"
    block += "§\n"  # 分隔符
    block += "== USER PROFILE ==\n"
    block += f"{user_text}\n"
    return block
```

### 3.3 冻结快照模式 (Frozen Snapshot Pattern) -- 最关键的设计

```
+-------------------------------------------------------------+
|                    Session 开始时刻                           |
|  +-------------+    +-------------+                         |
|  | MEMORY.md   |    |  USER.md    |   <- 从磁盘读取          |
|  | (磁盘文件)   |    | (磁盘文件)   |                         |
|  +------+------+    +------+------+                         |
|         |                   |                               |
|         +--------+----------+                               |
|                  |                                          |
|                  v                                          |
|  +-------------------------------------+                    |
|  |      System Prompt 构建              |                    |
|  |  (MEMORY + USER 嵌入为固定文本)       |                    |
|  +-------------------------------------+                    |
|                  |                                          |
|                  v                                          |
|  +-------------------------------------+                    |
|  |      LLM Prefix Cache 生效           |<- 整个会话复用      |
|  |      (系统提示词哈希不变)              |     节省 ~75% Token |
|  +-------------------------------------+                    |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
|                    Session 进行中                             |
|                                                             |
|  memory tool 调用 --> 写入磁盘 --> System Prompt 不变          |
|  (add/replace/remove)  (实时持久化)   (保护 Prefix Cache)      |
|                                                             |
|  下次新 Session 启动时才重新读取 MEMORY.md / USER.md          |
+-------------------------------------------------------------+
```

**为什么必须冻结？**

| 维度 | 实时注入 | 冻结快照 |
|------|---------|---------|
| 记忆实时性 | 写入立即生效 | 下一个 session 生效 |
| Prefix Cache | 每次写入失效 | Session 内始终稳定 |
| Token 成本 | 写入次数 x 系统提示词 Token | 接近零增量 |
| 一致性 | 同 Session 内提示词变化 | 同 Session 内提示词稳定 |

实测：冻结快照模式可节省 **45%-57%** 的 Token 成本。

---

## 四、Memory Tool 工作流程 (核心重点)

### 4.1 Tool 定义与暴露

`memory` 是 Hermes 内置的核心工具，定义在 `tools/memory_tool.py` 中，通过 `tools/registry.py` 注册到 Tool Registry。

**Schema (暴露给 LLM 的工具描述)：**

```json
{
  "name": "memory",
  "description": "Manage persistent memory across sessions. Actions: add, replace, remove, read. Target 'memory' for agent notes, 'user' for user profile. Entries separated by section sign delimiter.",
  "parameters": {
    "action": {"enum": ["add", "replace", "remove", "read"]},
    "target": {"enum": ["memory", "user"]},
    "content": {"type": "string", "description": "For add/replace"},
    "old_text": {"type": "string", "description": "For replace/remove - substring match"},
    "new_content": {"type": "string", "description": "For replace"}
  }
}
```

**关键设计决策：**
- **没有独立的 read action 调用** -- 因为记忆已经在 system prompt 中了
- **substring 匹配** (非 ID 匹配): `replace` 和 `remove` 通过 `old_text` 子串定位条目
- **section sign 分隔符**: 条目之间用 section sign 字符分隔，支持多行条目

### 4.2 MemoryTool 类核心流程

```python
class MemoryStore:
    def __init__(self):
        self.memory_entries = []   # MEMORY.md 的内存副本
        self.user_entries = []     # USER.md 的内存副本
        self.memory_char_limit = 2200
        self.user_char_limit = 1375
    
    # -- 文件锁 (跨进程安全) --
    @contextmanager
    def _file_lock(self, path: Path):
        # 使用 fcntl (Unix) 或 msvcrt (Windows) 实现进程级文件锁
        ...
    
    # -- 增删改查 --
    def add(self, target, content) -> Dict:
        # 追加新条目，超限时拒绝
    
    def replace(self, target, old_text, new_content) -> Dict:
        # 子串匹配替换条目
    
    def remove(self, target, old_text) -> Dict:
        # 子串匹配删除条目
    
    def read(self, target) -> List[str]:
        # 返回当前条目列表 (给 tool response 用)
    
    def save_to_disk(self, target):
        # 原子写入: temp file -> os.replace (保证并发安全)
```

### 4.3 一轮对话中的完整 Memory 流程

```
+------------------------------------------------------------------+
|                      完整 Turn 流程                                |
|                                                                  |
|  Step 0: Session 初始化                                           |
|  +----------------------------------------------------------+   |
|  |  1. 读取 ~/.hermes/memories/MEMORY.md -> memory_entries   |   |
|  |  2. 读取 ~/.hermes/memories/USER.md   -> user_entries     |   |
|  |  3. 构建 System Prompt (冻结快照)                          |   |
|  |  4. 提交给 LLM                                              |   |
|  +----------------------------------------------------------+   |
|                           |                                      |
|                           v                                      |
|  Step 1: Pre-turn (MemoryManager.prefetch_all)                   |
|  +----------------------------------------------------------+   |
|  |  1. 内置 Provider: 无需 prefetch (已在 system prompt)      |   |
|  |  2. 外部 Provider (如 Honcho): 异步召回相关记忆             |   |
|  |  3. 构建 <memory-context> 块注入本轮上下文                    |   |
|  +----------------------------------------------------------+   |
|                           |                                      |
|                           v                                      |
|  Step 2: LLM 推理                                                 |
|  +----------------------------------------------------------+   |
|  |  LLM 看到: System Prompt (含冻结记忆) + 历史对话 + 新消息    |   |
|  |  LLM 输出: assistant message，可能包含 tool_calls            |   |
|  +----------------------------------------------------------+   |
|                           |                                      |
|                           v                                      |
|  Step 3: Tool 执行 (如果 LLM 调用了 memory tool)                  |
|  +----------------------------------------------------------+   |
|  |  LLM 输出:                                                  |   |
|  |  {                                                          |   |
|  |    "action": "add",                                         |   |
|  |    "target": "memory",                                      |   |
|  |    "content": "User prefers dark mode in all editors"       |   |
|  |  }                                                          |   |
|  |                                                             |   |
|  |  MemoryTool.add() 执行流程:                                 |   |
|  |  1. 安全检查: _scan_memory_content() 扫描注入/渗透攻击       |   |
|  |  2. 获取文件锁 _file_lock()                                  |   |
|  |  3. 重新从磁盘读取 (防并发修改) _reload_target()             |   |
|  |  4. 查重检查 (内容已存在则跳过)                             |   |
|  |  5. 容量检查 (超限则拒绝，返回当前条目列表)                  |   |
|  |  6. 追加条目到内存列表                                      |   |
|  |  7. 原子写入磁盘 save_to_disk()                             |   |
|  |     (temp file -> os.replace)                               |   |
|  |  8. 返回 Tool Result (含最新容量使用率)                     |   |
|  +----------------------------------------------------------+   |
|                           |                                      |
|                           v                                      |
|  Step 4: Post-turn (MemoryManager.sync_all)                     |
|  +----------------------------------------------------------+   |
|  |  1. 内置 Provider: sync_turn(user_msg, assistant_response) |   |
|  |     (分析本轮对话，提取值得记忆的信息)                       |   |
|  |  2. 外部 Provider: 同步写入各自的存储后端                    |   |
|  +----------------------------------------------------------+   |
|                           |                                      |
|                           v                                      |
|  Step 5: Periodic Nudge (定期自我提醒)                            |
|  +----------------------------------------------------------+   |
|  |  1. 每 nudge_interval 分钟 (默认 10 分钟)                   |   |
|  |  2. 系统自动发送内部 prompt: "回顾近期操作，什么值得写入记忆?" |
|  |  3. Agent 自主决定调用 memory tool 固化知识                  |   |
|  +----------------------------------------------------------+   |
+------------------------------------------------------------------+
```

### 4.4 安全检查机制

`memory_tool.py` 中定义了 `_MEMORY_THREAT_PATTERNS`，在每次写入前扫描：

1. **Prompt Injection**: `ignore previous instructions`, `you are now...`
2. **数据渗透**: `curl ... $SECRET_KEY`, `wget ... $TOKEN`
3. **持久化后门**: 写入 shell rc 文件、crontab 等
4. **不可见 Unicode**: 零宽字符等

如果检测到威胁，写入会被拒绝并返回错误信息。

### 4.5 容量管理与压缩

当记忆接近上限时，Agent 会主动进行"记忆整理"：

```
触发条件: 新条目加入后总字符数 > limit

响应策略:
1. 拒绝写入，返回当前所有条目
2. Agent 收到后，可以选择:
   a. 用 replace 合并/精简已有条目
   b. 用 remove 删除低价值条目
   c. 放弃写入

Agent 的压缩策略示例:
- "User likes VS Code" + "User uses dark theme in VS Code" 
  -> "User uses VS Code with dark theme"
- "Server runs on port 3000" + "Server uses nginx reverse proxy"
  -> "Server: nginx -> localhost:3000"
```

---

## 五、需要特别注意的设计细节

### 5.1 双状态设计 (核心工程技巧)

Memory 系统存在两种状态：
1. **System Prompt 中的副本**: 会话开始时加载，整个会话不变 (保护 cache)
2. **Tool Response 中的实时状态**: 每次 tool 调用后返回最新磁盘内容

这意味着 Agent 在写入新记忆后，**同一轮对话中不会立即"感受到"新记忆** -- 它下一轮看到 tool result 才知道写入成功。这是一种刻意的一致性 trade-off。

### 5.2 原子写入保证

```python
def atomic_replace(path: Path, content: str):
    """先写临时文件，再 os.replace 原子替换"""
    temp_path = path.with_suffix('.tmp')
    temp_path.write_text(content)
    os.replace(temp_path, path)  # 原子操作
```

并发读者要么看到完整旧文件，要么看到完整新文件 -- 不会读到空文件或半写状态。

### 5.3 Profile 隔离

通过 `HERMES_HOME` 环境变量实现多实例隔离：
- 日常工作 Profile: `HERMES_HOME=~/.hermes-work`
- 数据分析 Profile: `HERMES_HOME=~/.hermes-data`
- 每个 Profile 有独立的 MEMORY.md、USER.md、state.db

### 5.4 外部 Provider 限制

同一时间**只能激活一个外部 memory provider** (防止 tool schema 膨胀和冲突)。通过 `MemoryManager` 强制执行：

```python
def add_provider(self, provider: MemoryProvider):
    if provider.name != "builtin" and self._has_external:
        logger.warning("External provider already exists, rejecting %s", provider.name)
        return  # 拒绝
    ...
```

---

## 六、主流解读文章推荐

### 6.1 中文深度解析 (推荐优先级排序)

| 文章 | 作者 | 特点 |
|------|------|------|
| **[Hermes 三层记忆机制彻底拆解](https://blog.csdn.net/RickyIT/article/details/160347751)** | CSDN RickyIT | 最系统的中文拆解，从认知科学类比到代码实现，含完整对比表 |
| **[Hermes Agent 30分钟部署实战](https://watermelonwater.tech/insights/hermesagent30%E5%88%86%E9%92%9F%E4%B8%8A%E6%89%8B%E6%B5%8B%E8%AF%95%E6%8C%87%E5%8D%97/)** | watermelonwater | 实战导向，含与 OpenClaw 对比表格 |
| **[深度拆解 Hermes Agent，动态 Prompt 与 Learning Loop 架构](https://blog.csdn.net/u013970991/article/details/160250208)** | CSDN | 重点分析 Prompt 动态组装和冻结快照机制 |
| **[5天狂揽3万星的 Hermes Agent 到底是个啥](https://developer.cloud.tencent.com/article/2656403)** | 腾讯云开发者社区 | 入门级全景介绍 |
| **[Hermes Agent 架构拆解：记忆、检索与 Skill](https://www.51cto.com/article/840555.html)** | 51CTO | 重点分析冻结快照和原子写入的工程实现 |
| **[Hermes Agent 的全方位深度拆解分析](https://juejin.cn/post/7625829714865078326)** | 掘金 | 含技术架构图和 RL 训练部分 |

### 6.2 英文深度解析

| 文章 | 特点 |
|------|------|
| **[I Read Hermes Agent's Memory System, and It Fixes What OpenClaw Got Wrong](https://tool.lu/en_US/article/7Io/detail)** | 英文社区经典解读，聚焦记忆系统设计哲学 |
| **[Hermes Agent Deep Dive & Build-Your-Own Guide](https://dev.to/truongpx396/hermes-agent-deep-dive-build-your-own-guide-1pcc)** | dev.to 长文，含 System Prompt Assembly 和完整 Memory 机制 |
| **[Agent Loop and Prompt Assembly](https://github.com/cclank/Hermes-Wiki/blob/master/concepts/agent-loop-and-prompt-assembly.md)** | Hermes Wiki 社区文档，系统提示词 13 层组装顺序的权威参考 |
| **[Is Hermes Replacing Lobster? The 40000-Star Hermes Agent](https://eu.36kr.com/en/p/3764418640003840)** | 36Kr 英文版，从产品设计角度分析四层记忆架构 |

### 6.3 学术/技术文档

| 文档 | 来源 | 特点 |
|------|------|------|
| **[Persistent Memory 官方文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)** | NousResearch 官方 | 最权威，含最新配置参数和行为说明 |
| **[Memory Providers 官方文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers)** | NousResearch 官方 | Honcho/Mem0 等外部 provider 接入指南 |
| **[GitHub Discussions](https://github.com/NousResearch/hermes-agent/discussions)** | GitHub | 社区实践经验 |

---

## 七、关键文件索引

| 文件路径 | 作用 |
|----------|------|
| `tools/memory_tool.py` | MemoryTool 主实现 (add/replace/remove/read) |
| `agent/memory_manager.py` | MemoryManager 编排器 (多 provider 管理) |
| `agent/memory_provider.py` | MemoryProvider ABC (外部 provider 接口) |
| `agent/prompt_builder.py` | System Prompt 组装 (13 层顺序) |
| `run_agent.py` | Agent 主循环 (turn 生命周期) |
| `~/.hermes/memories/MEMORY.md` | Agent 笔记持久化文件 |
| `~/.hermes/memories/USER.md` | 用户画像持久化文件 |

---

## 八、总结

Hermes 的记忆系统是其"自我进化"能力的核心基础设施。理解它的三个关键点：

1. **冻结快照是性能基石**: 通过牺牲记忆实时性换取 Prefix Cache 稳定性，是工程上的精妙取舍
2. **策展式而非记录式**: Agent 主动决定什么值得记住，强迫信息压缩 -- 这让记忆更精炼、更有价值
3. **Tool 驱动的自我更新**: Agent 通过调用自己的 memory tool 来管理记忆，形成了"学习-固化-复用"的完整闭环

这套设计对构建具有长期记忆能力的 Agent 系统有重要参考价值 -- 尤其是如何在 LLM 无状态特性和有状态交互需求之间找到工程平衡点。
