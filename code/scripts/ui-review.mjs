#!/usr/bin/env node
// Walk every public route in a running instance, capture full-page
// screenshots at three widths, and report layout/console regressions.
//
// This is a maintenance command, not a quality gate: it needs a running
// server and a Playwright browser, so `npm run check` does not call it.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "roadmap", path: "/roadmap" },
  { name: "stage-first", path: "/roadmap/stage-0" },
  { name: "stage-last", path: "/roadmap/stage-8" },
  { name: "courses", path: "/courses" },
  { name: "courses-page-2", path: "/courses?page=2" },
  { name: "courses-filtered", path: "/courses?track=agentic" },
  {
    name: "courses-empty",
    path: "/courses?track=learning&access=owned&tag=none",
  },
  { name: "search", path: "/search" },
  { name: "search-query", path: "/search?q=agent" },
  { name: "projects", path: "/projects" },
  { name: "learning", path: "/learning" },
  { name: "login", path: "/login" },
  { name: "content-policy", path: "/content-policy" },
  { name: "contribute", path: "/contribute" },
  { name: "not-found", path: "/no-such-page", expectedStatus: 404 },
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "mobile", width: 390, height: 844 },
];

/**
 * A listing taller than this has almost certainly lost its pagination. The
 * reader is exempt: a chapter's length is content-driven, and long upstream
 * documents legitimately run to tens of thousands of pixels.
 */
const HEIGHT_BUDGET = 12000;
const READER_HEIGHT_BUDGET = 120000;

function heightBudgetFor(route) {
  return route.path.startsWith("/read/") ? READER_HEIGHT_BUDGET : HEIGHT_BUDGET;
}

function usage() {
  process.stdout.write(`Usage: node scripts/ui-review.mjs [options]

  --base-url <url>     Instance to review (default: http://127.0.0.1:3000)
  --output-dir <dir>   Report and screenshot directory
                       (default: reports/ui-review)
  --item-id <id>       Extra course/reader routes to include
  --viewport <name>    Limit to one of: desktop, tablet, mobile
  --help               Show this message

Requires a running server and Playwright:
  npx playwright install chromium
`);
}

function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:3000",
    outputDir: "reports/ui-review",
    itemId: undefined,
    viewport: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      usage();
      process.exit(0);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    index += 1;
    if (flag === "--base-url") options.baseUrl = value;
    else if (flag === "--output-dir") options.outputDir = value;
    else if (flag === "--item-id") options.itemId = value;
    else if (flag === "--viewport") options.viewport = value;
    else throw new Error(`Unknown option: ${flag}`);
  }

  if (
    options.viewport &&
    !VIEWPORTS.some(({ name }) => name === options.viewport)
  ) {
    throw new Error(`Unknown viewport: ${options.viewport}`);
  }

  return options;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    throw new Error(
      "playwright is not installed. Run `npm i -D playwright && npx playwright install chromium`.",
    );
  }
}

function markdownReport(baseUrl, findings, pages) {
  const lines = [
    "# UI review",
    "",
    `- Instance: ${baseUrl}`,
    `- Generated: ${new Date().toISOString()}`,
    `- Captures: ${pages.length}`,
    `- Findings: ${findings.length}`,
    "",
  ];

  if (findings.length === 0) {
    lines.push("No layout or console findings.", "");
  } else {
    lines.push("## Findings", "");
    for (const finding of findings) {
      lines.push(
        `- **${finding.route}** (${finding.viewport}): ${finding.detail}`,
      );
    }
    lines.push("");
  }

  lines.push(
    "## Captures",
    "",
    "| Route | Viewport | Status | Height |",
    "| --- | --- | --- | --- |",
  );
  for (const page of pages) {
    lines.push(
      `| ${page.path} | ${page.viewport} | ${page.status} | ${page.height} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { chromium } = await loadPlaywright();
  const outputDir = resolve(options.outputDir);
  const shotDir = join(outputDir, "screenshots");
  await rm(shotDir, { recursive: true, force: true });
  await mkdir(shotDir, { recursive: true });

  const routes = [...ROUTES];
  if (options.itemId) {
    routes.push(
      { name: "course-detail", path: `/courses/${options.itemId}` },
      { name: "reader", path: `/read/${options.itemId}` },
    );
  }
  const viewports = options.viewport
    ? VIEWPORTS.filter(({ name }) => name === options.viewport)
    : VIEWPORTS;

  const browser = await chromium.launch();
  const findings = [];
  const pages = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 2,
        locale: "zh-CN",
      });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("pageerror", (error) => consoleErrors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });

      for (const route of routes) {
        consoleErrors.length = 0;
        const url = `${options.baseUrl}${route.path}`;
        let response;
        try {
          response = await page.goto(url, {
            waitUntil: "networkidle",
            timeout: 30000,
          });
        } catch (error) {
          findings.push({
            route: route.path,
            viewport: viewport.name,
            detail: `navigation failed: ${error.message}`,
          });
          continue;
        }

        // Freeze transitions so repeat runs produce comparable screenshots.
        await page.addStyleTag({
          content:
            "html{scroll-behavior:auto!important}*,*::before,*::after{transition:none!important;animation:none!important}",
        });
        await page.waitForTimeout(250);
        await page.screenshot({
          path: join(shotDir, `${route.name}--${viewport.name}.png`),
          fullPage: true,
        });

        const metrics = await page.evaluate(() => {
          const element = document.documentElement;
          const overflowing = [...document.querySelectorAll("body *")]
            .filter((node) => {
              const style = getComputedStyle(node);
              if (style.position === "fixed" || style.display === "none") {
                return false;
              }
              return node.getBoundingClientRect().right > window.innerWidth + 2;
            })
            .slice(0, 5)
            .map(
              (node) =>
                `${node.tagName.toLowerCase()}.${String(node.className).split(" ")[0]}`,
            );
          return {
            height: element.scrollHeight,
            horizontalOverflow: element.scrollWidth > element.clientWidth + 1,
            overflowing,
          };
        });

        const status = response?.status() ?? 0;
        pages.push({
          path: route.path,
          viewport: viewport.name,
          status,
          height: metrics.height,
        });

        // A route can declare the status it must return (the 404 page exists
        // to return 404); anything else still fails on HTTP >= 400.
        const statusIsWrong = route.expectedStatus
          ? status !== route.expectedStatus
          : status >= 400;
        if (statusIsWrong) {
          findings.push({
            route: route.path,
            viewport: viewport.name,
            detail: `HTTP ${status}`,
          });
        }
        if (metrics.horizontalOverflow) {
          findings.push({
            route: route.path,
            viewport: viewport.name,
            detail: `horizontal overflow from ${metrics.overflowing.join(", ") || "unknown element"}`,
          });
        }
        const budget = heightBudgetFor(route);
        if (metrics.height > budget) {
          findings.push({
            route: route.path,
            viewport: viewport.name,
            detail: `page is ${metrics.height}px tall; expected pagination under ${budget}px`,
          });
        }
        for (const error of consoleErrors) {
          // The browser logs the main document's own expected non-200 status
          // (e.g. the 404 page's "Failed to load resource … 404"); that line
          // is the route working as designed, not a regression.
          if (
            route.expectedStatus &&
            error.includes(`a status of ${route.expectedStatus}`)
          ) {
            continue;
          }
          findings.push({
            route: route.path,
            viewport: viewport.name,
            detail: `console error: ${error.slice(0, 160)}`,
          });
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    pages,
    findings,
  };
  await writeFile(
    join(outputDir, "ui-review.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    join(outputDir, "ui-review.md"),
    markdownReport(options.baseUrl, findings, pages),
  );

  process.stdout.write(
    `UI review: ${pages.length} captures, ${findings.length} findings -> ${outputDir}\n`,
  );
  for (const finding of findings) {
    process.stdout.write(
      `  ${finding.viewport} ${finding.route}: ${finding.detail}\n`,
    );
  }
  process.exitCode = findings.length > 0 ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
