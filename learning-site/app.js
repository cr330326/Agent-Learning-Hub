/**
 * Agent Learning Hub — 渲染与交互逻辑
 *
 * 内容全部来自 data.js（window.HubData）。这里只负责渲染和状态。
 * 三版设计变体共用这一份逻辑：每个容器都是「有就渲染、没有就跳过」，
 * 所以不同骨架的 index.html 可以自由挑选要哪些模块。
 */

const { COURSE_ROOT, tracks, stages, courses, projects, resources, menuData, imageRewrites } = window.HubData;

/* ---------------------------------------------------------------------------
 * 路径
 * ------------------------------------------------------------------------- */
function docUrl(path) {
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("@root/")) return "../" + path.slice("@root/".length);
  return COURSE_ROOT + path;
}

function isLocalDoc(path) {
  return !/^https?:\/\//.test(path);
}

/* ---------------------------------------------------------------------------
 * 状态
 * ------------------------------------------------------------------------- */
const LS = {
  done: "agentHubDone",
  docsDone: "agentHubDocsDone",
  lastDoc: "agentHubLastDoc",
  collapsed: "agentHubCollapsed",
  track: "agentHubTrack"
};

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

const DEFAULT_DOC = "@root/README.md";

const state = {
  query: "",
  track: localStorage.getItem(LS.track) || "all",
  done: readJson(LS.done, {}),
  docsDone: readJson(LS.docsDone, {}),
  lastDoc: localStorage.getItem(LS.lastDoc) || DEFAULT_DOC,
  collapsedGroups: readJson(LS.collapsed, [])
};

const $ = (sel) => document.querySelector(sel);
const el = {
  roadmapGrid: $("#roadmapGrid"),
  courseGrid: $("#courseGrid"),
  trackFilter: $("#trackFilter"),
  trackBoard: $("#trackBoard"),
  projectList: $("#projectList"),
  resourceGrid: $("#resourceGrid"),
  spectrum: $("#spectrum"),
  search: $("#search"),
  docView: $("#docView"),
  readerMenu: $("#readerMenu"),
  readerFilter: $("#readerFilter"),
  docTitle: $("#docTitle"),
  markDone: $("#markDone"),
  prevDoc: $("#prevDoc"),
  nextDoc: $("#nextDoc"),
  emptyState: $("#emptyState")
};

let docButtons = [];
let docList = [];

/* ---------------------------------------------------------------------------
 * 统计
 * ------------------------------------------------------------------------- */
function allDocs() {
  return menuData.flatMap((group) => group.items.map((item) => item.doc));
}

function stats() {
  const totalTasks = stages.reduce((sum, s) => sum + s.tasks.length, 0);
  const doneTasks = Object.values(state.done).filter(Boolean).length;
  const docs = allDocs();
  const doneDocs = docs.filter((d) => state.docsDone[d]).length;
  return {
    stages: stages.length,
    courses: courses.length,
    localCourses: courses.filter((c) => c.kind === "local").length,
    tasks: totalTasks,
    doneTasks,
    docs: docs.length,
    doneDocs,
    percent: docs.length ? Math.round((doneDocs / docs.length) * 100) : 0
  };
}

function setText(sel, value) {
  const node = $(sel);
  if (node) node.textContent = value;
}

function updateStats() {
  const s = stats();
  setText("#stageCount", s.stages);
  setText("#courseCount", s.courses);
  setText("#localCourseCount", s.localCourses);
  setText("#doneCount", s.doneTasks);
  setText("#taskTotal", s.tasks);
  setText("#docCount", s.docs);
  setText("#docDoneCount", s.doneDocs);
  // 240 篇的分母下，读完 1 篇四舍五入是 0%——那读起来像「没生效」。
  setText("#docPercent", s.doneDocs > 0 && s.percent === 0 ? "<1%" : s.percent + "%");
  const bar = $("#progressBar");
  if (bar) bar.style.setProperty("--progress", s.percent + "%");
}

/* ---------------------------------------------------------------------------
 * 过滤
 * ------------------------------------------------------------------------- */
function textMatches(...parts) {
  if (!state.query) return true;
  return parts.join(" ").toLowerCase().includes(state.query.toLowerCase());
}

function trackMatches(track) {
  return state.track === "all" || state.track === track;
}

function trackOf(id) {
  return tracks.find((t) => t.id === id);
}

/* ---------------------------------------------------------------------------
 * 渲染：轨道总览
 * ------------------------------------------------------------------------- */
function renderTrackBoard() {
  if (!el.trackBoard) return;
  el.trackBoard.innerHTML = tracks
    .map((track) => {
      const list = courses.filter((c) => c.track === track.id);
      const readable = list.filter((c) => c.kind === "local").length;
      const chapters = menuData
        .filter((g) => g.track === track.id)
        .reduce((sum, g) => sum + g.items.length, 0);
      return `
        <article class="track-card" data-track="${track.id}">
          <header>
            <span class="track-dot" aria-hidden="true"></span>
            <h3>${track.name}</h3>
            <p class="track-zh">${track.zh}</p>
          </header>
          <p class="track-desc">${track.desc}</p>
          <dl class="track-figures">
            <div><dt>课程</dt><dd>${list.length}</dd></div>
            <div><dt>可阅读</dt><dd>${readable}</dd></div>
            <div><dt>章节</dt><dd>${chapters}</dd></div>
          </dl>
          <button class="track-jump" data-track-jump="${track.id}">只看这条轨道 →</button>
        </article>`;
    })
    .join("");
}

/* ---------------------------------------------------------------------------
 * 渲染：进度频谱（9 个阶段的完成度柱阵）
 * ------------------------------------------------------------------------- */
function renderSpectrum() {
  if (!el.spectrum) return;
  el.spectrum.innerHTML = stages
    .map((stage, index) => {
      const total = stage.tasks.length;
      const done = stage.tasks.filter((_, i) => state.done[`${stage.id}-${i}`]).length;
      const ratio = total ? done / total : 0;
      const height = 28 + index * 7;
      return `
        <button class="spectrum-bar${ratio === 1 ? " full" : ""}"
                style="--h:${height}px;--fill:${Math.round(ratio * 100)}%"
                data-stage-jump="${stage.id}"
                title="${stage.badge}｜${stage.title}｜${done}/${total}">
          <span class="spectrum-fill"></span>
          <span class="spectrum-label">${index}</span>
          <span class="spectrum-name">${stage.title}</span>
        </button>`;
    })
    .join("");
}

/* ---------------------------------------------------------------------------
 * 渲染：学习路线
 * ------------------------------------------------------------------------- */
function renderStages() {
  if (!el.roadmapGrid) return;
  const list = stages.filter((stage) =>
    textMatches(stage.badge, stage.title, stage.summary, stage.tasks.join(" "), stage.output)
  );
  el.roadmapGrid.innerHTML = list
    .map((stage) => {
      const doneCount = stage.tasks.filter((_, i) => state.done[`${stage.id}-${i}`]).length;
      const reading = (stage.reading || [])
        .map(
          (r) =>
            `<button class="stage-read" data-open-doc="${r.doc}">${r.label}</button>`
        )
        .join("");
      return `
      <article class="stage-card" id="${stage.id}">
        <div class="stage-head">
          <span class="badge">${stage.badge}</span>
          <span class="stage-count">${doneCount}/${stage.tasks.length}</span>
        </div>
        <h3>${stage.title}</h3>
        <p class="stage-summary">${stage.summary}</p>
        <ul class="checklist">
          ${stage.tasks
            .map((task, index) => {
              const id = `${stage.id}-${index}`;
              return `<li><label><input type="checkbox" data-check="${id}" ${
                state.done[id] ? "checked" : ""
              } /><span>${task}</span></label></li>`;
            })
            .join("")}
        </ul>
        ${reading ? `<div class="stage-reading"><span class="stage-reading-label">配套阅读</span>${reading}</div>` : ""}
        <p class="output">${stage.output}</p>
      </article>`;
    })
    .join("");
}

/* ---------------------------------------------------------------------------
 * 渲染：课程卡片
 * ------------------------------------------------------------------------- */
const KIND_LABEL = { local: "可在线阅读", pdf: "PDF", remote: "仅外链" };

/**
 * 课程标记。33 个项目里只有约三分之一拿得到官方 logo，其余是个人仓库、根本没有。
 * 「有的放图、没有的留空」会让网格看起来像加载失败，所以两种情况共用同一个容器：
 * 同样的方框、同样的尺寸、同样的线路色单墨。有官方素材的用图形，没有的用字母。
 * 图形一律走 CSS mask 取 alpha 上色——既统一了单墨，也顺带解决了品牌原色和暖色纸面打架。
 */
function markFor(course) {
  if (course.mark) {
    return `<span class="course-mark"><i style="--mark:url('./assets/marks/${course.mark}.svg')"></i></span>`;
  }
  const mono = course.mono || course.title.slice(0, 2).toUpperCase();
  return `<span class="course-mark"><b>${mono}</b></span>`;
}

function renderTrackFilter() {
  if (!el.trackFilter) return;
  const options = [{ id: "all", name: "全部", zh: `${courses.length} 门` }, ...tracks];
  el.trackFilter.innerHTML = options
    .map((opt) => {
      const count = opt.id === "all" ? courses.length : courses.filter((c) => c.track === opt.id).length;
      return `<button class="chip${state.track === opt.id ? " active" : ""}" data-track-set="${opt.id}">
        ${opt.name}<span class="chip-count">${count}</span>
      </button>`;
    })
    .join("");
}

function renderCourses() {
  if (!el.courseGrid) return;
  const list = courses.filter(
    (c) => trackMatches(c.track) && textMatches(c.title, c.tag, c.summary, c.focus)
  );
  el.courseGrid.innerHTML = list
    .map((course) => {
      const track = trackOf(course.track);
      const links = course.links
        .map(([label, href]) => {
          if (!isLocalDoc(href)) {
            return `<a class="pill-link ext" href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
          }
          if (href.toLowerCase().endsWith(".pdf")) {
            return `<a class="pill-link" href="${docUrl(href)}" target="_blank" rel="noreferrer">${label}</a>`;
          }
          return `<button class="pill-link" data-open-doc="${href}">${label}</button>`;
        })
        .join("");
      return `
      <article class="course-card${course.featured ? " featured" : ""}" data-track="${course.track}">
        <div class="course-head">
          ${markFor(course)}
          <span class="course-track">${track ? track.name : ""}</span>
          <span class="badge kind-${course.kind}">${course.tag}</span>
        </div>
        <h3>${course.title}</h3>
        <p class="course-summary">${course.summary}</p>
        <p class="course-focus"><span>学习重点</span>${course.focus}</p>
        <div class="course-links">${links}</div>
        <span class="course-kind">${KIND_LABEL[course.kind]}</span>
      </article>`;
    })
    .join("");
  if (el.emptyState) el.emptyState.hidden = list.length > 0;
}

/* ---------------------------------------------------------------------------
 * 渲染：项目阶梯 / 速记卡
 * ------------------------------------------------------------------------- */
function renderProjects() {
  if (!el.projectList) return;
  el.projectList.innerHTML = projects
    .filter((p) => textMatches(p.join(" ")))
    .map(
      ([level, title, learn]) => `
      <article class="project-row">
        <span class="level">${level}</span>
        <span class="project-title">${title}</span>
        <span class="project-learn">${learn}</span>
      </article>`
    )
    .join("");
}

function renderResources() {
  if (!el.resourceGrid) return;
  el.resourceGrid.innerHTML = resources
    .filter((r) => textMatches(r.title, r.body))
    .map((r) => `<article class="resource-card"><h3>${r.title}</h3><p>${r.body}</p></article>`)
    .join("");
}

/* ---------------------------------------------------------------------------
 * Markdown 渲染
 * ------------------------------------------------------------------------- */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  const htmlTags = [];
  let out = value.replace(
    /<[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>[\s\S]*?<\/[a-zA-Z][a-zA-Z0-9]*>|<[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\/>/g,
    (match) => {
      htmlTags.push(match);
      return `\x00HTML_${htmlTags.length - 1}\x00`;
    }
  );

  const entities = [];
  out = out.replace(/&[a-zA-Z0-9#]+;/g, (match) => {
    entities.push(match);
    return `\x00ENT_${entities.length - 1}\x00`;
  });

  out = escapeHtml(out)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" loading="lazy" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  out = out.replace(/\x00ENT_(\d+)\x00/g, (_, i) => entities[+i]);
  out = out.replace(/\x00HTML_(\d+)\x00/g, (_, i) => htmlTags[+i]);
  return out;
}

function resolveImagePath(src, docPath) {
  for (const [pattern, replacement] of imageRewrites) {
    if (pattern.test(src)) return src.replace(pattern, COURSE_ROOT + replacement);
  }
  if (/^https?:\/\//.test(src)) return src;
  const dir = docPath.substring(0, docPath.lastIndexOf("/") + 1);
  return dir + src;
}

function fixHtmlImagePaths(html, docPath) {
  return html.replace(/<img\s+([^>]*?)src="([^"]*)"([^>]*?)>/gi, (m, pre, src, post) => {
    return `<img ${pre}src="${resolveImagePath(src, docPath)}"${post}>`;
  });
}

/* ---------------------------------------------------------------------------
 * MDX 预处理
 *
 * CrewAI / Mintlify 体系的文档是 .mdx：带 YAML frontmatter，正文里混着大写开头的
 * JSX 组件（<Note>、<Steps>、<Card title="…">）。直接喂给下面的 Markdown 循环有两个
 * 问题：frontmatter 的 `---` 会变成一条 <hr> 加几行裸文本；而组件标签会被当成 HTML
 * 块，于是 htmlBlockDepth > 0，组件**内部**的 Markdown 全部原样吐出来。
 *
 * 所以在进主循环之前把组件标签换成哨兵行（MDX_RAW 前缀）：主循环认得这个前缀，
 * 直接把后面的 HTML push 出去，且不碰 htmlBlockDepth——组件内部的 Markdown 因此
 * 继续走正常渲染。
 * ------------------------------------------------------------------------- */
const MDX_RAW = "\x00MDXRAW:";

/** 渲染成提示框的组件 → CSS 修饰符 + 标签文案 */
const MDX_CALLOUTS = {
  Note: ["note", "Note"],
  Tip: ["tip", "Tip"],
  Info: ["info", "Info"],
  Check: ["ok", "Check"],
  Warning: ["warn", "Warning"],
  Danger: ["warn", "Danger"],
  Caution: ["warn", "Caution"],
  Callout: ["note", "Callout"]
};

/** 有 title / label 属性、值得留一行小标题的组件 */
const MDX_TITLED = new Set(["Card", "Accordion", "Step", "Tab", "Update", "Expandable", "Frame"]);

/** 参数说明：开标签渲染成一行签名，非自闭合时还要配一个 </section> */
const MDX_FIELDS = new Set(["ParamField", "ResponseField"]);

/** 纯布局容器：标签整个丢掉，内容照常按 Markdown 渲染 */
const MDX_WRAPPERS = new Set([
  "Steps", "CardGroup", "AccordionGroup", "Tabs", "TabItem",
  "CodeGroup", "Columns", "Column", "ResponseExample", "RequestExample"
]);

function mdxAttr(attrs, name) {
  const hit = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{"([^"]*)"\\})`));
  return hit ? hit[1] ?? hit[2] ?? hit[3] ?? "" : "";
}

/** frontmatter → { meta, body }；没有 frontmatter 时原样返回 */
function splitFrontmatter(text) {
  const hit = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!hit) return { meta: {}, body: text };
  const meta = {};
  hit[1].split("\n").forEach((line) => {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  });
  return { meta, body: text.slice(hit[0].length) };
}

/** 把 MDX 组件标签换成哨兵行。围栏代码块内的内容原样保留（示例里也会出现 JSX）。 */
function preprocessMdx(text) {
  return text
    .split(/(^[ \t]*```[\s\S]*?^[ \t]*```)/m)
    .map((chunk) => (/^[ \t]*```/.test(chunk) ? chunk : transformMdxTags(chunk)))
    .join("");
}

function transformMdxTags(chunk) {
  const open = (html) => `\n${MDX_RAW}${html}\n`;

  return chunk
    // MDX 注释与 import/export 语句：整行去掉
    .replace(/^\s*\{\s*\/\*[\s\S]*?\*\/\s*\}\s*$/gm, "")
    .replace(/^\s*(?:import|export)\s+[^\n]*$/gm, "")
    // 闭合标签（只认识的组件才动，其余原样留给 HTML 分支）
    .replace(/<\/([A-Z][A-Za-z0-9]*)>/g, (match, tag) => {
      if (MDX_CALLOUTS[tag]) return open("</aside>");
      if (MDX_TITLED.has(tag) || MDX_FIELDS.has(tag)) return open("</section>");
      if (MDX_WRAPPERS.has(tag)) return "\n";
      return match;
    })
    // 开标签（含自闭合；属性可跨行，因为 [^>] 也匹配换行）
    .replace(/<([A-Z][A-Za-z0-9]*)((?:\s[^>]*?)?)\s*(\/?)>/g, (match, tag, attrs, selfClose) => {
      if (MDX_CALLOUTS[tag]) {
        const [mod, label] = MDX_CALLOUTS[tag];
        if (selfClose) return "";
        return open(`<aside class="mdx-callout is-${mod}"><span class="mdx-callout-tag">${label}</span>`);
      }
      if (MDX_FIELDS.has(tag)) {
        const name = mdxAttr(attrs, "path") || mdxAttr(attrs, "name") || mdxAttr(attrs, "query") || mdxAttr(attrs, "body");
        const type = mdxAttr(attrs, "type");
        const required = /\brequired\b/.test(attrs);
        const head =
          `<p class="mdx-param"><code>${escapeHtml(name)}</code>` +
          (type ? `<em>${escapeHtml(type)}</em>` : "") +
          (required ? `<span class="mdx-param-req">required</span>` : "") +
          `</p>`;
        return selfClose ? open(head) : open(`<section class="mdx-block">${head}`);
      }
      if (MDX_TITLED.has(tag)) {
        const title = mdxAttr(attrs, "title") || mdxAttr(attrs, "label") || mdxAttr(attrs, "caption");
        const head = title ? `<p class="mdx-block-title">${inlineMarkdown(title)}</p>` : "";
        return selfClose ? open(head) : open(`<section class="mdx-block">${head}`);
      }
      if (MDX_WRAPPERS.has(tag)) return "\n";
      return match;
    });
}

/**
 * 正文首个标题是不是和 frontmatter 的 title 重复。
 *
 * 两种体系混在站里：Mintlify（CrewAI）只在 frontmatter 写标题，正文首个 H1 往往是
 * 另一句话（title "Introduction" / H1 "What is CrewAI?"）——那两条都得留。Fumadocs
 * （OpenChamber）则 frontmatter 和正文各写一遍同样的标题，照单渲染会连出两个 H1。
 * 所以只在**文字完全相同**时吞掉 frontmatter 那条，不做「有 H1 就不渲染」的粗判。
 */
function bodyRepeatsTitle(body, title) {
  if (!title) return false;
  let inFence = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) { inFence = !inFence; continue; }
    if (inFence || !line) continue;
    const head = line.match(/^(#{1,6})\s+(.*)$/);
    return !!head && head[1].length === 1 && head[2].trim() === title.trim();
  }
  return false;
}

function markdownToHtml(markdown, docPath) {
  const { meta, body } = splitFrontmatter(markdown.replace(/\r\n/g, "\n"));
  const lines = preprocessMdx(body).split("\n");
  const lead = [];
  if (meta.title && !bodyRepeatsTitle(body, meta.title)) lead.push(`<h1>${inlineMarkdown(meta.title)}</h1>`);
  if (meta.description) lead.push(`<p class="doc-lead">${inlineMarkdown(meta.description)}</p>`);
  const html = lead;
  let inCode = false;
  let codeIndent = 0;
  let listType = null; // "ul" | "ol" | null
  let inTable = false;
  let htmlBlockDepth = 0;
  let tableRows = [];

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const openList = (type) => {
    if (listType === type) return;
    closeList();
    html.push(`<${type}>`);
    listType = type;
  };

  function closeTable() {
    if (!inTable) return;
    const rows = tableRows.filter((row) => !/^\s*\|?\s*:?-{3,}:?\s*\|/.test(row));
    html.push("<table>");
    rows.forEach((row, index) => {
      const cells = row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const tag = index === 0 ? "th" : "td";
      html.push(`<tr>${cells.map((c) => `<${tag}>${inlineMarkdown(c)}</${tag}>`).join("")}</tr>`);
    });
    html.push("</table>");
    tableRows = [];
    inTable = false;
  }

  /* 软换行合并：Markdown 里连续的正文行属于同一段。逐行各包一个 <p> 会把一句话
     切成好几段，段间距落在句子中间。CJK 之间直接接上，其余用空格——中文文档硬换行
     时补空格会多出一个可见的空隙。 */
  const CJK = /[　-〿㐀-䶿一-鿿豈-﫿＀-￯]/;
  let buffer = [];
  let bufferKind = null; // "p" | "quote" | null

  const joinWrapped = (parts) =>
    parts.reduce((acc, cur) => {
      if (!acc) return cur;
      const glue = CJK.test(acc.slice(-1)) && CJK.test(cur.slice(0, 1)) ? "" : " ";
      return acc + glue + cur;
    }, "");

  const flushBuffer = () => {
    if (!buffer.length) {
      bufferKind = null;
      return;
    }
    const text = inlineMarkdown(joinWrapped(buffer));
    html.push(bufferKind === "quote" ? `<blockquote>${text}</blockquote>` : `<p>${text}</p>`);
    buffer = [];
    bufferKind = null;
  };

  const pushBuffer = (kind, text) => {
    if (bufferKind !== kind) flushBuffer();
    bufferKind = kind;
    buffer.push(text);
  };

  const isHtmlBlockStart = (l) => /^\s*<[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>/.test(l);
  const isHtmlBlockEnd = (l) => /^\s*<\/[a-zA-Z][a-zA-Z0-9]*>/.test(l);
  const isSelfClosing = (l) =>
    /^\s*<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b[^>]*>/i.test(l) ||
    /^\s*<[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\/>/.test(l) ||
    /^\s*<[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>.*<\/[a-zA-Z][a-zA-Z0-9]*>/.test(l);
  const isHtmlLine = (l) =>
    l.trim().startsWith("<") && (isHtmlBlockStart(l) || isHtmlBlockEnd(l) || isSelfClosing(l));

  lines.forEach((line) => {
    // 围栏允许缩进：MDX 的 <Step> / 列表项里的代码块都是缩进的，
    // 只认顶格的 ``` 会让这些块整段掉进正文，反引号还会被当成行内 code。
    const fence = line.match(/^(\s*)```(.*)$/);
    if (fence) {
      flushBuffer();
      closeList();
      closeTable();
      if (!inCode) {
        codeIndent = fence[1].length;
        html.push(`<pre data-lang="${escapeHtml(fence[2].trim())}"><code>`);
        inCode = true;
      } else {
        html.push("</code></pre>");
        inCode = false;
      }
      return;
    }

    if (inCode) {
      // 去掉围栏本身的缩进，否则块里每行都白白多出几格
      // 不要在这里补 \n——最后的 join("\n") 已经负责换行，补了会让代码块行距翻倍
      html.push(escapeHtml(line.slice(0, codeIndent).trim() ? line : line.slice(codeIndent)));
      return;
    }

    // MDX 哨兵：直接吐 HTML，且不动 htmlBlockDepth——组件内部继续按 Markdown 渲染
    if (line.startsWith(MDX_RAW)) {
      flushBuffer();
      closeList();
      closeTable();
      html.push(line.slice(MDX_RAW.length));
      return;
    }

    if (htmlBlockDepth > 0 || isHtmlLine(line)) {
      flushBuffer();
      closeList();
      closeTable();
      html.push(line);
      if (isHtmlBlockStart(line) && !isSelfClosing(line) && !isHtmlBlockEnd(line)) htmlBlockDepth++;
      else if (isHtmlBlockEnd(line) && htmlBlockDepth > 0) htmlBlockDepth--;
      return;
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushBuffer();
      closeList();
      inTable = true;
      tableRows.push(line);
      return;
    }
    closeTable();

    if (!line.trim()) {
      flushBuffer();
      closeList();
      if (htmlBlockDepth > 0) html.push(line);
      return;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushBuffer();
      closeList();
      html.push("<hr />");
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushBuffer();
      closeList();
      const level = Math.min(heading[1].length, 4);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      return;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ordered) {
      flushBuffer();
      openList("ol");
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      return;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      flushBuffer();
      openList("ul");
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      return;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeList();
      pushBuffer("quote", quote[1]);
      return;
    }

    // 列表项的续行（缩进但不是新项）并入上一个 <li>，不要另起一段
    if (listType && /^\s{2,}\S/.test(line) && !buffer.length) {
      const last = html.length - 1;
      if (html[last] && html[last].startsWith("<li>")) {
        html[last] = html[last].replace(/<\/li>$/, " " + inlineMarkdown(line.trim()) + "</li>");
        return;
      }
    }

    closeList();
    pushBuffer("p", line.trim());
  });

  flushBuffer();
  closeList();
  closeTable();
  if (inCode) html.push("</code></pre>");

  return fixHtmlImagePaths(html.join("\n"), docPath);
}

/* ---------------------------------------------------------------------------
 * 阅读器
 * ------------------------------------------------------------------------- */
function labelFor(path) {
  for (const group of menuData) {
    const hit = group.items.find((i) => i.doc === path);
    if (hit) return `${group.title} · ${hit.label}`;
  }
  return path;
}

function updateDocUI(docPath) {
  docButtons.forEach((btn) => btn.classList.toggle("done", !!state.docsDone[btn.dataset.doc]));
  if (el.docTitle) el.docTitle.textContent = labelFor(docPath);
  if (el.markDone) {
    const isDone = !!state.docsDone[docPath];
    el.markDone.textContent = isDone ? "✓ 已完成" : "标记完成";
    el.markDone.classList.toggle("is-done", isDone);
  }
  const idx = docList.indexOf(docPath);
  if (el.prevDoc) el.prevDoc.disabled = idx <= 0;
  if (el.nextDoc) el.nextDoc.disabled = idx < 0 || idx >= docList.length - 1;
  updateStats();
}

/* ---------------------------------------------------------------------------
 * 跨文档互链
 *
 * Fumadocs / Starlight 这类文档站，正文互链写的是站点路由（`/zh-cn/security/`）而不是
 * 相对文件路径。照原样渲染，href 会打到本地服务的根目录上，点一下就是 404——OpenChamber
 * 那 45 篇里有 180 多条这种链接，几乎每页末尾的「相关内容」整节都是。
 *
 * 路由和文件是镜像关系：`/zh-cn/security/` ↔ `<内容根>/zh-cn/security.mdx`。内容根不写死，
 * 而是从当前文档路径逐级往上试——命中站内已收录的文档才算数。所以这套改写对任何按路由
 * 镜像组织文件的文档站都成立，不是给 openchamber 开的后门；解析不到就原样留着，不假装
 * 能打开。
 * ------------------------------------------------------------------------- */
function resolveDocRoute(route, currentDoc) {
  const slug = String(route).split(/[?#]/)[0].replace(/^\/+|\/+$/g, "");
  if (!slug) return null;
  const ext = (currentDoc.match(/\.(?:mdx|markdown|md)$/i) || [".mdx"])[0];
  const parts = currentDoc.split("/");
  parts.pop(); // 从同级目录开始，逐级上溯找内容根
  while (parts.length) {
    const candidate = `${parts.join("/")}/${slug}${ext}`;
    if (docList.includes(candidate)) return candidate;
    parts.pop();
  }
  return null;
}

function linkCrossRefs(root, currentDoc) {
  root.querySelectorAll('a[href^="/"]').forEach((a) => {
    const target = resolveDocRoute(a.getAttribute("href"), currentDoc);
    if (!target) return;
    a.dataset.openDoc = target;      // 交给全局 [data-open-doc] 代理，走站内阅读器
    a.setAttribute("href", "#reader");
    a.removeAttribute("target");
    a.removeAttribute("rel");
    a.classList.add("doc-xref");
  });
}

async function loadDoc(path) {
  if (!el.docView) return;
  el.docView.innerHTML = '<p class="doc-loading">正在读取本地 Markdown…</p>';
  el.docView.scrollTop = 0;
  try {
    const response = await fetch(docUrl(path));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    el.docView.innerHTML = markdownToHtml(markdown, docUrl(path));
    linkCrossRefs(el.docView, path);
    state.lastDoc = path;
    localStorage.setItem(LS.lastDoc, path);
    updateDocUI(path);
  } catch (error) {
    el.docView.innerHTML = `
      <div class="doc-error">
        <h3>无法读取这个 Markdown</h3>
        <p>阅读器需要通过本地服务访问。在仓库根目录运行：</p>
        <pre><code>python3 -m http.server 8765</code></pre>
        <p>然后打开 <code>http://localhost:8765/learning-site/</code>。</p>
        <p>当前路径：<code>${escapeHtml(docUrl(path))}</code></p>
        <p>错误信息：<code>${escapeHtml(String(error))}</code></p>
      </div>`;
  }
}

function setActiveDoc(path) {
  document.querySelectorAll(".reader-link").forEach((item) => {
    item.classList.toggle("active", item.dataset.doc === path);
  });
}

function openDoc(path) {
  if (!docList.includes(path)) {
    // 不在菜单里的文档（例如阶段配套阅读指向的具体章节）也允许直接打开
    setActiveDoc(path);
    loadDoc(path);
    return;
  }
  const group = menuData.find((g) => g.items.some((i) => i.doc === path));
  if (group) {
    const groupIndex = menuData.indexOf(group);
    state.collapsedGroups = state.collapsedGroups.filter((i) => i !== groupIndex);
    localStorage.setItem(LS.collapsed, JSON.stringify(state.collapsedGroups));
    renderReaderMenu();
  }
  setActiveDoc(path);
  loadDoc(path);
  const reader = document.querySelector("#reader");
  if (reader) reader.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderReaderMenu() {
  if (!el.readerMenu) return;
  const filter = (el.readerFilter?.value || "").trim().toLowerCase();
  el.readerMenu.innerHTML = "";

  menuData.forEach((group, groupIndex) => {
    const items = filter
      ? group.items.filter(
          (i) => i.label.toLowerCase().includes(filter) || group.title.toLowerCase().includes(filter)
        )
      : group.items;
    if (!items.length) return;

    const groupEl = document.createElement("div");
    groupEl.className = "reader-group";
    const track = trackOf(group.track);
    if (track) groupEl.dataset.track = track.id;
    const collapsed = !filter && state.collapsedGroups.includes(groupIndex);
    if (collapsed) groupEl.classList.add("collapsed");

    const doneInGroup = group.items.filter((i) => state.docsDone[i.doc]).length;

    const titleBtn = document.createElement("button");
    titleBtn.className = "reader-group-title";
    titleBtn.innerHTML = `<span>${group.title}</span><em>${doneInGroup}/${group.items.length}</em>`;
    titleBtn.addEventListener("click", () => {
      groupEl.classList.toggle("collapsed");
      const isCollapsed = groupEl.classList.contains("collapsed");
      state.collapsedGroups = isCollapsed
        ? [...new Set([...state.collapsedGroups, groupIndex])]
        : state.collapsedGroups.filter((i) => i !== groupIndex);
      localStorage.setItem(LS.collapsed, JSON.stringify(state.collapsedGroups));
    });

    const itemsEl = document.createElement("div");
    itemsEl.className = "reader-group-items";
    items.forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "reader-link";
      btn.dataset.doc = item.doc;
      btn.textContent = item.label;
      if (state.docsDone[item.doc]) btn.classList.add("done");
      btn.addEventListener("click", () => {
        setActiveDoc(item.doc);
        loadDoc(item.doc);
      });
      itemsEl.appendChild(btn);
    });

    groupEl.append(titleBtn, itemsEl);
    el.readerMenu.appendChild(groupEl);
  });

  docButtons = Array.from(document.querySelectorAll(".reader-link"));
  docList = allDocs();
  setActiveDoc(state.lastDoc);
}

function stepDoc(delta) {
  const idx = docList.indexOf(state.lastDoc);
  const next = idx + delta;
  if (idx < 0 || next < 0 || next >= docList.length) return;
  const path = docList[next];
  openDoc(path);
  // 不用 scrollIntoView：它会连带滚动整页容器
  const btn = docButtons.find((b) => b.dataset.doc === path);
  if (btn && el.readerMenu) {
    const menuBox = el.readerMenu.getBoundingClientRect();
    const btnBox = btn.getBoundingClientRect();
    if (btnBox.top < menuBox.top || btnBox.bottom > menuBox.bottom) {
      el.readerMenu.scrollTop += btnBox.top - menuBox.top - menuBox.height / 3;
    }
  }
}

/* ---------------------------------------------------------------------------
 * 事件
 * ------------------------------------------------------------------------- */
function renderAll() {
  renderTrackBoard();
  renderTrackFilter();
  renderSpectrum();
  renderStages();
  renderCourses();
  renderProjects();
  renderResources();
  updateStats();
}

el.search?.addEventListener("input", (e) => {
  state.query = e.target.value.trim();
  renderStages();
  renderCourses();
  renderProjects();
  renderResources();
});

el.readerFilter?.addEventListener("input", renderReaderMenu);

document.addEventListener("change", (e) => {
  const checkbox = e.target.closest("[data-check]");
  if (!checkbox) return;
  state.done[checkbox.dataset.check] = checkbox.checked;
  localStorage.setItem(LS.done, JSON.stringify(state.done));
  renderSpectrum();
  renderStages();
  updateStats();
});

document.addEventListener("click", (e) => {
  const trackSet = e.target.closest("[data-track-set]");
  if (trackSet) {
    state.track = trackSet.dataset.trackSet;
    localStorage.setItem(LS.track, state.track);
    renderTrackFilter();
    renderCourses();
    return;
  }

  const trackJump = e.target.closest("[data-track-jump]");
  if (trackJump) {
    state.track = trackJump.dataset.trackJump;
    localStorage.setItem(LS.track, state.track);
    renderTrackFilter();
    renderCourses();
    document.querySelector("#courses")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const stageJump = e.target.closest("[data-stage-jump]");
  if (stageJump) {
    document.querySelector("#" + stageJump.dataset.stageJump)?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    return;
  }

  const openBtn = e.target.closest("[data-open-doc]");
  if (openBtn) {
    openDoc(openBtn.dataset.openDoc);
  }
});

el.markDone?.addEventListener("click", () => {
  const path = state.lastDoc;
  state.docsDone[path] = !state.docsDone[path];
  localStorage.setItem(LS.docsDone, JSON.stringify(state.docsDone));
  renderReaderMenu();
  updateDocUI(path);
});

el.prevDoc?.addEventListener("click", () => stepDoc(-1));
el.nextDoc?.addEventListener("click", () => stepDoc(1));

document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
  if (e.key === "/" && !typing) {
    e.preventDefault();
    el.search?.focus();
  }
  if (typing) return;
  if (e.key === "[") stepDoc(-1);
  if (e.key === "]") stepDoc(1);
});

/* ---------------------------------------------------------------------------
 * 启动
 * ------------------------------------------------------------------------- */
renderAll();
renderReaderMenu();

const initialDoc = docList.includes(state.lastDoc) ? state.lastDoc : DEFAULT_DOC;
state.lastDoc = initialDoc;
setActiveDoc(initialDoc);
loadDoc(initialDoc);
