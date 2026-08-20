# Agent Learning Hub · 本地学习网站（迁移归档）

> **这不是现役站点。** 现役全栈工程在 [`../code/`](../code/)，运行与部署方式见根目录
> [README](../README.md) 与 [GUIDE](../GUIDE.md)。本目录是迁移基线，保留用于对照旧站
> 首版能力（对等报告见 [tasks.md](../docs/plans/tasks.md) T8.1），**不再独立演进、
> 不新增产品功能**。下文描述的是归档当时的状态，其中的数量与能力不代表现在的站点。

把 [`../local-courses/`](../local-courses/) 里 11 GB、8800+ 篇 Markdown 的课程素材，
收束成一个带路线、搜索、进度追踪和 Markdown 阅读器的单页应用。

当前接入：**41 门课程卡片**、**35 个阅读器分组 / 427 篇章节**、**501 条本地引用**（全部校验通过）。

## 启动

在仓库根目录跑启动脚本：

```bash
./start-site.sh
```

它会先校验一遍课程路径，再起服务并打开浏览器。可选参数：

| 参数          | 作用                                            |
| ------------- | ----------------------------------------------- |
| `--port 9000` | 换端口（默认 8765，被占用时自动顺延最多 10 个） |
| `--no-open`   | 不自动开浏览器                                  |
| `--no-audit`  | 跳过路径校验                                    |

等价的手动做法——在仓库**根目录**（不是这个目录）运行：

```bash
python3 -m http.server 8765
```

然后打开 <http://localhost:8765/learning-site/>。

> 两个约束都不能省：
>
> - **必须从仓库根目录起服务**。阅读器按 `../local-courses/` 取文件，从 `learning-site/`
>   里起会让整个课程目录落在 document root 之外。
> - **必须走 HTTP**。直接双击 `index.html`（`file://` 协议）会让 `fetch()` 被跨域策略
>   拦下，所有章节都读不出来。

---

## 文件结构

| 文件                                       | 职责                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `index.html`                               | 页面骨架                                                                             |
| `styles.css`                               | 样式                                                                                 |
| `data.js`                                  | **全部内容数据**：轨道、九阶段、课程卡片、项目阶梯、速记卡、阅读器菜单、图片重写规则 |
| `app.js`                                   | 渲染与交互逻辑，不含任何内容                                                         |
| `assets/marks/`                            | 课程图形标记 SVG（单墨剪影，供 CSS mask 用）                                         |
| `scripts/audit_paths.py`                   | 双向校验：`data.js` 的引用是否都存在，磁盘上的项目是否都被收录                       |
| `../start-site.sh`                         | 一键启动（校验 → 起服务 → 开浏览器）                                                 |
| `design-spec.md` / `direction-approved.md` | 设计 spec 与方向定稿记录                                                             |
| `index-a/b/c.html` + `styles-a/b/c.css`    | 三个设计方向初稿（归档，不参与线上）                                                 |
| `design-shots/`                            | 各方向与定稿截图                                                                     |
| `*-legacy.*.bak`                           | 改版前的旧站点备份                                                                   |

**数据与逻辑分离**是刻意的：加课程只改 `data.js`，永远不用碰 `app.js`。

## 设计

骨架取自 Vignelli / Unimark 的交通图系统——每条轨道 = 一条线路，九个阶段 = 沿线站点，
完成度 = 站点是否点亮。左侧线路图由真实进度驱动，点站点直达该阶段。

配色取自 Anthropic / Claude 的出版物语言：奶油纸底 + 赤陶橙 + 暖近黑，线路色一并
转入暖色印刷谱系（赤陶 / 靛蓝 / 橄榄 / 紫褐）。

字体分工：标识、标签、编号、按钮用 Archivo；章节标题与**阅读器正文**用 Newsreader
衬线（每天待最久的地方需要温度）。CJK 一律回退系统字。

完整决策记录见 [`direction-approved.md`](./direction-approved.md)。

---

## 路径约定（重要）

`data.js` 里的本地路径**不写 `../local-courses/` 前缀**，只写相对课程根的部分：

```js
{ label: "第 8 章：记忆与检索", doc: "Learning/hello-agents/docs/chapter8/第八章 记忆与检索.md" }
```

`app.js` 的 `docUrl()` 统一补前缀。三种写法：

| 写法                     | 解析为                                    | 用途                   |
| ------------------------ | ----------------------------------------- | ---------------------- |
| `Learning/xxx/README.md` | `../local-courses/Learning/xxx/README.md` | 课程文档（绝大多数）   |
| `@root/README.md`        | `../README.md`                            | 仓库根目录的文件       |
| `https://…`              | 原样                                      | 外链，卡片上渲染成 `↗` |

这样目录再次重组时，只需批量替换 `data.js` 里的字符串。

---

## 功能

### 四条轨道

站点结构与 `local-courses/` 的一级目录一一对应：`Learning` / `AICoding` / `Agentic` /
`Application`。课程卡片可按轨道筛选，阅读器分组带轨道色标。

轨道的 `id`（站点内部标识，CSS 选择器和 localStorage 都按它走）和 `dir`（磁盘目录名）
在 `data.js` 里是分开的两个字段。`AI-Coding/` 改名成 `AICoding/` 那次，只动 `dir`
就够了——样式和用户已存的进度都不受影响。

### 九阶段路线

从「理解 Agent 是什么」到「交付真实 Agent」。每阶段含可勾选任务、明确产出，以及
**配套阅读**——直接链到本地某个具体章节，点了就进阅读器。

### 学习进度

三类状态都存 `localStorage`：

| 键                  | 内容               |
| ------------------- | ------------------ |
| `agentHubDone`      | 阶段任务勾选       |
| `agentHubDocsDone`  | 章节完成标记       |
| `agentHubLastDoc`   | 最后阅读位置       |
| `agentHubCollapsed` | 阅读器分组折叠状态 |
| `agentHubTrack`     | 当前轨道筛选       |

清浏览器数据会重置进度。

### Markdown 阅读器

轻量渲染器，支持标题、有序/无序列表、引用、表格、代码块（带语言标注）、图片、
链接和内联 HTML。另有：

- **图片路径自动修复**：GitHub raw URL 按 `data.js` 的 `imageRewrites` 规则转成本地路径
- **分组菜单**：可折叠，带每组完成度（如 `3/16`）
- **章节过滤**：菜单顶部搜索框
- **上一章 / 下一章**：或用键盘 `[` `]`
- **阅读位置恢复**：刷新回到上次读的章节
- **软换行合并**：连续正文行归成一段。逐行各包一个 `<p>` 会把一句话切成几段，
  段间距落在句子中间。CJK 之间直接接上，其余补空格——中文硬换行补空格会多出可见空隙
- **缩进围栏**：代码围栏允许有缩进。只认顶格的话，列表项和 MDX 组件里的代码块
  会整段掉进正文，反引号还会被当成行内 `code`

### `.mdx` 支持

CrewAI 的文档是 Mintlify 体系的 `.mdx`：带 YAML frontmatter，正文混着大写开头的
JSX 组件。`app.js` 的 `preprocessMdx()` 在进主循环前把它们降级掉：

| 源                                                | 渲染成                                      |
| ------------------------------------------------- | ------------------------------------------- |
| frontmatter `title` / `description`               | `<h1>` + `.doc-lead` 引言                   |
| `<Note> <Tip> <Info> <Check> <Warning>`           | `.mdx-callout`，左边线按语义取线路色        |
| `<Card> <Accordion> <Step> <Tab> <Frame>`         | `.mdx-block`，`title=` 取成小标题           |
| `<ParamField> <ResponseField>`                    | `.mdx-param` 签名行（名 / 类型 / required） |
| `<Steps> <CardGroup> <Tabs> <CodeGroup>` 等纯容器 | 标签丢掉，内容照常走 Markdown               |
| `import` / `export`、`{/* 注释 */}`               | 整行去掉                                    |

关键在于组件标签换成的是**哨兵行**而不是直接吐 HTML。渲染器碰到裸 HTML 会进
`htmlBlockDepth > 0` 分支、把块内所有行原样输出——那样组件**内部**的 Markdown 就全废了。
哨兵行不碰 `htmlBlockDepth`，所以 `<Steps>` 里的标题、列表、代码块照常渲染。

围栏代码块在预处理时被保护，示例里的 JSX 不会被当成组件。不认识的大写标签原样留给
HTML 分支，不会被吞掉。

### 键盘

| 键        | 作用            |
| --------- | --------------- |
| `/`       | 聚焦搜索框      |
| `[` / `]` | 上一章 / 下一章 |

---

## 加一门新课程

改 `data.js` 两处，然后跑校验。

**1. `courses` 数组**——课程卡片：

```js
{
  title: "课程名称",
  track: "learning",          // learning | ai-coding | agentic | application
  kind: "local",              // local 可读 | pdf 直开 | remote 仅外链
  tag: "20 章实战",
  summary: "一句话描述。",
  focus: "学习重点提示。",
  links: [
    ["本地 README", "Learning/xxx/README.md"],
    ["GitHub", "https://github.com/xxx/xxx"]
  ],
  featured: true,             // 可选，卡片高亮
  mark: "claude"              // 有官方素材：assets/marks/claude.svg
  // 或 mono: "XX"            // 没有官方素材：两字母标记
}
```

**关于 `mark` / `mono`**：41 个项目里只有 13 个有官方 logo。两种标记共用同一个
26×26 方框、同样的线路色单墨——有素材的放图形，没有的放字母，所以网格不会露出
「有些加载失败了」的观感。图形走 CSS `mask` 只取 alpha 通道，用 `currentColor` 上色，
因此 SVG 本身是什么颜色都无所谓（也就顺带避免了品牌原色和奶油纸面打架）。

加图形标记时：优先用 [simpleicons](https://simpleicons.org) 的单路径剪影，放进
`assets/marks/<slug>.svg`。**注意有些来源的 SVG 带整幅背景 `<rect>`，必须先删掉**，
否则 mask 出来是一个实心方块（`opencode.svg` 就踩过这个）。两个字段都不写会自动取
标题前两字符兜底。

**2. `menuData` 数组**——阅读器分组：

```js
{
  title: "课程名 · 分组名",
  track: "learning",
  items: [
    { label: "第 1 章：标题", doc: "Learning/xxx/docs/ch1.md" }
  ]
}
```

`doc` 指 `.mdx` 也可以，渲染器会自己处理 frontmatter 和 JSX 组件（见上面 [`.mdx` 支持](#mdx-支持)）。

**3. 校验**：

```bash
python3 scripts/audit_paths.py
```

若课程 Markdown 里引用了 GitHub raw 图片，在 `data.js` 的 `imageRewrites` 里加一条
`[正则, "本地相对路径"]`。

---

## 目录变动后的自检

`data.js` 和 `local-courses/` 会往两个方向漂，两种都不报错：

| 漂移                                           | 症状                            | 后果                                           |
| ---------------------------------------------- | ------------------------------- | ---------------------------------------------- |
| **路径失效**——目录改名/移动，引用指向空气      | 页面照常渲染，点开某一章才 404  | `AI-Coding/` → `AICoding/` 那次废掉 119 条引用 |
| **内容遗漏**——新课程躺在磁盘上，`data.js` 没提 | 连 404 都没有，站点上就是不存在 | 下载完忘了接，几个月都发现不了                 |

一条命令同时查两个方向：

```bash
python3 scripts/audit_paths.py
```

输出形如：

```
检查 501 条本地引用 · 命中 501 · 失效 0
全部命中 ✓

覆盖检查 · 识别 55 个项目目录 · 未被 data.js 提及 0
每个项目目录都有引用 ✓
```

有失效路径会列清单并以退出码 1 结束，可以接进 CI 或 pre-commit。未收录的项目只提示、
不算失败——收不收是编辑判断，不是错误。加 `--no-cover` 可只跑路径校验。

项目目录靠标志识别（`README*.md`、`.git`、`package.json`、`pyproject.toml`、`pom.xml`、
`Cargo.toml`），不是靠目录名白名单——名字会变，这些标志不会。识别到一个项目就不再
往里走，项目内部的 `src/`、`docs/` 不会被当成「另一门课」。

`start-site.sh` 每次启动都会先跑一遍，所以正常情况下不用手动执行。

---

## 注意事项

- **必须走 HTTP 服务**，不能用 `file://`；**且必须从仓库根目录起**。
- **CJK 走系统字**（PingFang SC / 思源黑体），只有 Latin 用 Web Font。离线时字体拉不到，
  版式不会塌，只是 Latin 回退到系统栈。
- `data.js` 用 IIFE 包裹，避免和 `app.js` 的顶层 `const` 撞名。改文件时别把这层去掉。
- 改完 `data.js` / `app.js` 记得把 `index.html` 末尾的 `?v=` 加一位，否则浏览器会拿旧缓存。
- 加轨道要动三个文件：`data.js` 的 `tracks`、`styles.css` 的 `--line-*` 变量加四处
  `data-track` 选择器、`index.html` 的线路图例。
