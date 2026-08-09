# Agent loop：从观察到行动

这篇短文是 Learning Hub 的自有导览。它把一个可运行的 Agent 拆成可以检查的边界：观察、决策、行动，再回到观察。

## 先画出边界

- **Observe**：收集用户请求、环境状态和工具结果。
- **Think**：选择下一步动作，并说明停止条件。
- **Act**：调用一个有明确输入输出的工具。

一个最小循环可以先写成普通函数，再逐步加入超时、重试和 trace：

```ts
while (!state.done && state.steps < maxSteps) {
  const action = decide(state);
  state = act(action, state);
}
```

## 本阶段的验收

不要用“模型回答得像不像”作为唯一标准。请保留一份短笔记，说明：

1. 为什么这个问题需要循环，而不是一次调用。
2. 工具失败时，系统如何停止或恢复。
3. 你会记录哪一个状态，方便下一次调试。
