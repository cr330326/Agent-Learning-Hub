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

  it("escapes raw HTML and rejects unsafe link protocols", () => {
    const result = renderMarkdownDocument(
      '<script>alert("x")</script>\n\n<a onclick="steal()">bad</a>\n\n[run](javascript:alert(1))',
    );

    expect(result.html).not.toContain("<script");
    expect(result.html).not.toContain("onclick");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).toContain("&lt;script&gt;");
  });
});
