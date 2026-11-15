# DeepSeek 真实调用验证

日期：2026-11-15（北京时间）。配置读取自 `/Users/vsh9p8q/.agent-learnning/environments/local/.env`，没有输出或改写 Key，没有重启服务。

## 验证结果

| 验证             | 结果                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 配置             | 完整接口 `https://api.deepseek.com/chat/completions`，模型 `deepseek-flash`，CNY，汇率 1；文件权限 `0600`                                                  |
| 最小 JSON 调用   | HTTP 200，返回 `{"ok":true}`，finish reason 为 `stop`；输入 43、输出 5 tokens，耗时 883 ms                                                                 |
| 现有生产处理函数 | `processDiscoveryVersion()` 使用实际 `fetchPublic()`、现有提示词和请求参数调用真实模型，HTTP 200；任务 `completed`，资讯 `ready`，摘要通过 `summarySchema` |
| 用量与回执       | 输入 509、输出 871 tokens（其中 reasoning 524）；耗时 4963 ms；独立测试账本记账 3993 微元，预留归零                                                        |

结构化结果见 [summary.json](../../code/reports/deepseek-live-2026-11-15/summary.json)。测试输入为明确标注的合成 Agent 工具调用评测资料，不包含私人数据或秘密；资讯发布和预算结算发生在内存 SQLite，临时目录已清理，未访问正式资讯库或学习状态库。

本次两次调用共输入 552、输出 876 tokens；按当前配置输入 1、输出 4 元／百万 tokens 估算为 **¥0.004056**，未查询供应商账单。此费率对应[官方空闲时段价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)；高峰输入缓存未命中/输出为 2/8 元，现有固定 1/4 配置会在高峰低估预算。本次保留维护者当前配置，没有自动改价。

## 证据边界

上述结果证明新环境文件的凭据、接口、模型和现有摘要流程可实际调用。未验证所有信源、长正文质量或全部失败恢复分支，也未证明输出 token 限额在供应商侧被强制执行。

运行中的 `alh-cloud-real-worker-1` 仍使用旧环境：模型名为空，接口为 GLM 标准接口，输入/输出价格 0.8/2.8。要使后台采集使用新配置，需要重建该 worker 的环境；本次仅测试，没有自动启动正式模型处理。
