import { describe, expect, it } from "vitest";

import { renderMarkdownDocument } from "./markdown";

describe("safe Markdown reader", () => {
  it("renders the supported document primitives and returns a table of contents", () => {
    const result = renderMarkdownDocument(
      [
        "# Agent loop",
        "",
        "A **small** loop with `observe` and [a guide](https://example.com).",
        "",
        "- Observe the world",
        "- Choose an action",
        "",
        "```ts",
        "return nextStep();",
        "```",
      ].join("\n"),
    );

    expect(result.headings).toEqual([
      { id: "agent-loop", text: "Agent loop", level: 1 },
    ]);
    expect(result.html).toContain("<strong>small</strong>");
    expect(result.html).toContain('<a href="https://example.com"');
    expect(result.html).toContain("<ul>");
    expect(result.html).toContain('class="language-ts"');
  });

  it("drops script subtrees, event handlers and unsafe link protocols", () => {
    const result = renderMarkdownDocument(
      '<script>alert("x")</script>\n\n<a onclick="steal()" href="https://example.com">ok</a>\n\n[run](javascript:alert(1))',
    );

    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("alert(");
    expect(result.html).not.toContain("onclick");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).toContain('<a href="https://example.com">ok</a>');
  });

  it("keeps allowlisted presentational HTML that upstream READMEs rely on", () => {
    const result = renderMarkdownDocument(
      [
        '<div align="center">',
        "  <h1>Hello-Agents</h1>",
        "  <p><em>从零开始</em></p>",
        "</div>",
        "",
        "&emsp;&emsp;段落缩进应当保留。",
      ].join("\n"),
    );

    expect(result.html).toContain('<div align="center">');
    expect(result.html).toContain("<h1>Hello-Agents</h1>");
    expect(result.html).toContain("&emsp;&emsp;");
    expect(result.html).not.toContain("&amp;emsp;");
    // Block-level HTML must not be wrapped in a paragraph.
    expect(result.html).not.toContain("<p><div");
  });

  it("strips unknown tags but keeps their text, and closes unbalanced tags", () => {
    const result = renderMarkdownDocument(
      "<marquee>走马灯</marquee>\n\n<strong>未闭合",
    );

    expect(result.html).not.toContain("marquee");
    expect(result.html).toContain("走马灯");
    expect(result.html).toContain("<strong>未闭合</strong>");
  });

  it("renders GFM tables, thematic breaks and nested lists", () => {
    const result = renderMarkdownDocument(
      [
        "| 章节 | 状态 |",
        "| --- | --- |",
        "| 第一章 | 完成 |",
        "",
        "---",
        "",
        "- 顶层",
        "  - 嵌套",
        "- [x] 已完成任务",
      ].join("\n"),
    );

    expect(result.html).toContain("<th>章节</th>");
    expect(result.html).toContain("<td>第一章</td>");
    expect(result.html).toContain('<div class="table-scroll">');
    expect(result.html).toContain("<hr />");
    expect(result.html).toContain("<ul><li>顶层<ul><li>嵌套</li></ul></li>");
    expect(result.html).toContain('class="task-item"');
  });

  it("renders only safe images and lets the caller resolve allowlisted relative paths", () => {
    const result = renderMarkdownDocument(
      "![diagram](images/loop.png) ![remote](https://example.com/loop.png) ![bad](javascript:alert(1))",
      {
        resolveImageSrc: (source) =>
          `/api/image?path=${encodeURIComponent(source)}`,
      },
    );

    expect(result.html).toContain('src="/api/image?path=images%2Floop.png"');
    expect(result.html).toContain('src="https://example.com/loop.png"');
    expect(result.html).not.toContain("javascript:");
  });

  it("resolves relative sources inside raw <img> tags too", () => {
    const result = renderMarkdownDocument(
      '<img src="docs/images/hero.png" alt="hero" width="100%">',
      {
        resolveImageSrc: (source) =>
          `/api/image?path=${encodeURIComponent(source)}`,
      },
    );

    expect(result.html).toContain(
      'src="/api/image?path=docs%2Fimages%2Fhero.png"',
    );
    expect(result.html).toContain('width="100%"');
  });
});
