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

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

function usage() {
  process.stdout.write(`Usage: node scripts/functional-regression.mjs [options]

  --base-url <url>     Instance under test (default: http://127.0.0.1:3001)
  --output-dir <dir>   Report directory (default: reports/functional-regression)
  --item-id <id>       Local-preferred course used for reader checks
                       (default: legacy-course-001)
  --skip-state         Do not exercise learning-state writes
  --help               Show this message
`);
}

function parseArguments(argv) {
  const options = {
    baseUrl: "http://127.0.0.1:3001",
    outputDir: "reports/functional-regression",
    itemId: "legacy-course-001",
    skipState: false,
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
    else throw new Error(`Unknown option: ${flag}`);
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

/** Collects named pass/fail results so one failure does not hide the rest. */
function createRecorder() {
  const results = [];
  return {
    results,
    async run(name, body) {
      try {
        const detail = await body();
        results.push({ name, ok: true, detail: detail ?? "" });
      } catch (error) {
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

  const browser = await chromium.launch();
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

    // ---- Every internal link resolves -------------------------------------
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
    // only exist on the learning track, so pairing it with another track is a
    // real, empty combination.
    await recorder.run("empty filter combination explains itself", async () => {
      await goto("/courses?track=aicoding&access=unavailable");
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

    // ---- Search ------------------------------------------------------------
    await recorder.run("search returns and filters results", async () => {
      await goto("/search");
      await page.fill(".search-bar input[name='q']", "agent");
      await page.click(".search-bar button[type='submit']");
      await page.waitForURL(/q=agent/, { timeout: 10000 });
      const count = await page.$$eval(".search-result", (rows) => rows.length);
      assert(count > 0, "no search results for 'agent'");
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
      }
      const body = await page.textContent(".reader-body");
      assert((body ?? "").length > 200, "reader body is empty");
      assert(
        !(body ?? "").includes("<div"),
        "raw HTML tags leaked into the rendered body as text",
      );
      return `${(body ?? "").length} characters rendered`;
    });

    await recorder.runIf(
      mode === "local",
      "reader chapter tabs switch content",
      async () => {
        await goto(`/read/${options.itemId}`);
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
        const next = await page.$(".reader-pager a[rel='next']");
        assert(next !== null, "no next-chapter link on the first chapter");
        const firstBody = await page.textContent(".reader-body");
        await next.click();
        await page.waitForURL(/chapter=/, { timeout: 10000 });
        await page.waitForTimeout(400);
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
        await page.waitForTimeout(600);
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
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    total: recorder.results.length,
    failed: failures.length,
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
      `- Checks: ${report.total}, failed: ${report.failed}`,
      "",
      "| Result | Check | Detail |",
      "| --- | --- | --- |",
      ...recorder.results.map(
        (result) =>
          `| ${result.ok ? "PASS" : "FAIL"} | ${result.name} | ${String(result.detail).replace(/\|/g, "/")} |`,
      ),
      "",
    ].join("\n"),
  );

  for (const result of recorder.results) {
    process.stdout.write(
      `${result.ok ? "PASS" : "FAIL"}  ${result.name}${result.detail ? ` — ${result.detail}` : ""}\n`,
    );
  }
  process.stdout.write(
    `\n${report.total - report.failed}/${report.total} checks passed -> ${outputDir}\n`,
  );
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
});
