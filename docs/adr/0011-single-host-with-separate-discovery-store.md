---
status: accepted
date: 2026-11-15
---

# 单机部署并为资讯设置独立 SQLite 库

云端采用单台服务器、一套 Docker Compose 和一个对外域名。网页服务与后台采集任务均属于 `code/` 工程，部署在同一服务器；资讯及信源配置使用独立资讯 SQLite 库，身份与个人学习状态使用学习状态库，公共课程目录由 Git 管理。

用户选择单机运维简单的方案，并接受单机容量和可用性边界。访谈考虑过采用 PostgreSQL 为多实例扩展准备，当前选择的代价是后续规模超出单机能力时需要另行设计迁移。

本决定扩展 [ADR 0003](./0003-self-hosted-nextjs-and-sqlite.md) 的数据存储范围，明确新增资讯数据的归属。SQLite 数据位于部署主机的持久化磁盘；学习状态与资讯的备份恢复、任务并发及写入协调需要在实施设计中覆盖。

决定依据见 [设计讨论 Q10](../plans/cloud-content-design.md)。Q16 已确认整体架构，正式设计见 [plan](../plans/plan.md)，实施状态见 [任务 Phase 9](../plans/tasks.md#phase-9-云端资讯与学习衔接)，数据归属规则已同步至 [AGENTS.md](../../AGENTS.md)。
