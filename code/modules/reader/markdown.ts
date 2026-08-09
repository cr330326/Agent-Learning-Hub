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
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHref(value: string) {
  const href = value.trim();
  if (/^(?:https?:|mailto:)/i.test(href)) {
    return href;
  }

  if (/^(?:\/(?!\/)|\.\.?\/)/.test(href)) {
    return href;
  }

  return null;
}

function removeEventAttributes(value: string) {
  return value.replace(/\bon[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function safeImageHref(
  value: string,
  resolveImageSrc?: (source: string) => string | null,
) {
  const href = value.trim();
  const directHref = safeHref(href);
  if (directHref !== null) return directHref;
  if (
    resolveImageSrc &&
    !href.startsWith("/") &&
    !href.includes("\\") &&
    !href.includes("\u0000") &&
    href
      .split("/")
      .every((segment) => segment !== "" && segment !== "." && segment !== "..")
  ) {
    return resolveImageSrc(href);
  }
  return null;
}

function renderInline(value: string, options: MarkdownRenderOptions = {}) {
  const tokenPattern =
    /!\[([^\]]*)\]\(([^)\s]+)\)|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
  let output = "";
  let cursor = 0;

  for (const match of value.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    output += escapeHtml(value.slice(cursor, index));

    if (match[1] !== undefined && match[2] !== undefined) {
      const src = safeImageHref(match[2], options.resolveImageSrc);
      if (src === null) {
        output += escapeHtml(match[1]);
      } else {
        output += `<img src="${escapeHtml(src)}" alt="${escapeHtml(match[1])}" loading="lazy" />`;
      }
    } else if (match[3] !== undefined) {
      output += `<code>${escapeHtml(match[3])}</code>`;
    } else if (match[4] !== undefined && match[5] !== undefined) {
      const href = safeHref(match[5]);
      if (href === null) {
        output += escapeHtml(match[4]);
      } else {
        output += `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${renderInline(match[4], options)}</a>`;
      }
    } else if (match[6] !== undefined || match[7] !== undefined) {
      output += `<strong>${renderInline(match[6] ?? match[7] ?? "", options)}</strong>`;
    } else {
      output += `<em>${renderInline(match[8] ?? match[9] ?? "", options)}</em>`;
    }

    cursor = index + match[0].length;
  }

  return output + escapeHtml(value.slice(cursor));
}

function plainText(value: string) {
  return value
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

function isBlockStart(line: string) {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^>\s?/.test(line)
  );
}

function withoutFrontmatter(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return normalized;
  }

  const end = normalized.indexOf("\n---", 4);
  return end === -1 ? normalized : normalized.slice(end + 4).replace(/^\n/, "");
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

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${renderInline(item[1], options)}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(`<li>${renderInline(item[1], options)}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
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
    const paragraphText = paragraph.some((part) => /<[^>]+>/.test(part))
      ? removeEventAttributes(paragraph.join("\n"))
      : paragraph.join("\n");
    blocks.push(`<p>${renderInline(paragraphText, options)}</p>`);
  }

  return { html: blocks.join("\n"), headings };
}
