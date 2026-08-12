export type MarkdownHeading = {
  id: string;
  text: string;
  level: number;
};

export type MarkdownDocument = {
  html: string;
  headings: MarkdownHeading[];
};

export type MarkdownRenderOptions = {
  resolveImageSrc?: (source: string) => string | null;
  /**
   * Rewrites a relative link found in the document (a sibling chapter, an
   * asset) into a URL this site can serve. Returning null drops the link and
   * keeps only its text — relative hrefs are resolved by the browser against
   * the reader route, so emitting them unchanged produces guaranteed 404s.
   */
  resolveDocumentHref?: (source: string) => string | null;
};

/**
 * Third-party material is written for GitHub, so it mixes Markdown with
 * presentational HTML. The reader keeps that HTML instead of escaping it, but
 * only through the allowlists below: anything not named here is dropped.
 */
const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "picture",
  "pre",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

/** Dropped together with everything they contain. */
const DISCARDED_SUBTREES = new Set([
  "base",
  "button",
  "embed",
  "form",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "noscript",
  "object",
  "script",
  "select",
  "style",
  "svg",
  "template",
  "textarea",
]);

const VOID_TAGS = new Set(["br", "hr", "img"]);

/**
 * Upstream READMEs embed dozens of absolute image URLs (badges, avatars, CDN
 * screenshots) that stay absolute after sanitising. Those requests still leave
 * the reader's browser, so every reader image is emitted without a referrer and
 * off the critical path — a document here can run to tens of thousands of
 * pixels. Blocking remote images outright is a content-policy change, not a
 * rendering one, and would need its own decision record.
 */
const IMAGE_LOADING_ATTRIBUTES =
  ' loading="lazy" decoding="async" referrerpolicy="no-referrer"';

const GLOBAL_ATTRIBUTES = new Set(["align", "title"]);

const TAG_ATTRIBUTES: Record<string, ReadonlySet<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  details: new Set(["open"]),
};

const BLOCK_LEVEL_HTML =
  /^<(?:div|table|figure|picture|details|section|header|footer|nav|aside|main|blockquote|center|dl|ol|ul|pre|hr|h[1-6]|p|img|br)\b/i;

const VALID_ENTITY =
  /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/;

/**
 * Escapes text for HTML output while leaving already-valid character entities
 * intact — upstream READMEs lean on `&emsp;` and friends for layout.
 */
function escapeText(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "&") {
      const rest = value.slice(index);
      const entity = rest.match(VALID_ENTITY);
      if (entity) {
        output += entity[0];
        index += entity[0].length - 1;
        continue;
      }
      output += "&amp;";
      continue;
    }
    if (character === "<") {
      output += "&lt;";
      continue;
    }
    if (character === ">") {
      output += "&gt;";
      continue;
    }
    output += character;
  }
  return output;
}

/** Full escaping, used for code spans and for values we place inside attributes. */
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHref(value: string, options: MarkdownRenderOptions = {}) {
  const href = value.trim();
  if (/^(?:https?:|mailto:)/i.test(href)) {
    return href;
  }

  if (/^#[^\s<>"']*$/.test(href)) {
    return href;
  }

  // Site-absolute links are already routable.
  if (/^\/(?!\/)/.test(href)) {
    return href;
  }

  // Anything else is relative to the source document, not to the reader route.
  // Only the caller knows how to map it onto a servable URL.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  return options.resolveDocumentHref?.(href) ?? null;
}

/**
 * Remote images are used as-is; every other source must go through the
 * caller's resolver, which decides whether the path is an allowlisted local
 * file. Other schemes, absolute paths and traversal segments are rejected.
 */
function safeImageHref(
  value: string,
  resolveImageSrc?: (source: string) => string | null,
) {
  const href = value.trim();
  if (/^https?:\/\//i.test(href)) return href;
  if (
    !resolveImageSrc ||
    href === "" ||
    href.startsWith("/") ||
    href.includes("\\") ||
    /\s/.test(href) ||
    /^[a-z][a-z0-9+.-]*:/i.test(href)
  ) {
    return null;
  }

  const normalized = href.replace(/^\.\//, "").split(/[?#]/)[0];
  if (
    normalized === "" ||
    normalized
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return null;
  }

  return resolveImageSrc(normalized);
}

const ATTRIBUTE_PATTERN =
  /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function sanitizeAttributes(
  tag: string,
  rawAttributes: string,
  options: MarkdownRenderOptions,
) {
  const allowed = TAG_ATTRIBUTES[tag];
  let output = "";

  for (const match of rawAttributes.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!GLOBAL_ATTRIBUTES.has(name) && !allowed?.has(name)) continue;

    if (name === "href") {
      const href = safeHref(value, options);
      if (href === null) continue;
      output += ` href="${escapeHtml(href)}"`;
      continue;
    }

    if (name === "src") {
      const src = safeImageHref(value, options.resolveImageSrc);
      if (src === null) continue;
      output += ` src="${escapeHtml(src)}"`;
      continue;
    }

    if (name === "open") {
      output += " open";
      continue;
    }

    output += ` ${name}="${escapeHtml(value)}"`;
  }

  return output;
}

const TAG_PATTERN =
  /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

/**
 * Rewrites a raw fragment so only allowlisted tags and attributes survive.
 * Unknown tags lose their markup but keep their text; discarded subtrees lose
 * both. Unclosed allowlisted tags are closed so one upstream typo cannot break
 * the page layout.
 */
function sanitizeHtml(value: string, options: MarkdownRenderOptions) {
  let output = "";
  let cursor = 0;
  let discardDepth = 0;
  let discardTag = "";
  const openTags: string[] = [];

  for (const match of value.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    if (discardDepth === 0) {
      output += escapeText(value.slice(cursor, index));
    }
    cursor = index + match[0].length;

    const tag = match[1]?.toLowerCase();
    if (tag === undefined) continue; // HTML comment

    const closing = match[0].startsWith("</");

    if (discardDepth > 0) {
      if (tag === discardTag) {
        discardDepth += closing ? -1 : 1;
      }
      continue;
    }

    if (DISCARDED_SUBTREES.has(tag)) {
      if (!closing && !match[0].endsWith("/>")) {
        discardDepth = 1;
        discardTag = tag;
      }
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) continue;

    if (closing) {
      const position = openTags.lastIndexOf(tag);
      if (position === -1) continue;
      while (openTags.length > position) {
        output += `</${openTags.pop()}>`;
      }
      continue;
    }

    const attributes = sanitizeAttributes(tag, match[2] ?? "", options);
    if (tag === "img" && !attributes.includes(" src=")) continue;

    if (VOID_TAGS.has(tag)) {
      output += `<${tag}${attributes}${tag === "img" ? IMAGE_LOADING_ATTRIBUTES : ""} />`;
      continue;
    }

    output += `<${tag}${attributes}>`;
    openTags.push(tag);
  }

  if (discardDepth === 0) {
    output += escapeText(value.slice(cursor));
  }
  while (openTags.length > 0) {
    output += `</${openTags.pop()}>`;
  }

  return output;
}

function renderInline(value: string, options: MarkdownRenderOptions = {}) {
  const tokenPattern =
    /!\[([^\]]*)\]\(([^)\s]+)\)|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
  let output = "";
  let cursor = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    output += sanitizeHtml(value.slice(cursor, index), options);

    if (match[1] !== undefined && match[2] !== undefined) {
      const src = safeImageHref(match[2], options.resolveImageSrc);
      if (src === null) {
        output += escapeText(match[1]);
      } else {
        output += `<img src="${escapeHtml(src)}" alt="${escapeHtml(match[1])}"${IMAGE_LOADING_ATTRIBUTES} />`;
      }
    } else if (match[3] !== undefined) {
      output += `<code>${escapeHtml(match[3])}</code>`;
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const href = safeHref(match[5], options);
      if (href === null) {
        output += escapeText(match[4]);
      } else {
        const external = /^(?:https?:)?\/\//i.test(href);
        output += `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noreferrer"' : ""}>${renderInline(match[4], options)}</a>`;
      }
    } else if (match[6] !== undefined || match[7] !== undefined) {
      output += `<strong>${renderInline(match[6] ?? match[7] ?? "", options)}</strong>`;
    } else {
      output += `<em>${renderInline(match[8] ?? match[9] ?? "", options)}</em>`;
    }

    cursor = index + match[0].length;
  }

  return output + sanitizeHtml(value.slice(cursor), options);
}

function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function slugify(value: string, usedIds: Set<string>) {
  const base =
    plainText(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section";
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

const BULLET_ITEM = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^(\s*)\d+[.)]\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const THEMATIC_BREAK = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

function isTableRow(line: string) {
  return line.includes("|") && /\S/.test(line);
}

function isBlockStart(line: string) {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^\s*```/.test(line) ||
    BULLET_ITEM.test(line) ||
    ORDERED_ITEM.test(line) ||
    /^>\s?/.test(line) ||
    THEMATIC_BREAK.test(line) ||
    BLOCK_LEVEL_HTML.test(line.trim())
  );
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

type ListItem = { content: string[]; children: string | null };

/**
 * Collects one list at the current indent level, recursing for anything
 * indented further so nested bullets keep their structure.
 */
function parseList(
  lines: string[],
  start: number,
  indent: number,
  options: MarkdownRenderOptions,
): { html: string; next: number } {
  const ordered = ORDERED_ITEM.test(lines[start]);
  const pattern = ordered ? ORDERED_ITEM : BULLET_ITEM;
  const items: ListItem[] = [];
  let index = start;

  while (index < lines.length) {
    const match = lines[index].match(pattern);
    if (!match || match[1].length < indent) break;
    if (match[1].length > indent) {
      const nested = parseList(lines, index, match[1].length, options);
      const previous = items[items.length - 1];
      if (previous) previous.children = (previous.children ?? "") + nested.html;
      index = nested.next;
      continue;
    }

    const item: ListItem = { content: [match[2]], children: null };
    items.push(item);
    index += 1;

    // Continuation lines belong to the item until a blank line or a new block.
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !BULLET_ITEM.test(lines[index]) &&
      !ORDERED_ITEM.test(lines[index]) &&
      !isBlockStart(lines[index])
    ) {
      item.content.push(lines[index].trim());
      index += 1;
    }
  }

  const rendered = items
    .map(({ content, children }) => {
      const text = content.join(" ");
      const task = text.match(/^\[([ xX])\]\s+(.*)$/);
      const body = task
        ? `<span class="task-mark" aria-hidden="true">${task[1] === " " ? "☐" : "☑"}</span> ${renderInline(task[2], options)}`
        : renderInline(text, options);
      return `<li${task ? ' class="task-item"' : ""}>${body}${children ?? ""}</li>`;
    })
    .join("");

  return {
    html: `<${ordered ? "ol" : "ul"}>${rendered}</${ordered ? "ol" : "ul"}>`,
    next: index,
  };
}

export function renderMarkdownDocument(
  markdown: string,
  options: MarkdownRenderOptions = {},
): MarkdownDocument {
  const lines = withoutFrontmatter(markdown).split("\n");
  const headings: MarkdownHeading[] = [];
  const usedIds = new Set<string>();
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const language = fence[1] ? ` class="language-${fence[1]}"` : "";
      blocks.push(
        `<pre><code${language}>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
      );
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const text = plainText(heading[2]);
      const level = Math.min(heading[1].length, 4);
      const id = slugify(text, usedIds);
      headings.push({ id, text, level });
      blocks.push(
        `<h${level} id="${id}">${renderInline(heading[2], options)}</h${level}>`,
      );
      index += 1;
      continue;
    }

    // GFM pipe table: a header row immediately followed by a divider row.
    if (
      isTableRow(line) &&
      index + 1 < lines.length &&
      TABLE_DIVIDER.test(lines[index + 1])
    ) {
      const header = splitTableRow(line);
      index += 2;
      const bodyRows: string[][] = [];
      while (index < lines.length && isTableRow(lines[index])) {
        bodyRows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const head = header
        .map((cell) => `<th>${renderInline(cell, options)}</th>`)
        .join("");
      const body = bodyRows
        .map(
          (row) =>
            `<tr>${row
              .map((cell) => `<td>${renderInline(cell, options)}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      blocks.push(
        `<div class="table-scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
      continue;
    }

    if (BULLET_ITEM.test(line) || ORDERED_ITEM.test(line)) {
      const match = (line.match(BULLET_ITEM) ?? line.match(ORDERED_ITEM))!;
      const list = parseList(lines, index, match[1].length, options);
      blocks.push(list.html);
      index = list.next;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quote = lines[index].match(/^>\s?(.*)$/);
        if (!quote) break;
        quoteLines.push(quote[1]);
        index += 1;
      }
      blocks.push(
        `<blockquote>${renderInline(quoteLines.join("\n"), options)}</blockquote>`,
      );
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !isBlockStart(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    const text = paragraph.join("\n");
    // Block-level HTML must not be wrapped in <p>; browsers would split it.
    blocks.push(
      BLOCK_LEVEL_HTML.test(line.trim())
        ? sanitizeHtml(text, options)
        : `<p>${renderInline(text, options)}</p>`,
    );
  }

  return { html: blocks.join("\n"), headings };
}

function withoutFrontmatter(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return normalized;
  }

  const end = normalized.indexOf("\n---", 4);
  return end === -1 ? normalized : normalized.slice(end + 4).replace(/^\n/, "");
}
