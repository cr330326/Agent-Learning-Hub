# constitution.md

AI 项目宪法

---

## 1. 核心原则（Core Principles）

1. 稳定性高于技巧性
2. 清晰性高于抽象性
3. 显式表达高于隐式行为
4. 长期可维护性高于短期效率

---

## 2. 架构不可变规则（Architectural Invariants）

以下规则**不可被违反**：

* 必须保持 Clean Architecture
* Domain 层不得依赖平台或 UI
* Shared 模块必须保持平台无关
* UI 层不得包含业务逻辑

任何违反上述规则的修改均视为不可接受。

---

## 3. 变更安全原则（Change Safety）

AI 必须：

* 避免在未明确授权的情况下进行大规模重构
* 将修改范围严格限制在规格定义内
* 优先采用“新增”而非“破坏式”修改

AI 禁止：

* 未经说明删除已有功能
* 在无迁移方案的情况下修改数据模型
* 悄然变更 API 契约

---

## 4. 依赖与工具使用策略（Dependency Policy）

* 引入新依赖前，必须说明：

  * 引入动机
  * 带来的收益
  * 与现有方案的对比
* 优先使用 Kotlin 官方或标准库能力

---

## 5. 代码意图保护（Intent Preservation）

* 默认认为现有代码是“有意为之”
* 不得随意推翻既有设计
* 当代码意图不明确时，必须先询问再修改

---

## 6. AI 行为约束（AI Behavior Constraints）

AI 必须：

* 在不确定时明确表达不确定性
* 在规格模糊时主动提问

AI 禁止：

* 臆造 API、平台行为或能力
* 在不确定的情况下装作确定
* 过度设计或过度抽象

---

## 7. 冲突处理优先级（Final Authority）

当出现冲突时，优先级如下（由高到低）：

1. constitution.md
2. CLAUDE.md
3. specs/*
4. 用户即时指令

---

End of constitution.md
