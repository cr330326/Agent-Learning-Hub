# 其他本地课程上下节导航验证

2026-11-15，针对正在运行的 Mac Docker Local 实例 `http://127.0.0.1:3003`。应用镜像为 `agent-learning-hub:course-navigation-20261115-r2`。

## 验证结论

40 个其他课程入口中，22 个接入了多页目录，12 个只接入一页，6 个当前没有可在站内渲染的正文。另将已修复的 OpenCode 作为对照，总计检查 41 个课程入口。现有目录内的上下节目标均正确，课程完整性核对确认了五门主线课程的缺口。

现有多页条目从首节进入第二节再返回的浏览器点击全部通过。Hello-Agents 的正文第一章、第二章均没有翻页按钮，claw0 的第一节只有返回 README 的上一节，Learn Harness Engineering 的课程入口只显示 README。learn-claude-code 的旧 12 节可以翻页，作者当前 17 节目录还未接入。

## 验证范围与方法

- HTTP 覆盖全部 358 个有效 `local-preferred` 条目，以及另外 3 个课程回退入口，共 361 个入口、518 个可读页面。除 OpenCode 外的可读页面有 408 个。
- 通过实际 `listLocalChapters()` 生成安全可读清单，对照运行实例的目录、当前节、上一节和下一节。每个已声明可读页面都验证正文与 HTTP 状态，首节要求无上一节，末节要求无下一节。
- 24 个多页条目全部执行真实浏览器“下一节 → 上一节”点击，包含 23 个课程卡及一个多页资料条目。为避免自动写入日常学习记录，浏览器禁用页面脚本，使用阅读器服务端输出的普通链接导航。
- 针对有按钮、缺少按钮、首尾边界和旧课程目录截取 8 张桌面截图，已逐张查看。截图中的学习状态停留在加载占位，与本轮禁用脚本的浏览器配置一致。
- 对五门主线课程另查作者 README 或 SUMMARY，核对教学正文是否声明进整课。作者目录检查返回失败，现有链路和作者目录覆盖率的结果分别记录。

[HTTP 明细](../../code/reports/local-course-navigation-2026-11-15/http-audit.json) · [浏览器点击与截图清单](../../code/reports/local-course-navigation-2026-11-15/browser-audit.json) · [作者目录失败明细](../../code/reports/local-course-navigation-2026-11-15/author-outline-findings.json)

## 已确认的主线缺口

| 课程 | 当前课程可读页 | 作者主线 | 主线仍在整课之外 | 现状 |
| --- | ---: | ---: | ---: | --- |
| Hello-Agents | 2 | 16 | 16 | 作者正文第 1 至 16 章；前言单列在现有课程目录中。 |
| claw0 | 2 | 10 | 9 | 作者 s01 至 s10 教学顺序，工作区模板另列。 |
| learn-claude-code | 13 | 17 | 17 | 当前作者目录为 s01 至 s17，现有阅读器仍为 docs/zh 的旧 12 节。 |
| Learn Harness Engineering | 1 | 14 | 14 | 作者现有 14 讲中文正文均在磁盘，课程入口仅 README。 |
| 驾驭工程：从 CC 到 AI Coding | 2 | 45 | 44 | 作者中文书目录包含前言、正文、增补章和附录。 |

所有上述作者主线文件均存在于本地磁盘。Hello-Agents 的 16 章和 claw0 剩余 9 节已经作为独立条目存在，但独立条目没有课程上下节。learn-claude-code 的当前中文 17 节、Harness 新增 2 讲、《驾驭工程》新增 4 页尚未被当前阅读目录声明，需按作者当前目录策展并处理旧版归属。

本轮完成验证与缺陷记录，上述五门的补齐工作仍待实施。AI Agent Deep Dive 当前接入的 18 页全部通过已有目录的前后翻页验证。

## 全部课程入口的实际按钮

下表记录默认阅读页的按钮。首节只有下一节、末节只有上一节符合边界规则。两页课程无法展示同时拥有前后节的中间页，三页及以上课程才存在这种中间页。

| 课程 | 可读页 | 默认上一节 | 默认下一节 | 目录覆盖核对 |
| --- | ---: | --- | --- | --- |
| Hello-Agents（legacy-course-001） | 2 | 无 | 有 | 已确认主线缺口 |
| Hello-Agents 正式版 PDF（legacy-course-002） | 0 | 无 | 无 | 当前无站内正文 |
| Easy Agent（legacy-course-003） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| claw0（legacy-course-004） | 2 | 无 | 有 | 已确认主线缺口 |
| Easy AI（easy-learn-ai）（legacy-course-005） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| LLM Book（legacy-course-006） | 0 | 无 | 无 | 当前无站内正文 |
| Palantir 本体论（legacy-course-007） | 0 | 无 | 无 | 当前无站内正文 |
| learn-claude-code（legacy-course-008） | 13 | 无 | 有 | 已确认主线缺口 |
| Claude Code 源码逆向分析（legacy-course-009） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| Claude Code 源码合集（legacy-course-010） | 4 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| Claude Code Lens（legacy-course-011） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| Claude 文档与范例（legacy-course-012） | 3 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| Claude 插件生态（legacy-course-013） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| awesome-claude-code（legacy-course-014） | 3 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| OpenAI Codex（legacy-course-015） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| OpenClaw（legacy-course-016） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| OpenCode 中文实战课（legacy-course-017） | 110 | 无 | 有 | OpenCode 已修复，对照项 |
| OpenCode 生态（legacy-course-018） | 4 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| Hermes Agent（legacy-course-019） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| CyberClaw（legacy-course-020） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| MiMo-Code（legacy-course-021） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| Learn Harness Engineering（legacy-course-022） | 1 | 无 | 无 | 已确认主线缺口 |
| 驾驭工程：从 CC 到 AI Coding（legacy-course-024） | 2 | 无 | 有 | 已确认主线缺口 |
| mem0（legacy-course-025） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| LangChain 全家桶（legacy-course-026） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| CrewAI（legacy-course-027） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| MetaGPT（legacy-course-028） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| AutoGPT（legacy-course-029） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| OpenHands（legacy-course-030） | 0 | 无 | 无 | 当前无站内正文 |
| PI（pi-mono）（legacy-course-031） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| openworker（legacy-course-032） | 0 | 无 | 无 | 当前无站内正文 |
| OpenChamber（legacy-course-033） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| AI Agent Deep Dive（legacy-course-034） | 18 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| Multica（legacy-course-035） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| smolagents（legacy-course-036） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| Open Agent SDK（TypeScript）（legacy-course-037） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| Microsoft AI Agents for Beginners（legacy-course-038） | 0 | 无 | 无 | 当前无站内正文 |
| cc-switch（legacy-course-039） | 5 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| CodexSwitch（legacy-course-040） | 3 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |
| WorkAny（legacy-course-041） | 1 | 无 | 无 | 单页无翻页，作者完整目录待逐门核对 |
| Solon-AI（legacy-course-042） | 2 | 无 | 有 | 已接入页面翻页通过，作者完整目录待逐门核对 |

## 同仓库独立资料的进一步核验

此前 20 个同仓库归属候选已与实际页面对应。部分内容为项目说明、工作区模板或旧版文档，课程归属需结合作者目录裁定。下表展示仍作为独立目标打开的内容及其按钮现状。

| 课程入口 | 已接入页 | 同仓库独立条目 | 独立可读条目中无翻页按钮 |
| --- | ---: | ---: | ---: |
| Hello-Agents | 2 | 30 | 30 |
| claw0 | 2 | 17 | 17 |
| learn-claude-code | 13 | 9 | 9 |
| Claude Code 源码逆向分析 | 2 | 11 | 11 |
| OpenClaw | 1 | 17 | 17 |
| CyberClaw | 2 | 2 | 2 |
| Learn Harness Engineering | 1 | 15 | 15 |
| 驾驭工程：从 CC 到 AI Coding | 2 | 40 | 40 |
| LangChain 全家桶 | 1 | 7 | 6 |
| CrewAI | 1 | 35 | 35 |
| MetaGPT | 1 | 7 | 7 |
| AutoGPT | 1 | 26 | 26 |
| PI（pi-mono） | 2 | 6 | 6 |
| OpenChamber | 2 | 44 | 44 |
| Multica | 2 | 2 | 2 |
| smolagents | 2 | 8 | 8 |
| cc-switch | 5 | 16 | 16 |
| CodexSwitch | 3 | 2 | 2 |
| WorkAny | 1 | 1 | 1 |
| Solon-AI | 2 | 2 | 2 |

## 当前没有站内正文的课程入口

- Hello-Agents 正式版 PDF（legacy-course-002）页面提示“Hello-Agents 正式版 PDF这个条目当前没有站内正文。访问入口已经解析为：暂不可用。本地 PDF 已移除（Learning/Book 下不再保留该文件），条目保留备用；如需重新获取可向上游索取。← 返回课程导览”。
- LLM Book（legacy-course-006）页面提示“LLM Book这个本地文件格式暂不支持安全的站内渲染。返回课程导览”。
- Palantir 本体论（legacy-course-007）页面提示“Palantir 本体论这个本地文件格式暂不支持安全的站内渲染。返回课程导览”。
- OpenHands（legacy-course-030）页面提示“OpenHands这个条目当前没有站内正文。访问入口已经解析为：暂不可用。本地仓库已从磁盘移除（全盘无 OpenHands 副本），可重新克隆 https://github.com/OpenHands/OpenHands 后再启用。← 返回课程导览”。
- openworker（legacy-course-032）页面提示“openworker这个条目当前没有站内正文。访问入口已经解析为：打开上游。打开上游 ↗← 返回课程导览”。
- Microsoft AI Agents for Beginners（legacy-course-038）页面提示“Microsoft AI Agents for Beginners这个条目当前没有站内正文。访问入口已经解析为：打开上游。打开上游 ↗← 返回课程导览”。

## 截图与复现

- [Hello-Agents 前言末尾只有上一节](../../code/reports/local-course-navigation-2026-11-15/screenshots/hello-course-preface.png)
- [Hello-Agents 第一章末尾没有上下节](../../code/reports/local-course-navigation-2026-11-15/screenshots/hello-lesson-1.png)
- [Hello-Agents 第二章末尾没有上下节](../../code/reports/local-course-navigation-2026-11-15/screenshots/hello-lesson-2.png)
- [claw0 第一节末尾只有返回 README](../../code/reports/local-course-navigation-2026-11-15/screenshots/claw0-course.png)
- [learn-claude-code 旧目录的中间节双向按钮](../../code/reports/local-course-navigation-2026-11-15/screenshots/claude-middle.png)
- [AI Agent Deep Dive 中间节双向按钮](../../code/reports/local-course-navigation-2026-11-15/screenshots/agent-deep-dive-middle.png)

脚本副本和完整执行日志保存在同一报告目录。HTTP 和浏览器链路检查通过，作者目录覆盖检查为失败，五项缺口仍开放。

```bash
node --import ./code/node_modules/tsx/dist/loader.mjs /tmp/alh-local-course-navigation-20261115/manifest.mts
node /tmp/alh-local-course-navigation-20261115/audit.mjs
node /tmp/alh-local-course-navigation-20261115/browser.mjs
python3 /tmp/alh-local-course-navigation-20261115/author-outlines.py
```
