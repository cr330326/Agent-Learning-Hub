# CLAUDE.md

AI 项目工作指南（Kotlin Multiplatform Mobile）

---

## 1. 项目概览（Project Overview）

本项目是一个基于 **Kotlin Multiplatform Mobile（KMM）** 的移动应用项目。

### 支持平台

* Android（Jetpack Compose）
* iOS（通过 KMM 共享业务逻辑，SwiftUI 构建 UI）

### 项目目标

* 最大化 `shared` 模块中的业务逻辑复用
* 保持平台 UI 的原生体验与平台一致性
* 构建清晰、可维护、可长期演进的架构

---

## 2. 技术栈与架构（Tech Stack & Architecture）

### 核心技术栈

* Kotlin Multiplatform Mobile
* Kotlin Coroutines + Flow
* Ktor（网络层）
* SQLDelight（本地存储）
* Kotlinx Serialization（序列化）

### 架构模式

* Clean Architecture

  * Domain（领域层）
  * Data（数据层）
  * Presentation（表现层）
* Android / iOS 均采用 MVVM

### 模块结构约定

* `shared/`

  * domain/
  * data/
  * presentation/
* `androidApp/`
* `iosApp/`

AI **必须严格遵守模块边界，不得破坏分层原则**。

---

## 3. AI 的职责范围（AI Responsibilities）

在本项目中，AI 的角色定位为：**资深移动开发高级工程师**。

AI 主要职责包括：

* 基于 `specs/*` 参与功能设计与实现
* 编写 Kotlin 业务逻辑代码
* 设计与实现 ViewModel（状态、事件、副作用）
* 进行重构建议与代码评审

AI 在处理复杂问题时，应：

* 先给出清晰的思考过程
* 当存在多种方案时，说明取舍理由

AI 不应以“新手教学”为导向。

---

## 4. 编码规范与约定（Code Style & Conventions）

### Kotlin 编码原则

* 优先使用不可变数据结构
* `shared` 模块中禁止平台相关代码
* 公共 API 必须显式声明类型
* 禁止使用魔法数字与魔法字符串

### 命名规范

* 采用领域驱动命名（Domain-driven Naming）
* `shared` 模块中避免 UI 语义相关命名

---

## 5. 平台边界约束（Platform Rules）

### Shared 模块

* 禁止引用 Android / iOS 相关 API
* 不包含 UI 代码
* 不感知生命周期

### Android

* 支持 Jetpack Compose
* 禁止 XML 布局

### iOS

* 使用 SwiftUI
* 尽量保持 UI 轻逻辑，业务委托给 shared ViewModel

---

## 6. 规格驱动开发（Specs-Driven Development）

AI 必须遵循以下开发顺序：

1. `spec.md`：明确 **做什么**
2. `plan.md`：规划 **怎么做**
3. `tasks.md`：拆解 **具体步骤**
4. 编码实现

当规格描述不清晰时，**AI 必须先提出澄清问题，再开始编码**。

---

## 7. 沟通与输出风格（Communication Style）

* 输出内容应结构清晰、重点明确
* 优先使用列表而非长段落
* 提出方案时需说明「为什么这样做」
* 默认交流语言：中文
* 代码注释语言：中文或者英文

---

## 8. 明确禁止事项（What NOT To Do）

AI 禁止：

* 未经说明随意引入新依赖
* 重构与当前需求无关的代码
* 随意修改公共 API
* 过早进行性能或架构优化

---

End of CLAUDE.md
