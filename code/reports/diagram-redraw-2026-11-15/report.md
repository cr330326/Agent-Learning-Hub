# 四张技术图重绘验证

日期：2026-11-15（Asia/Shanghai）。使用 `layered-svg-diagram` 技能重绘既有四份规范图源。

| 图源 | 内容与布局 | 验证 |
| --- | --- | --- |
| [architecture.svg](../../../docs/plans/architecture.svg) | 前端、后端、嵌入中间件与运维、数据内容、外部服务五层，保留 Web / worker 与两库边界 | 结构通过；原尺寸 / 1200px 已目视检查 |
| [module-deps.svg](../../../docs/plans/module-deps.svg) | 完整行→列依赖矩阵，以及运行时 / 含类型引用的文件循环详图 | 66 组跨模块依赖完整；循环同时用红色、叹号及线型标注 |
| [external-deps.svg](../../../docs/plans/external-deps.svg) | 蓝色运行库、紫色运行设施、橙色外部 API 三列，明确 Java 不适用 | 版本与 package.json 对齐；模型可选、生产代理责任明确 |
| [data-model-er.svg](../../../docs/data/data-model-er.svg) | 学习库、资讯库和 Git 三个归属区，区分 SQL 外键及应用引用 | 实线 / 点线有图例；跨库引用未伪装成 SQL 外键 |

图源为手工确定布局的独立 SVG，保留原有类别配色，采用衬线标题、系统 CJK 正文、稳定语义 ID、原生 text / tspan 与语义分组。没有 Mermaid 生成标记、foreignObject、脚本、远程字体或位图替代正文。既有生成式 ID 没有外部锚点消费者，重绘时改为稳定节点名称；四个规范文件路径保持不变。

再次通过应用 opener 对内存库执行迁移，并扫描现役 TypeScript import / export / 字面量动态 import。`schema.json` 与 `dependencies.json` 和上一轮交付事实完全一致（学习库 v3、资讯库 v6；112 源文件、297 文件边、16 模块、66 跨模块关系），未修改业务代码。

验证命令：`python3 .agents/skills/layered-svg-diagram/scripts/validate_svg.py <图源>`，四份均通过且无 warning；日志见 `validation.log`。渲染器为 Playwright 1.64.1 驱动的系统 Chrome；分别按 1800px 原宽与 1200px 嵌入宽渲染并逐图查看，输出为同目录 `*-full.png` / `*-embedded.png`。文字边界检测见 `render-check.json`，裁切、卡片溢出均为零。连线和文本的目视冲突已修正。

现役引用路径核对通过，仅为 `plan.md` 补充矩阵读法、`data-model.md` 补充 ER 图边界说明。已经发行的 2026.11.15 压缩包继续作为当次发行快照保留，不静默替换历史包；本次提交的 SVG 是后续现役图源。

提交前按仓库要求重跑 `check:cloud` 与 `check:local`，均以退出码 0 完成：各 237 单测及 11 工具测试、格式、lint、类型与生产构建通过。各自日志单独保存，不以图形结构验证替代应用门禁。未重启 Docker、改动数据或再次执行删号类 E2E。
