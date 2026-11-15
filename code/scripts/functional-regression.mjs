#!/usr/bin/env node
// Click-through functional regression for a running instance.
//
// Unlike ui-review.mjs (which looks at layout), this script *operates* the
// site: it follows every internal link, walks chapter navigation, pages
// through listings, applies filters, and exercises the learning-state
// write/read/delete cycle. It restores any state it creates.
//
// Requires a running server and Playwright:
//   npx playwright install chromium

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

function usage() {
  process.stdout.write(`Usage: node scripts/functional-regression.mjs [options]

  --base-url <url>     Instance under test (default: http://127.0.0.1:3001)
  --output-dir <dir>   Report directory (default: reports/functional-regression)
  --item-id <id>       Local-preferred course used for reader checks
                       (default: legacy-course-001)
  --skip-state         Do not exercise learning-state writes
  --admin-storage-state <file>  Disposable Cloud administrator browser session
  --feishu-source <file>        Disabled Feishu source JSON for field onboarding
  --edition-fixture <file>      Disposable editorial-freeze fixture JSON
  --help               Show this message
`);
}

function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:3001",
    outputDir: "reports/functional-regression",
    itemId: "legacy-course-001",
    skipState: false,
    adminStorageState: undefined,
    feishuSource: undefined,
    editionFixture: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      usage();
      process.exit(0);
    }
    if (flag === "--skip-state") {
      options.skipState = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    index += 1;
    if (flag === "--base-url") options.baseUrl = value;
    else if (flag === "--output-dir") options.outputDir = value;
    else if (flag === "--item-id") options.itemId = value;
    else if (flag === "--admin-storage-state")
      options.adminStorageState = value;
    else if (flag === "--feishu-source") options.feishuSource = value;
    else if (flag === "--edition-fixture") options.editionFixture = value;
    else throw new Error(`Unknown option: ${flag}`);
  }

  if (Boolean(options.adminStorageState) !== Boolean(options.feishuSource))
    throw new Error(
      "--admin-storage-state and --feishu-source must be provided together",
    );
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

/**
 * The bundled Chromium is a ~150MB download and is unobtainable on some
 * networks. `PLAYWRIGHT_CHANNEL=chrome` runs the installed system Chrome
 * instead; leaving it unset keeps the default bundled browser.
 */
function launchOptions() {
  const channel = process.env.PLAYWRIGHT_CHANNEL?.trim();
  return channel ? { channel } : {};
}

/** Collects named pass/fail results so one failure does not hide the rest. */
/**
 * Thrown inside a check when the instance cannot satisfy its precondition —
 * for instance a Local Mode reader with no material mounted. Recorded as a
 * skip, never as a pass, so a real regression on the same page still fails.
 */
class SkipCheck extends Error {}

function createRecorder() {
  const results = [];
  return {
    results,
    async run(name, body) {
      try {
        const detail = await body();
        results.push({ name, ok: true, detail: detail ?? "" });
      } catch (error) {
        if (error instanceof SkipCheck) {
          results.push({
            name,
            ok: true,
            skipped: true,
            detail: error.message,
          });
          return;
        }
        results.push({ name, ok: false, detail: error.message });
      }
    },
    check(name, condition, detail) {
      results.push({ name, ok: Boolean(condition), detail: detail ?? "" });
    },
    /** Records a skip rather than a failure when a mode does not own a feature. */
    async runIf(condition, name, body) {
      if (!condition) {
        results.push({
          name,
          ok: true,
          skipped: true,
          detail: "n/a in this mode",
        });
        return;
      }
      await this.run(name, body);
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Local Mode prefers the on-disk material for a `local-preferred` entry. When
 * the material library is not mounted, the reader falls back to the upstream
 * link and there is no body to assert against — an environment fact, not a
 * reader regression. A page that renders neither a body nor a fallback is
 * still a failure.
 */
async function skipLocalReaderWithoutBody(page) {
  if ((await page.$(".reader-body")) !== null) return;
  if ((await page.$(".reader-fallback")) === null) {
    throw new Error("reader rendered neither a body nor a fallback");
  }
  throw new SkipCheck("本地素材未挂载：该条目回退到上游，没有正文可断言");
}

/**
 * Polls until a predicate holds. Learning-state writes persist through the
 * API and only then re-render, so assertions have to wait for the round-trip
 * rather than read the DOM immediately after a click.
 */
async function waitFor(predicate, { timeout = 10000, interval = 100 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() > deadline) throw new Error("timed out waiting for state");
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

const PUBLIC_ROUTES = [
  "/",
  "/roadmap",
  "/roadmap/stage-0",
  "/roadmap/stage-4",
  "/roadmap/stage-8",
  "/courses",
  "/search?q=agent",
  "/projects",
  "/learning",
  "/login",
  "/content-policy",
  "/contribute",
];

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const { chromium } = await loadPlaywright();
  const base = options.baseUrl.replace(/\/$/, "");
  const recorder = createRecorder();

  const browser = await chromium.launch(launchOptions());
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  // Third-party READMEs embed remote badge images (shields.io, contrib.rocks,
  // trendshift), and the reader deliberately keeps them — sanitised but still
  // absolute. Waiting for "networkidle" therefore makes this suite depend on
  // whether the machine running it can reach those hosts: when one of them
  // hangs, every navigation fails on a 30s timeout and the report blames the
  // reader for a network condition. These checks assert DOM structure and
  // learning-state round-trips, none of which need images to finish, so wait
  // for the document instead. Anything genuinely async is awaited by the
  // individual checks through waitFor().
  const goto = (path) =>
    page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 });

  try {
    // Cloud and Local expose deliberately different capabilities, so the
    // suite reads the running mode and asserts the behaviour that mode owes
    // rather than skipping the difference.
    await goto("/");
    const mode = (await page.textContent(".mode-badge"))?.includes("本地")
      ? "local"
      : "cloud";
    recorder.check("runtime mode detected", true, mode);
    if (options.adminStorageState) {
      await recorder.run(
        "Feishu fields can be mapped before the first preview",
        async () => {
          assert(
            mode === "cloud",
            "administrator onboarding requires Cloud Mode",
          );
          const source = JSON.parse(
            await readFile(resolve(options.feishuSource), "utf8"),
          );
          assert(
            source.kind === "feishu" &&
              source.enabled === false &&
              source.publicationMode === "manual",
            "use a disabled, manually reviewed Feishu source on a disposable instance",
          );
          const admin = await browser.newContext({
            storageState: resolve(options.adminStorageState),
            locale: "zh-CN",
          });
          try {
            const editor = await admin.newPage();
            await editor.goto(base + "/admin/discovery", {
              waitUntil: "domcontentloaded",
            });
            await editor.locator(".admin-source-form").first().waitFor();
            await editor.getByText(/今日已用/).waitFor();
            const form = editor.locator("form.admin-source-form");
            await form
              .getByRole("combobox", { name: "类型", exact: true })
              .selectOption("feishu");
            await form.getByLabel("标识", { exact: true }).fill(source.id);
            await form.getByLabel("名称", { exact: true }).fill(source.name);
            await form.getByLabel("地址", { exact: true }).fill(source.url);
            await form
              .getByLabel("Base 标识", { exact: true })
              .fill(source.appToken);
            await form
              .getByLabel("子表标识", { exact: true })
              .fill(source.tableId);
            await form
              .getByLabel("应用标识环境变量名", { exact: true })
              .fill(source.appIdEnv ?? "FEISHU_APP_ID");
            await form
              .getByLabel("应用密钥环境变量名", { exact: true })
              .fill(source.appSecretEnv ?? "FEISHU_APP_SECRET");
            await form.getByLabel("字段映射", { exact: true }).fill("{}");
            const responsePromise = editor.waitForResponse(
              (response) =>
                response.url().endsWith("/api/admin/discovery") &&
                response.request().postDataJSON()?.action === "source-fields",
            );
            await form
              .getByRole("button", { name: "读取字段", exact: true })
              .click();
            assert(
              (await responsePromise).ok(),
              "field discovery failed before a mapping existed",
            );
            await form
              .getByRole("combobox", { name: "标题字段（必选）", exact: true })
              .selectOption(source.mapping.title);
            await form
              .getByRole("combobox", {
                name: "原文链接字段（必选）",
                exact: true,
              })
              .selectOption(source.mapping.url);
            const mapped = JSON.parse(
              await form.getByLabel("字段映射", { exact: true }).inputValue(),
            );
            assert(
              mapped.title === source.mapping.title &&
                mapped.url === source.mapping.url,
              "dropdown mapping did not persist stable field IDs",
            );
            const previewPromise = editor.waitForResponse(
              (response) =>
                response.url().endsWith("/api/admin/discovery") &&
                response.request().postDataJSON()?.action === "preview",
            );
            await form
              .getByRole("button", { name: "试抓与预览", exact: true })
              .click();
            const preview = await previewPromise;
            assert(
              preview.ok() && (await preview.json()).samples.length > 0,
              "mapped source preview has no records",
            );
            const savePromise = editor.waitForResponse(
              (response) =>
                response.url().endsWith("/api/admin/discovery") &&
                response.request().postDataJSON()?.action === "save-source",
            );
            await form
              .getByRole("button", { name: "保存信源", exact: true })
              .click();
            assert((await savePromise).ok(), "mapped source did not save");
            await mkdir(resolve(options.outputDir), { recursive: true });
            await editor.evaluate(() => window.scrollTo(0, 0));
            await editor.screenshot({
              path: join(
                resolve(options.outputDir),
                "feishu-mapping-desktop.png",
              ),
              fullPage: true,
            });
            await editor.setViewportSize({ width: 390, height: 844 });
            await editor.evaluate(() => window.scrollTo(0, 0));
            await editor.screenshot({
              path: join(
                resolve(options.outputDir),
                "feishu-mapping-mobile.png",
              ),
              fullPage: true,
            });
            await form
              .getByLabel("子表标识", { exact: true })
              .fill("tblDifferent");
            assert(
              (await form
                .getByRole("group", { name: "飞书字段映射", exact: true })
                .count()) === 0,
              "fields from a different table remain selectable",
            );
            return "read fields → map stable IDs → preview → save disabled source; stale fields hidden after table change";
          } finally {
            await admin.close();
          }
        },
      );
      await recorder.run(
        "discovery note clearing preserves reading completion",
        async () => {
          const personalContext = await browser.newContext({
            storageState: resolve(options.adminStorageState),
            viewport: { width: 390, height: 844 },
            locale: "zh-CN",
          });
          let original;
          let itemId;
          let csrfToken;
          try {
            const detail = await personalContext.newPage();
            await detail.goto(base + "/discover", {
              waitUntil: "domcontentloaded",
            });
            const href = await detail
              .locator(".discovery-card h2 a")
              .first()
              .getAttribute("href");
            assert(
              href,
              "a published item is required on the disposable instance",
            );
            itemId = href.split("/").at(-1);
            const session = await personalContext.request.get(
              base + "/api/session",
            );
            csrfToken = (await session.json()).csrfToken;
            const before = await personalContext.request.get(
              base + "/api/state/discovery",
            );
            original = (await before.json()).state.find(
              (value) => value.itemId === itemId,
            );
            await detail.goto(base + href, { waitUntil: "domcontentloaded" });
            const personal = detail.locator(".discovery-personal");
            await personal.locator("textarea").waitFor();
            const complete = personal.getByRole("button", {
              name: "确认已完成阅读",
              exact: true,
            });
            if (await complete.count()) await complete.click();
            await personal
              .getByText("已主动确认阅读完成", { exact: true })
              .waitFor();
            assert(
              (await personal
                .getByRole("button", { name: "开始阅读", exact: true })
                .count()) === 0,
              "completed reading still offers a contradictory start button",
            );
            const bookmark = personal.getByRole("button", {
              name: "收藏资讯",
              exact: true,
            });
            if (await bookmark.count()) await bookmark.click();
            await personal
              .getByRole("button", { name: "取消收藏", exact: true })
              .waitFor();
            await personal
              .locator("textarea")
              .fill("一次性验收：清空笔记与收藏不重置阅读完成状态。");
            await personal
              .getByRole("button", { name: "保存笔记", exact: true })
              .click();
            await personal
              .getByRole("status")
              .filter({ hasText: "已保存" })
              .waitFor();
            assert(
              (
                await personal
                  .getByRole("button", { name: "保存笔记", exact: true })
                  .getAttribute("class")
              )?.includes("button-primary"),
              "personal actions do not use the site's button system",
            );
            await detail.goto(base + "/learning", {
              waitUntil: "domcontentloaded",
            });
            const row = detail
              .locator(".discovery-personal li")
              .filter({ has: detail.locator(`a[href='${href}']`) });
            await row
              .getByRole("button", { name: "清空笔记与收藏", exact: true })
              .click();
            await waitFor(async () => {
              const response = await personalContext.request.get(
                base + "/api/state/discovery",
              );
              const saved = (await response.json()).state.find(
                (value) => value.itemId === itemId,
              );
              return saved && saved.note === "" && saved.bookmarked === false;
            });
            const after = await personalContext.request.get(
              base + "/api/state/discovery",
            );
            assert(
              (await after.json()).state.find(
                (value) => value.itemId === itemId,
              )?.status === "completed",
              "clearing notes and bookmarks reset reading progress",
            );
            await detail.goto(base + href, { waitUntil: "domcontentloaded" });
            await personal
              .getByText("已主动确认阅读完成", { exact: true })
              .waitFor();
            await detail.evaluate(() => window.scrollTo(0, 0));
            await detail.screenshot({
              path: join(resolve(options.outputDir), "personal-mobile.png"),
              fullPage: true,
            });
            await personal
              .getByRole("button", { name: "重新阅读", exact: true })
              .click();
            await personal.getByText("阅读中", { exact: true }).waitFor();
            return "completion survives clear and reload; explicit re-read resumes; actions styled for mobile";
          } finally {
            if (itemId && csrfToken)
              await personalContext.request.post(
                base + "/api/state/discovery",
                {
                  headers: { "x-csrf-token": csrfToken },
                  data: {
                    targetType: "news",
                    itemId,
                    status: original?.status ?? "not_started",
                    bookmarked: original?.bookmarked ?? false,
                    note: original?.note ?? "",
                  },
                },
              );
            await personalContext.close();
          }
        },
      );
    }
    await recorder.run("discovery follows runtime mode", async () => {
      const response =
        mode === "cloud"
          ? await goto("/discover")
          : await page.request.get(base + "/discover");
      if (mode === "cloud") {
        assert(
          !(await page.locator("main").innerText()).includes("模型待配置"),
          "public discovery exposes an administrator configuration message",
        );
        if (
          response.status() !== 200 ||
          !(await page.locator("h1").textContent()).includes("AI 开发")
        )
          throw new Error("云端发现入口不可用");
        await page.getByRole("button", { name: "筛选", exact: true }).click();
        await page.waitForLoadState("domcontentloaded");
        if ((await page.locator(".discovery-card").count()) > 24)
          throw new Error("资讯未按 24 条分页");
        assert(
          await page
            .locator(".discovery-card h2")
            .evaluateAll((headings) =>
              headings.every(
                (heading) =>
                  heading.getBoundingClientRect().height <=
                  parseFloat(getComputedStyle(heading).lineHeight) * 3 + 2,
              ),
            ),
          "长标题撑高了聚合卡片",
        );
        for (const link of await page
          .locator(".discovery-card > a[target='_blank']")
          .all()) {
          assert(
            /^https?:\/\//.test(await link.getAttribute("href")),
            "聚合卡片缺少有效原始链接",
          );
          assert(
            (await link.getAttribute("rel")).includes("noopener"),
            "原站链接缺少窗口隔离",
          );
        }
        const currentUrl = page.url();
        await page.waitForResponse(
          (response) =>
            response.url().includes("_rsc=") &&
            new URL(response.url()).pathname === "/discover",
          { timeout: 45_000 },
        );
        assert(page.url() === currentUrl, "自动刷新改变了当前筛选或分页");
      } else if (response.status() !== 404)
        throw new Error("本地模式资讯入口应受限");
      await goto("/");
    });

    await recorder.run(
      "daily editions follow mode and open frozen summary versions",
      async () => {
        if (mode === "local") {
          const response = await page.request.get(base + "/editions");
          assert(
            response.status() === 404,
            "Local Mode exposes Cloud daily editions",
          );
          return "Local Mode rejects daily editions";
        }
        await goto("/editions");
        const link = page.locator("main a[href^='/editions/']").first();
        if (!(await link.count()))
          throw new SkipCheck("尚无已出刊日报，版本跳转需在有日报的实例验证");
        await link.click();
        await page.waitForURL(/\/editions\/\d{4}-\d{2}-\d{2}/);
        const editionDay = new URL(page.url()).pathname.split("/").at(-1);
        const desktopViewport = page.viewportSize();
        await page.setViewportSize({ width: 375, height: 812 });
        try {
          assert(
            (await page.locator(".section-intro h1").textContent()) ===
              "精选日报",
            "daily edition heading should leave the date in its own label",
          );
          assert(
            await page
              .locator(".section-intro .eyebrow")
              .evaluate((element, day) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                return (
                  element.textContent === day &&
                  range.getClientRects().length === 1
                );
              }, editionDay),
            "daily edition date breaks across lines on a narrow screen",
          );
        } finally {
          await page.setViewportSize(desktopViewport);
        }
        const cards = page.locator(".discovery-card");
        const count = await cards.count();
        assert(
          (await page.locator("main").innerText()).includes(
            `本期收录 ${count} 条`,
          ),
          "daily edition count does not match its visible entries",
        );
        if (!count) {
          assert(
            (await page.locator("main").innerText()).includes("暂无符合条件"),
            "empty edition has no explanation",
          );
          return "empty edition explains that no candidates qualified";
        }
        const first = cards.first().locator("h2 a");
        const href = await first.getAttribute("href");
        assert(
          href?.includes("?version="),
          "daily card does not identify its frozen version",
        );
        await first.click();
        await page.waitForURL(/\/discover\/[^/]+\?version=/);
        assert(
          (await page.locator("main").innerText()).includes(
            "日报收录时的摘要版本",
          ),
          "daily reader does not identify the frozen summary",
        );
        assert(
          (await page.locator(".discovery-summary").innerText()).length > 0,
          "frozen summary is missing",
        );
        return `${count} qualified entries; first opens its frozen summary`;
      },
    );

    // ---- Every internal link resolves -------------------------------------
    if (options.editionFixture) {
      await recorder.run(
        "daily editorial snapshot survives later corrections",
        async () => {
          const fixture = JSON.parse(
            await readFile(resolve(options.editionFixture), "utf8"),
          );
          const path = `/editions/${encodeURIComponent(fixture.day)}`;
          if (mode === "local") {
            assert(
              (await page.request.get(base + path)).status() === 404,
              "Local Mode exposes an editorial daily snapshot",
            );
            return "Local Mode rejects the editorial snapshot";
          }
          await goto(path);
          const card = page.locator(".discovery-card").filter({
            has: page.getByRole("link", {
              name: fixture.frozen.title,
              exact: true,
            }),
          });
          assert(
            (await card.count()) === 1,
            "edition lost the title corrected before publication",
          );
          assert(
            (await card.locator(":scope > p").first().textContent()) ===
              fixture.frozen.summary,
            "edition lost the summary corrected before publication",
          );
          assert(
            (await card.locator(".discovery-reason").textContent()) ===
              fixture.frozen.reason,
            "edition did not freeze the editorial recommendation",
          );
          assert(
            JSON.stringify(
              await card.locator(".tag-list a").allTextContents(),
            ) === JSON.stringify(fixture.frozen.topics),
            "edition did not freeze the editorial topics",
          );
          await card
            .getByRole("link", { name: fixture.frozen.title, exact: true })
            .click();
          await page.waitForURL(/\?version=/);
          assert(
            new URL(page.url()).pathname ===
              `/discover/${encodeURIComponent(fixture.id)}` &&
              new URL(page.url()).searchParams.get("version") ===
                fixture.versionId,
            "snapshot link changed its source version",
          );
          assert(
            (await page.locator("h1").textContent()) === fixture.frozen.title &&
              (await page.locator(".discovery-summary").textContent()) ===
                fixture.frozen.summary,
            "frozen detail does not match its edition card",
          );
          await page
            .getByRole("link", { name: "查看当前版本", exact: true })
            .click();
          await page.waitForURL((url) => !url.searchParams.has("version"));
          assert(
            (await page.locator("h1").textContent()) ===
              fixture.current.title &&
              (await page.locator(".discovery-summary").textContent()) ===
                fixture.current.summary,
            "current detail does not show the subsequent correction",
          );
          return "prepublication corrections stay frozen; current detail shows subsequent corrections";
        },
      );
    }

    await recorder.run("internal links resolve", async () => {
      const checked = new Map();
      const broken = [];
      const seeds = [
        ...PUBLIC_ROUTES,
        `/courses/${options.itemId}`,
        `/read/${options.itemId}`,
      ];
      for (const seed of seeds) {
        await goto(seed);
        const hrefs = await page.$$eval("a[href]", (anchors) =>
          anchors.map((anchor) => ({
            url: anchor.href,
            text: anchor.textContent.trim().slice(0, 40),
          })),
        );
        for (const { url, text } of hrefs) {
          if (!url.startsWith(base) || checked.has(url)) continue;
          // API entry points are exercised by their own checks. Following them
          // blindly would start an OAuth redirect, and an unconfigured
          // provider correctly answers 503 rather than being "broken".
          if (new URL(url).pathname.startsWith("/api/")) continue;
          const response = await page.request
            .get(url)
            .catch(() => ({ status: () => 0 }));
          checked.set(url, response.status());
          if (response.status() >= 400) {
            broken.push(
              `${response.status()} ${decodeURIComponent(url.replace(base, ""))} (from ${seed} «${text}»)`,
            );
          }
        }
      }
      assert(
        broken.length === 0,
        `${broken.length} broken links: ${broken.slice(0, 8).join("; ")}`,
      );
      return `${checked.size} internal links, all < 400`;
    });

    // ---- Primary navigation ------------------------------------------------
    await recorder.run("header navigation reaches every section", async () => {
      await goto("/");
      const links = await page.$$eval(".primary-nav a", (anchors) =>
        anchors.map((anchor) => anchor.getAttribute("href")),
      );
      assert(links.length >= 6, `expected 6+ nav links, found ${links.length}`);
      for (const href of links) {
        const response = await goto(href);
        assert(
          response.status() < 400,
          `${href} returned ${response.status()}`,
        );
      }
      return `${links.length} sections reachable`;
    });

    // ---- Roadmap drill-down ------------------------------------------------
    await recorder.run("roadmap rows open their stage", async () => {
      await goto("/roadmap");
      const rows = await page.$$(".roadmap-row");
      assert(rows.length === 9, `expected 9 stages, found ${rows.length}`);
      await page.click(".roadmap-row h2 a");
      await page.waitForURL(/\/roadmap\/stage-/, { timeout: 10000 });
      const heading = await page.textContent("h1");
      assert(heading?.trim(), "stage page has no heading");
      return `9 rows; first opens ${heading.trim()}`;
    });

    await recorder.run("stage pages chain prev/next", async () => {
      await goto("/roadmap/stage-0");
      assert(
        (await page.$(".stage-neighbors a[href='/roadmap/stage-1']")) !== null,
        "stage-0 has no next link",
      );
      assert(
        (await page.$(".stage-neighbors a[href='/roadmap/stage--1']")) === null,
        "stage-0 must not link to a negative stage",
      );
      await goto("/roadmap/stage-8");
      const last = await page.$$eval(".stage-neighbors a", (anchors) =>
        anchors.map((anchor) => anchor.getAttribute("href")),
      );
      assert(last.includes("/roadmap/stage-7"), "stage-8 has no previous link");
      assert(
        !last.some((href) => href === "/roadmap/stage-9"),
        "stage-8 links to a nonexistent stage-9",
      );
      return "stage-0 and stage-8 boundaries correct";
    });

    // ---- Catalog: pagination and filters -----------------------------------
    await recorder.run("catalog pagination advances", async () => {
      await goto("/courses");
      const firstTitle = await page.textContent(".content-card h2 a");
      const pages = await page.$$(".pagination-page");
      assert(pages.length > 1, "no pagination controls rendered");
      await page.click(".pagination-step[rel='next']");
      await page.waitForURL(/page=2/, { timeout: 10000 });
      const secondTitle = await page.textContent(".content-card h2 a");
      assert(
        firstTitle !== secondTitle,
        "page 2 shows the same first card as page 1",
      );
      const heading = await page.textContent(".directory-heading p");
      assert(/25–|25-/.test(heading ?? ""), `unexpected range: ${heading}`);
      await page.click(".pagination-step[rel='prev']");
      await page.waitForTimeout(400);
      return "next/prev change the result window";
    });

    await recorder.run("catalog filters narrow results", async () => {
      await goto("/courses");
      const total = Number(
        (await page.textContent(".directory-heading strong")) ?? "0",
      );
      await page.selectOption(".filter-bar select[name='track']", "learning");
      await page.click(".filter-bar button[type='submit']");
      await page.waitForURL(/track=learning/, { timeout: 10000 });
      const filtered = Number(
        (await page.textContent(".directory-heading strong")) ?? "0",
      );
      assert(filtered > 0, "learning track returned no results");
      assert(
        filtered < total,
        `filter did not narrow results (${filtered} of ${total})`,
      );
      const policies = await page.$$eval(".track-tag", (tags) =>
        tags.map((tag) => tag.textContent.trim()),
      );
      assert(
        policies.every((label) => label.includes("Learning")),
        `filtered grid contains other tracks: ${[...new Set(policies)].join(",")}`,
      );
      return `${filtered} of ${total} after track=learning`;
    });

    // The combination has to be one the page actually honours: an unknown tag
    // is now dropped rather than applied, so probing with `tag=none` would
    // assert against a full grid instead of an empty one. "Pending" entries
    // exist on learning, aicoding and agentic, so `track=application` is the
    // combination that still yields nothing. Re-check this if the catalog
    // gains an Application entry awaiting attribution.
    await recorder.run("empty filter combination explains itself", async () => {
      await goto("/courses?track=application&access=unavailable");
      const empty = await page.$(".empty-state-wide");
      assert(empty !== null, "no empty state rendered");
      const text = (await empty.textContent()) ?? "";
      assert(text.trim().length > 10, "empty state has no guidance");
      return "empty state present with recovery guidance";
    });

    // An unrecognised filter value used to be echoed straight back into the
    // results heading and silently emptied the grid.
    await recorder.run("unknown filter values are ignored", async () => {
      await goto("/courses?tag=none");
      const total = Number(
        (await page.textContent(".directory-heading strong")) ?? "0",
      );
      assert(total > 0, "an unknown tag emptied the catalog");
      const heading = (await page.textContent(".directory-heading")) ?? "";
      assert(!heading.includes("none"), `raw tag echoed back: ${heading}`);
      const options = await page.$$eval(
        ".filter-bar select[name='tag'] option",
        (nodes) => nodes.map((node) => node.value),
      );
      assert(
        !options.includes("legacy-reading"),
        "internal bookkeeping tags are offered as filters",
      );
      return `${total} items kept; internal tags hidden`;
    });

    // A stage page links into the directory with its stage preselected. Both
    // halves used to be missing: the link carried no parameter and the filter
    // bar had no stage control, so "到课程目录找更多" dropped the visitor into
    // the unfiltered catalog.
    await recorder.run(
      "stage filter is reachable and preselected",
      async () => {
        await goto("/roadmap/stage-1");
        const moreLink = await page.$(".stage-reading .section-aside a");
        assert(moreLink !== null, "stage page has no catalog link");
        await moreLink.click();
        await page.waitForURL(/stage=stage-1/, { timeout: 10000 });
        const selected = await page.inputValue(
          ".filter-bar select[name='stage']",
        );
        assert(
          selected === "stage-1",
          `stage filter not preselected (got ${selected || "empty"})`,
        );
        const heading = (await page.textContent(".directory-heading")) ?? "";
        assert(
          heading.includes("阶段："),
          `heading does not name the stage: ${heading}`,
        );
        const total = Number(
          (await page.textContent(".directory-heading strong")) ?? "0",
        );
        assert(total > 0, "stage filter emptied the catalog");
        return `${total} items for stage-1, filter preselected`;
      },
    );

    // ---- Search ------------------------------------------------------------
    await recorder.run("search returns and filters results", async () => {
      await goto("/search");
      await page.fill(".search-bar input[name='q']", "agent");
      await page.click(".search-bar button[type='submit']");
      await page.waitForURL(/q=agent/, { timeout: 10000 });
      const count = await page.$$eval(".search-result", (rows) => rows.length);
      assert(count > 0, "no search results for 'agent'");
      const searchViewport = page.viewportSize();
      await page.setViewportSize({ width: 375, height: 812 });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        "搜索结果在窄屏横向溢出",
      );
      await page.setViewportSize(searchViewport);
      const kinds = await page.$$eval(".search-result-kind", (spans) =>
        spans.map((span) => span.textContent.trim()),
      );
      assert(
        kinds.every((kind) => !/^[a-z-]+$/.test(kind)),
        `raw enum kinds leaked: ${[...new Set(kinds)].join(",")}`,
      );
      return `${count} results, kind labels localised`;
    });

    // Local mode used to index a single-chapter entry twice — once as a course
    // entry and once as its own chapter — so every row appeared as a pair.
    await recorder.run("search results are not duplicated", async () => {
      await goto("/search?q=agent");
      // Two upstream projects may legitimately ship a file of the same name,
      // so identity is the destination, not the heading text.
      const targets = await page.$$eval(".search-result h2 a", (links) =>
        links.map(
          (link) => `${link.getAttribute("href")}::${link.textContent.trim()}`,
        ),
      );
      assert(targets.length > 0, "no search results for 'agent'");
      const duplicates = targets.filter(
        (target, index) => targets.indexOf(target) !== index,
      );
      assert(
        duplicates.length === 0,
        `duplicate results: ${[...new Set(duplicates)].slice(0, 3).join(",")}`,
      );
      const contexts = await page.$$eval(".search-result p", (rows) =>
        rows.map((row) => row.textContent.trim()),
      );
      assert(
        !contexts.every((context) => context === "未关联路线阶段"),
        "every result fell back to the same placeholder context",
      );
      return `${targets.length} distinct results with per-result context`;
    });

    // ---- Reader ------------------------------------------------------------
    if (mode === "cloud") {
      await recorder.run(
        "cloud reader withholds local material and offers upstream",
        async () => {
          const response = await goto(`/read/${options.itemId}`);
          assert(
            response.status() === 200,
            `reader returned ${response.status()}`,
          );
          assert(
            (await page.$(".reader-body")) === null,
            "cloud mode rendered a local-preferred document body",
          );
          const fallback = await page.$(".reader-fallback");
          assert(fallback !== null, "no safe fallback shown");
          const text = (await fallback.textContent()) ?? "";
          assert(
            text.includes("上游") || (await page.$("a[target='_blank']")),
            "fallback offers no upstream route",
          );
          return "body withheld, upstream link offered";
        },
      );
    }

    await recorder.run(
      "explicit chapters never fall back to another project",
      async () => {
        const chapter = "AICoding/claude/plugins/claude-mem/README.md";
        await goto(
          `/read/legacy-course-013?chapter=${encodeURIComponent(chapter)}`,
        );
        if (mode === "cloud" || !(await page.$(".reader-body"))) {
          const href = await page
            .locator(".reader-fallback a[target='_blank']")
            .getAttribute("href");
          assert(
            href?.startsWith("https://github.com/thedotmack/claude-mem/blob/"),
            `wrong chapter source: ${href}`,
          );
        }
        await goto(
          "/read/legacy-course-013?chapter=undeclared-private-file.md",
        );
        assert(
          !(await page.$(".reader-body")),
          "undeclared chapter rendered a body",
        );
        assert(
          (await page.locator(".reader-fallback").innerText()).includes(
            "不在课程清单",
          ),
          "undeclared chapter has no safe explanation",
        );
        assert(
          !(await page.locator("main").innerText()).includes(
            "undeclared-private-file",
          ),
          "raw chapter input echoed to reader",
        );
        return `${mode}: exact chapter source and undeclared-path rejection`;
      },
    );

    await recorder.runIf(
      mode === "local",
      "partial course opens its first readable declared chapter",
      async () => {
        await goto("/read/legacy-course-013");
        await skipLocalReaderWithoutBody(page);
        const current = page.locator(".reader-chapters a[aria-current='page']");
        assert(
          (await current.count()) === 1,
          "default chapter has no unique navigation selection",
        );
        assert(
          (await page.locator(".reader-body").innerText()).length > 200,
          "partial course body is empty",
        );
        if ((await current.innerText()).includes("claudian")) {
          const links = await page
            .locator(".reader-attribution a")
            .evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
          assert(
            !links.some((href) => href.includes("thedotmack/claude-mem")),
            "chapter attribution points to the missing main document's project",
          );
        }
        await mkdir(resolve(options.outputDir), { recursive: true });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: resolve(options.outputDir, "partial-course-desktop.png"),
          fullPage: true,
        });
        return await current.innerText();
      },
    );

    await recorder.run("reader opens the course document", async () => {
      if (mode === "cloud") {
        const response = await goto("/read/agent-loop-maintainer-guide");
        assert(
          response.status() === 200,
          `owned reader returned ${response.status()}`,
        );
      } else {
        const response = await goto(`/read/${options.itemId}`);
        assert(
          response.status() === 200,
          `reader returned ${response.status()}`,
        );
        await skipLocalReaderWithoutBody(page);
      }
      const body = await page.textContent(".reader-body");
      assert((body ?? "").length > 200, "reader body is empty");
      assert(
        !(body ?? "").includes("<div"),
        "raw HTML tags leaked into the rendered body as text",
      );
      return `${(body ?? "").length} characters rendered`;
    });

    await recorder.run(
      "OpenCode lessons keep course context and adjacent navigation",
      async () => {
        const intro = "Learning/learn-opencode/docs/1-start/01-intro.md";
        const install = "Learning/learn-opencode/docs/1-start/02-install.md";
        await goto("/read/legacy-reading-14-003");
        assert(
          new URL(page.url()).pathname === "/read/legacy-course-017",
          "legacy lesson did not redirect into its course",
        );
        assert(
          new URL(page.url()).searchParams.get("chapter") === intro,
          "legacy lesson redirected to the wrong chapter",
        );
        if (mode === "cloud") {
          assert(
            (await page.locator(".reader-body").count()) === 0,
            "Cloud exposed local lesson content",
          );
          const upstream = await page
            .locator("main a[target='_blank']")
            .first()
            .getAttribute("href");
          assert(
            upstream?.endsWith("/docs/1-start/01-intro.md"),
            "Cloud fallback lost the selected chapter's source",
          );
          return "Cloud keeps chapter-specific upstream access without local body";
        }
        await page.locator(".reader-body").waitFor();
        const outline = page.locator(".reader-course-outline");
        assert(
          (await outline.count()) === 1,
          "long course has no compact outline",
        );
        assert(
          (await outline.getAttribute("open")) === null,
          "long outline pushes the lesson below the fold by default",
        );
        const originalViewport = page.viewportSize();
        await page.setViewportSize({ width: 390, height: 844 });
        try {
          const outlinePosition = await outline.boundingBox();
          const tocPosition = await page.locator(".reader-toc").boundingBox();
          assert(
            outlinePosition && tocPosition && outlinePosition.y < tocPosition.y,
            "mobile course navigation is buried under the article outline",
          );
          const summary = outline.locator("summary");
          await summary.focus();
          await page.keyboard.press("Enter");
          assert(
            (await outline.getAttribute("open")) !== null,
            "course outline cannot be opened with the keyboard",
          );
          await page.keyboard.press("Enter");
          assert(
            (await outline.getAttribute("open")) === null,
            "course outline cannot be closed with the keyboard",
          );
        } finally {
          await page.setViewportSize(originalViewport);
        }
        const count = await page.locator(".reader-chapters a").count();
        assert(
          count > 12,
          "course outline is still limited to isolated legacy entries",
        );
        const next = page.locator(".reader-pager a[rel='next']");
        const target = new URL(await next.getAttribute("href"), base);
        assert(
          target.searchParams.get("chapter") === install,
          "intro's next lesson is not installation",
        );
        await next.click();
        await page.waitForURL(
          (url) => url.searchParams.get("chapter") === install,
        );
        await page
          .locator(".reader-body")
          .filter({ hasText: "安装" })
          .waitFor();
        await page.locator(".reader-pager a[rel='prev']").click();
        await page.waitForURL(
          (url) => url.searchParams.get("chapter") === intro,
        );
        await outline.locator("summary").click();
        await page
          .locator(".reader-chapters a[aria-current='page']")
          .waitFor({ state: "visible" });
        const chapterLinks = await page
          .locator(".reader-chapters a")
          .evaluateAll((anchors) => anchors.map((a) => a.getAttribute("href")));
        assert(
          chapterLinks.length === new Set(chapterLinks).size,
          "course outline has duplicate chapters",
        );
        await goto(chapterLinks[0]);
        assert(
          (await page.locator(".reader-pager a[rel='prev']").count()) === 0,
          "first chapter has an invalid previous link",
        );
        await goto(chapterLinks.at(-1));
        assert(
          (await page.locator(".reader-pager a[rel='next']").count()) === 0,
          "last chapter has an invalid next link",
        );
        assert(
          (await page.locator(".reader-pager a[rel='prev']").count()) === 1,
          "last chapter lost its previous link",
        );
        return `${count} declared readable chapters; old ID, next/previous and first/last boundaries verified`;
      },
    );

    await recorder.runIf(
      mode === "local",
      "reader chapter tabs switch content",
      async () => {
        await goto(`/read/${options.itemId}`);
        await skipLocalReaderWithoutBody(page);
        const tabs = await page.$$(".reader-chapters a");
        assert(tabs.length >= 2, `expected 2+ chapters, found ${tabs.length}`);
        const before = await page.textContent(".reader-body");
        await tabs[tabs.length - 1].click();
        await page.waitForURL(/chapter=/, { timeout: 10000 });
        await page.waitForTimeout(400);
        const after = await page.textContent(".reader-body");
        assert(before !== after, "chapter tab did not change the document");
        const current = await page.$$eval(
          ".reader-chapters a[aria-current='page']",
          (anchors) => anchors.map((anchor) => anchor.textContent.trim()),
        );
        assert(
          current.length === 1,
          `expected exactly one current chapter, found ${current.length}`,
        );
        return `switched to ${current[0]}`;
      },
    );

    await recorder.runIf(
      mode === "local",
      "reader has previous/next chapter links",
      async () => {
        await goto(`/read/${options.itemId}`);
        await skipLocalReaderWithoutBody(page);
        const next = await page.$(".reader-pager a[rel='next']");
        assert(next !== null, "no next-chapter link on the first chapter");
        const firstBody = await page.textContent(".reader-body");
        await next.click();
        await page.waitForURL(/chapter=/, { timeout: 10000 });
        await waitFor(
          async () => (await page.textContent(".reader-body")) !== firstBody,
        );
        const secondBody = await page.textContent(".reader-body");
        assert(
          firstBody !== secondBody,
          "next chapter did not load new content",
        );

        const previous = await page.$(".reader-pager a[rel='prev']");
        assert(
          previous !== null,
          "no previous-chapter link on a later chapter",
        );
        await previous.click();
        await waitFor(
          async () => (await page.textContent(".reader-body")) === firstBody,
        );
        const backBody = await page.textContent(".reader-body");
        assert(
          backBody === firstBody,
          "previous chapter did not return to the first document",
        );
        return "next then previous round-trips";
      },
    );

    await recorder.run("reader in-body links are not dead ends", async () => {
      await goto(`/read/${options.itemId}`);
      const relative = await page.$$eval(".reader-body a[href]", (anchors) =>
        anchors
          .map((anchor) => anchor.getAttribute("href"))
          .filter((href) => href && !/^(https?:|mailto:|#|\/)/.test(href)),
      );
      assert(
        relative.length === 0,
        `${relative.length} document-relative hrefs left unresolved: ${relative.slice(0, 3).join(", ")}`,
      );
      return "no unresolved document-relative links";
    });

    await recorder.run("reader table of contents anchors exist", async () => {
      await goto(`/read/${options.itemId}`);
      const missing = await page.$$eval(".reader-toc a", (anchors) =>
        anchors
          .map((anchor) => anchor.getAttribute("href")?.slice(1))
          .filter((id) => id && !document.getElementById(id)),
      );
      assert(
        missing.length === 0,
        `${missing.length} TOC entries point at missing anchors`,
      );
      return "every TOC entry resolves to a heading";
    });

    // ---- Course detail -----------------------------------------------------
    await recorder.run("course detail exposes references", async () => {
      await goto(`/courses/${options.itemId}`);
      const refs = await page.$$(".detail-references li");
      assert(refs.length > 0, "no references rendered");
      const raw = await page.textContent(".detail-meta");
      assert(
        !/(Unknown|third-party|local-preferred)/.test(raw ?? ""),
        "raw schema or placeholder values leaked into metadata",
      );
      return `${refs.length} references, metadata localised`;
    });

    // ---- Anonymous cloud visitors must be shut out of private state --------
    if (mode === "cloud") {
      await recorder.run("anonymous cloud state is gated", async () => {
        await goto("/learning");
        await page.waitForTimeout(800);
        assert(
          (await page.$(".dashboard-empty")) !== null,
          "dashboard rendered for an anonymous visitor",
        );
        assert(
          (await page.$(".dashboard-form textarea")) === null,
          "note form exposed to an anonymous visitor",
        );
        const data = await page.request.get(`${base}/api/data`);
        assert(
          data.status() === 401 || data.status() === 403,
          `/api/data returned ${data.status()} to an anonymous visitor`,
        );
        const write = await page.request.post(`${base}/api/state`, {
          data: {
            action: "task-progress",
            taskId: "stage-0-task-1",
            completed: true,
          },
          headers: { "content-type": "application/json" },
          failOnStatusCode: false,
        });
        assert(
          write.status() >= 400,
          `anonymous state write was accepted with ${write.status()}`,
        );
        return "dashboard, export and writes all refused";
      });

      // The stage page gained tick-in-place; anonymous readers must still get
      // a readable list rather than controls that cannot save.
      await recorder.run("anonymous stage page stays read-only", async () => {
        await goto("/roadmap/stage-0");
        await page.waitForTimeout(600);
        const boxes = await page.locator(".task-check input").count();
        assert(
          boxes === 0,
          `${boxes} tickable tasks offered to an anonymous reader`,
        );
        const badges = await page.locator(".stage-progress").count();
        assert(badges === 0, "progress badge rendered without a session");
        const tasks = await page.locator(".task-list li").count();
        assert(tasks > 0, "practice tasks disappeared along with the controls");
        const note = (await page.textContent(".task-list-note")) ?? "";
        assert(
          note.trim().length > 0,
          "no explanation of why ticking is unavailable",
        );
        return `${tasks} tasks readable, 0 controls`;
      });

      await recorder.run(
        "login page offers the cloud identity route",
        async () => {
          await goto("/login");
          const button = await page.$(
            "a[href*='/api/auth/github'], a[href*='github']",
          );
          assert(button !== null, "no GitHub sign-in affordance");
          return "GitHub sign-in offered";
        },
      );
    }

    // ---- Learning state write / read / delete ------------------------------
    if (!options.skipState && mode === "local") {
      await recorder.run("bookmark persists and can be undone", async () => {
        await goto(`/courses/${options.itemId}`);
        const button = page.locator(".state-bookmark");
        const initial = (await button.textContent()) ?? "";
        await button.click();
        await waitFor(async () => (await button.textContent()) !== initial);

        await goto("/learning");
        await waitFor(async () =>
          /收藏\s*1/.test((await page.textContent(".dashboard-stats")) ?? ""),
        );

        await goto(`/courses/${options.itemId}`);
        const restored = page.locator(".state-bookmark");
        const marked = (await restored.textContent()) ?? "";
        await restored.click();
        await waitFor(async () => (await restored.textContent()) !== marked);
        return "bookmark round-trips to the dashboard";
      });

      await recorder.run("stage task checkbox persists", async () => {
        await goto("/learning");
        await page.waitForTimeout(900);
        const box = page.locator(".dashboard-task input").first();
        const label = await page
          .locator(".dashboard-task strong")
          .first()
          .textContent();
        assert(
          label && !/^stage-\d+-task-\d+$/.test(label.trim()),
          `task shows a raw id instead of a title: ${label}`,
        );
        // The checkbox is controlled by server state, so it flips only after
        // the write round-trips. Click, then poll rather than using check(),
        // which asserts on the value synchronously.
        if (await box.isChecked()) {
          await box.click();
          await waitFor(() => box.isChecked().then((value) => !value));
        }
        await box.click();
        await waitFor(() => box.isChecked());

        await page.reload({ waitUntil: "domcontentloaded" });
        await waitFor(() =>
          page.locator(".dashboard-task input").first().isChecked(),
        );

        const restored = page.locator(".dashboard-task input").first();
        await restored.click();
        await waitFor(() => restored.isChecked().then((value) => !value));
        return `"${label.trim()}" persisted across a reload`;
      });

      // PAGE-002 asks the roadmap to show completion, and the stage page is
      // where the work actually happens — ticking used to be dashboard-only.
      await recorder.run(
        "stage page ticks tasks and roadmap shows it",
        async () => {
          await goto("/roadmap/stage-0");
          const box = page.locator(".task-check input").first();
          await waitFor(() => box.count().then((count) => count > 0));
          if (await box.isChecked()) {
            await box.click();
            await waitFor(() => box.isChecked().then((value) => !value));
          }

          await goto("/roadmap");
          const before =
            (await page
              .locator(".roadmap-row")
              .first()
              .locator(".stage-progress small")
              .textContent()) ?? "";
          assert(
            before.includes("0/"),
            `roadmap did not start from zero progress: ${before}`,
          );

          await goto("/roadmap/stage-0");
          const target = page.locator(".task-check input").first();
          await target.click();
          await waitFor(() => target.isChecked());
          await page.reload({ waitUntil: "domcontentloaded" });
          await waitFor(() =>
            page.locator(".task-check input").first().isChecked(),
          );

          await goto("/roadmap");
          const after =
            (await page
              .locator(".roadmap-row")
              .first()
              .locator(".stage-progress small")
              .textContent()) ?? "";
          assert(
            after.includes("1/"),
            `roadmap did not reflect the tick: ${after}`,
          );

          // Restore: this check owns the state it created.
          await goto("/roadmap/stage-0");
          const restore = page.locator(".task-check input").first();
          await waitFor(() => restore.isChecked());
          await restore.click();
          await waitFor(() => restore.isChecked().then((value) => !value));
          return `stage tick round-trips; roadmap went "${before.trim()}" → "${after.trim()}"`;
        },
      );

      await recorder.run("private note saves and deletes", async () => {
        await goto("/learning");
        await page.waitForTimeout(900);
        const marker = `regression-${Date.now()}`;
        await page.fill(".dashboard-form textarea", marker);
        await page.click(".dashboard-form button[type='submit']");
        // The list only renders once at least one note exists.
        await page
          .waitForSelector(".dashboard-note-list", { timeout: 10000 })
          .catch(() => {
            throw new Error("note list never appeared after saving");
          });
        await waitFor(async () =>
          ((await page.textContent(".dashboard-note-list")) ?? "").includes(
            marker,
          ),
        );

        page.once("dialog", (dialog) => dialog.accept());
        const deleteButton = page
          .locator(".dashboard-note-list li")
          .filter({ hasText: marker })
          .locator("button")
          .last();
        await deleteButton.click();
        await waitFor(async () => {
          const list = await page
            .textContent(".dashboard-note-list")
            .catch(() => "");
          return !(list ?? "").includes(marker);
        });
        return "note created then removed";
      });

      await recorder.run("personal data export responds", async () => {
        const response = await page.request.get(`${base}/api/data`);
        assert(response.ok(), `export returned ${response.status()}`);
        const payload = await response.json();
        assert(
          typeof payload === "object" && payload !== null,
          "export payload is not an object",
        );
        const notes = await page.request.get(`${base}/api/data?format=notes`);
        assert(notes.ok(), `notes export returned ${notes.status()}`);
        return "JSON and Markdown exports both respond";
      });
    }

    // ---- Console hygiene ---------------------------------------------------
    recorder.check(
      "no console errors during the run",
      consoleErrors.length === 0,
      consoleErrors.slice(0, 5).join(" | "),
    );
  } finally {
    await browser.close();
  }

  const failures = recorder.results.filter((result) => !result.ok);
  const skipped = recorder.results.filter((result) => result.skipped);
  const verdict = (result) =>
    result.skipped ? "SKIP" : result.ok ? "PASS" : "FAIL";
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    total: recorder.results.length,
    failed: failures.length,
    skipped: skipped.length,
    results: recorder.results,
  };
  await writeFile(
    join(outputDir, "functional-regression.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    join(outputDir, "functional-regression.md"),
    [
      "# Functional regression",
      "",
      `- Instance: ${base}`,
      `- Generated: ${report.generatedAt}`,
      `- Checks: ${report.total}, failed: ${report.failed}, skipped: ${report.skipped}`,
      "",
      "| Result | Check | Detail |",
      "| --- | --- | --- |",
      ...recorder.results.map(
        (result) =>
          `| ${verdict(result)} | ${result.name} | ${String(result.detail).replace(/\|/g, "/")} |`,
      ),
      "",
    ].join("\n"),
  );

  for (const result of recorder.results) {
    process.stdout.write(
      `${verdict(result)}  ${result.name}${result.detail ? ` — ${result.detail}` : ""}\n`,
    );
  }
  process.stdout.write(
    `\n${report.total - report.failed - report.skipped}/${report.total} checks passed, ${report.skipped} skipped -> ${outputDir}\n`,
  );
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
