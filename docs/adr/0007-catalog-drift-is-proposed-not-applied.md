# Catalog Drift 由工具提候选、由人确认，不自动修复

`materials drift` 检测 Content Catalog 声明的路径与 Local Material Library 实际内容之间的偏差，并为失效路径提出候选目标，但只有加 `--apply` 才写回，且只写回它能交叉印证为目录搬迁的那些。判不准的和找不到的一律原样保留。

自动全量重映射是更省事的备选。放弃它的理由来自实测：素材库里有 17.5 万个文件，一个被删除的文件几乎总能在别处找到同名甚至同尾缀的孪生兄弟，所以匹配器**没有"已删除"这个输出**。`Agentic/Langchain-ai/langchain/libs/README.md` 在 langchain 被整个删掉之后，仍然唯一匹配到 DeepAgents 的 `libs/README.md`——自动应用会让一个 LangChain 条目静默指向另一个项目的文件：页面能打开、正文能渲染、审计全绿，只有读者读到的内容不对。这类错误比 404 隐蔽得多，代价也高得多。

因此 `--apply` 只接受被多条路径共同印证的目录改写，且只有后缀收敛后唯一命中的路径才有背书资格——匹配上百个同名文件的路径并不知道自己去了哪，让它投票等于让数量本身印证任意结论。

同理，`sourceUrl` 回填按仓库分组产出候选而不直接写入：派生地址离线无法验证，实测 54 组样例里有 2 组真的打不开（仓库已私有/改名，以及本地副本与上游不同步）。

## Consequences

- 素材目录每次重组都需要人看一眼报告，这是刻意保留的成本。
- Catalog Drift 不进 `npm run check`：素材库在仓库之外，维护者整理它不应该让 typecheck、测试和构建变红。`materials drift` 自己非零退出，作为独立门禁使用。
- `audit:content` 的 `local-path-missing` 是 warning；`local-path-escape` 与 `local-path-not-file` 仍是 error——那是安全边界违规，不会因为重组而变得正确。
- 磁盘上新增的素材只报告、不自动入库：track、阶段、摘要、归属和章节清单都是策展决定，读不出来。
