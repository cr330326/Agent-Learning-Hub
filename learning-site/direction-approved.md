# 设计方向确认

**日期**：2026-08-06
**结论**：C 的骨架 + B 的暖色

## 用户原话

> 用 C 的骨架配 B 的暖色，落成正式 index.html

## 展示了哪三版

三版共用同一套 `data.js` + `app.js`，内容完全一致（33 门课程 / 240 篇章节），
差异 100% 来自设计骨架与样式。三版均为可点击可阅读的完整站点，非静态稿。

| 方向 | 产出逻辑 | 骨架 | 截图 |
| --- | --- | --- | --- |
| A · 电影感暗场 × 进度频谱 | 🎲 秒数轮盘 → 08 → Cinematic Sound-Viz Dark | 顶栏 + 全幅暗场 hero + 横向阶段轨 | `design-shots/a-top.png`、`a-reader.png` |
| B · 暖色出版物 × 目录页 | 🏆 现实参照 → Anthropic / Claude 出版物语言 | 左侧恒定目录栏 + 右侧正文流 | `design-shots/b-top.png`、`b-reader.png` |
| C · 线路图系统 | 🧠 最佳设计师 → Vignelli / Unimark 交通图 | 标识条 + 左侧线路图 + 右侧模块网格 | `design-shots/c-top.png`、`c-reader.png` |

轮盘抽到 08（Cinematic Sound-Viz Dark）的母题是声波频谱，但这份内容里没有声音。
方向 A 保留其暗场结构 DNA，把频谱换成九阶段完成度柱阵——母题因此承载真实数据。

## 落地方案

- **骨架** 取 C：Vignelli 交通图系统。三轨道 = 三线路，九阶段 = 沿线站点，
  完成度 = 站点是否点亮。模块化网格、2px 规则线、等宽字全大写标签。
- **配色** 取 B：奶油纸底 `#F5F0E8` + 赤陶橙 `#C15F3C` + 暖近黑 `#1F1B16`。
  C 原本的屏幕原色三线路（正红 / 正蓝 / 正绿）一并转入暖色印刷谱系：
  赤陶 `#C15F3C` / 靛蓝 `#40618C` / 橄榄 `#5C7A52`。
- **字体分工**（超出「换色」的一处判断，若不需要可单独回退）：
  标识、标签、编号、数字、按钮保留 Archivo（网格的严谨来自它）；
  章节标题与**阅读器正文**改用 Newsreader 衬线 16.5px / 1.8——
  阅读器是每天待最久的地方，B 的价值主要在这块阅读面上。
  回退办法：把 `styles.css` 里所有 `font-family: var(--serif)` 改成 `var(--grotesk)`。

## 归档

- 正式站点：`index.html` + `styles.css`
- 三版初稿保留：`index-a/b/c.html` + `styles-a/b/c.css`（作为方向门的记录）
- 改版前的旧站点：`index-legacy.html.bak` + `styles-legacy.css.bak`
- 设计 spec：`design-spec.md`

## 后续变更

### 2026-08-06 · 课程标记系统（原「未决事项：具名产品 logo」已解决）

33 个项目里 13 个有官方素材（39%）。当初挂起的理由是「有图 / 没图会看起来像加载失败」——
真正的病根不是覆盖率，是**两类标记被做成了两个视觉阶级**。解法是共用一套标牌：

| | 有官方素材（13） | 无官方素材（20） |
| --- | --- | --- |
| 容器 | 26×26 方框，1px 描边 | 同左 |
| 颜色 | 线路色单墨 | 同左 |
| 内容 | 图形标记（CSS `mask` 取 alpha + `currentColor`） | 两字母标记 |

单墨同时解决了品牌原色（Claude 赤陶 / CrewAI 珊瑚红 / 小米橙 / LangChain 浅蓝）
和奶油纸面打架的问题。

素材存放：`assets/marks/*.svg`。优先取 simpleicons 的单路径剪影；
`opencode.svg` 来自 svgl，已手工移除整幅背景 rect（否则 mask 出来是一个实心方块）。
`scripts/audit_paths.py` 已扩展为一并校验 `mark:` 指向的文件是否存在——
缺文件会 mask 成空白方框，肉眼极难发现。

加新课程时：有官方素材写 `mark: "slug"` 并把 SVG 放进 `assets/marks/`；
没有就写 `mono: "XX"`。两者都不写会自动取标题前两个字符兜底。
