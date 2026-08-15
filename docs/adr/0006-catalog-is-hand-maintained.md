# Content Catalog 由人手维护，不再由旧站数据生成

`code/content/courses/courses.json` 和 `code/content/stages/stages.json` 是 Content Catalog 的权威事实源，由人（或工具在人确认后）直接编辑。`code/scripts/convert-legacy-content.mjs` 一次性完成了从 `learning-site/data.js` 的迁移，此后降级为溯源脚本，不再参与任何流程。

备选方案是继续维护 `learning-site/data.js` 并重跑生成，或保留生成链路再叠加一层路径覆盖文件。前者要求持续修改一个已冻结的迁移基线，而新增素材在旧站数据里根本没有位置；后者需要给目录加载器引入 override 语义和优先级规则，解释成本高于收益。选择直接编辑生成物，代价是文件名不再自解释，因此两个文件都已从 `legacy-import.json` 改名。

## Consequences

- 目录内容的每一次变化都是显式的人工决定，不会被重新生成覆盖。
- `convert:legacy` 仍写死输出 `legacy-import.json`：误跑会产出重复 stable ID 的第二份文件，被目录校验当场拦下，而不是静默覆盖策展结果。脚本启动时另有废弃告警。
- `learning-site/` 保持 Phase 8 对等验收前的冻结状态，与目录内容彻底脱钩。
- 目录与 Local Material Library 之间的偏差由 Catalog Drift 机制处理，见 [0007](./0007-catalog-drift-is-proposed-not-applied.md)。
