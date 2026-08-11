#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

// Playwright is supplied by the local browser-test runtime rather than the
// production application dependency graph.
const loadExternal = createRequire(import.meta.url);
const { chromium } = loadExternal("playwright");

const NOTE_TEXT = "E2E private note 2026-08-11";
const OUTCOME_TEXT = "E2E reflection outcome 2026-08-11";

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredOption(name) {
  const value = readOption(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const baseUrl = requiredOption("--base-url").replace(/\/$/, "");
const mode = requiredOption("--mode");
const phase = readOption("--phase") ?? "full";
const artifactsDirectory = readOption("--artifacts-dir");
const chromePath =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!["cloud", "local"].includes(mode)) {
  throw new Error("--mode must be cloud or local.");
}
if (!existsSync(chromePath)) {
  throw new Error(`Chrome executable was not found: ${chromePath}`);
}
if (phase === "resume" && !artifactsDirectory) {
  throw new Error("--artifacts-dir is required for the resume phase.");
}
if (artifactsDirectory) mkdirSync(artifactsDirectory, { recursive: true });

async function navigate(page, path) {
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
}

async function expectNoHorizontalOverflow(page) {
  const measurements = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    measurements.scrollWidth <= measurements.clientWidth,
    `Expected no horizontal overflow, got ${measurements.scrollWidth}px > ${measurements.clientWidth}px.`,
  );
}

async function capture(page, label) {
  if (!artifactsDirectory) return;
  await page.screenshot({
    path: join(artifactsDirectory, `${mode}-${phase}-${label}.png`),
    fullPage: true,
  });
}

async function roadmapStageLinkCount(page) {
  const hrefs = await page
    .locator('main a[href^="/roadmap/"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  return new Set(hrefs).size;
}

async function runCloud(page) {
  await navigate(page, "/");
  await page.getByText("云端模式", { exact: true }).waitFor();

  await navigate(page, "/roadmap");
  assert.equal(await roadmapStageLinkCount(page), 9);

  await navigate(page, "/courses/legacy-course-001");
  await page
    .locator('a[href="https://github.com/datawhalechina/hello-agents"]')
    .waitFor();

  await navigate(page, "/search?q=agent");
  await page.getByText("云端公开索引", { exact: true }).waitFor();
  assert.ok((await page.locator(".search-result").count()) > 0);

  await navigate(page, "/learning");
  await page.getByText("先建立你的学习状态", { exact: true }).waitFor();
  const session = await page.evaluate(async () => {
    const response = await fetch("/api/session");
    return response.json();
  });
  assert.equal(session.authenticated, false);
  await capture(page, "public-flow");
}

async function runLocalSeed(page) {
  await navigate(page, "/");
  await page.getByText("本地模式", { exact: true }).waitFor();

  await navigate(page, "/roadmap");
  assert.equal(await roadmapStageLinkCount(page), 9);

  await navigate(page, "/search?q=agent");
  await page.getByText("本地白名单已纳入", { exact: true }).waitFor();
  assert.ok((await page.locator(".search-result").count()) > 0);

  await navigate(page, "/courses/legacy-course-001");
  await page.locator('a[href="/read/legacy-course-001"]').waitFor();

  await navigate(page, "/read/legacy-course-001");
  await page.locator(".reader-body").waitFor();
  await page.getByRole("button", { name: "☆ 收藏" }).click();
  await page.getByText("已加入收藏", { exact: true }).waitFor();

  await navigate(page, "/learning");
  await page.locator("#stage-0-task-1").click();
  await page.getByText("已保存", { exact: true }).waitFor();
  assert.equal(await page.locator("#stage-0-task-1").isChecked(), true);

  await page.locator("#note-body").fill(NOTE_TEXT);
  await page.getByRole("button", { name: "保存笔记" }).click();
  await page.getByText(NOTE_TEXT, { exact: true }).waitFor();

  await page.locator("#outcome-kind").selectOption("reflection");
  await page.locator("#outcome-summary").fill(OUTCOME_TEXT);
  await page.getByRole("button", { name: "添加成果" }).click();
  await page.getByText(OUTCOME_TEXT, { exact: true }).waitFor();
  await page.getByRole("button", { name: "确认阶段完成" }).click();
  await page
    .locator(".dashboard-outcome")
    .filter({ hasText: "已确认" })
    .waitFor();
  await capture(page, "seed");
}

async function runLocalResume(page) {
  await navigate(page, "/learning");
  await page.getByText(NOTE_TEXT, { exact: true }).waitFor();
  assert.equal(await page.locator("#stage-0-task-1").isChecked(), true);
  await page
    .locator(".dashboard-outcome")
    .filter({ hasText: "已确认" })
    .waitFor();

  const jsonDownload = page.waitForEvent("download");
  await page.getByText("导出 JSON", { exact: true }).click();
  const json = await jsonDownload;
  const jsonPath = join(artifactsDirectory, "agent-learning-state-e2e.json");
  await json.saveAs(jsonPath);
  const exportText = readFileSync(jsonPath, "utf8");
  assert.match(exportText, new RegExp(NOTE_TEXT));
  assert.doesNotMatch(exportText, /token_hash|access_token/i);

  const notesDownload = page.waitForEvent("download");
  await page.getByText("导出笔记 Markdown", { exact: true }).click();
  const notes = await notesDownload;
  const notesPath = join(artifactsDirectory, "agent-learning-notes-e2e.md");
  await notes.saveAs(notesPath);
  assert.match(readFileSync(notesPath, "utf8"), new RegExp(NOTE_TEXT));

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除账户" }).click();
  await page.getByText("账户和个人学习数据已删除。", { exact: true }).waitFor();
  await page.getByText("先建立你的学习状态", { exact: true }).waitFor();
  assert.equal(await page.getByText(NOTE_TEXT, { exact: true }).count(), 0);
  await capture(page, "resume-delete");
}

async function runLocalFallback(page) {
  await navigate(page, "/courses/legacy-course-001");
  await page
    .locator('a[href="https://github.com/datawhalechina/hello-agents"]')
    .waitFor();
  assert.equal(
    await page.locator('a[href="/read/legacy-course-001"]').count(),
    0,
  );
  await capture(page, "fallback");
}

async function runLocalMobile(page) {
  await navigate(page, "/roadmap");
  await page.locator(".roadmap-row").first().waitFor();
  await expectNoHorizontalOverflow(page);

  await navigate(page, "/search?q=agent");
  await page.locator(".search-result").first().waitFor();
  await expectNoHorizontalOverflow(page);

  await navigate(page, "/read/legacy-course-001");
  await page.locator(".reader-body").waitFor();
  await expectNoHorizontalOverflow(page);
  await capture(page, "mobile");
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath,
  });
  const mobile = phase === "mobile";
  const context = await browser.newContext(
    mobile
      ? {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 1,
          isMobile: true,
          hasTouch: true,
          acceptDownloads: true,
        }
      : { viewport: { width: 1440, height: 1024 }, acceptDownloads: true },
  );
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    if (mode === "cloud") {
      assert.equal(phase, "full", "Cloud mode supports only --phase full.");
      await runCloud(page);
    } else if (phase === "seed") {
      await runLocalSeed(page);
    } else if (phase === "resume") {
      await runLocalResume(page);
    } else if (phase === "fallback") {
      await runLocalFallback(page);
    } else if (phase === "mobile") {
      await runLocalMobile(page);
    } else {
      throw new Error(
        "Local mode requires --phase seed, resume, fallback, or mobile.",
      );
    }
    assert.deepEqual(consoleErrors, []);
    console.log(
      JSON.stringify({ mode, phase, status: "passed", consoleErrors: 0 }),
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
