import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

import { loadContentCatalogFromDirectory } from "../catalog/catalog-api";
import type { LearningItem } from "../catalog/content-schema";
import { createLocalContentResolver } from "./content-resolver";

const applicationRoot = fileURLToPath(new URL("../../", import.meta.url));

let items: LearningItem[];
let localRoot: string;

beforeAll(async () => {
  const catalog = await loadContentCatalogFromDirectory(
    join(applicationRoot, "content"),
  );
  items = catalog.items;
});

beforeEach(async () => {
  localRoot = await mkdtemp(join(tmpdir(), "agent-learning-local-adapter-"));
});

afterEach(async () => {
  await rm(localRoot, { recursive: true, force: true });
});

function itemWhere(predicate: (item: LearningItem) => boolean): LearningItem {
  const item = items.find(predicate);
  if (!item) throw new Error("Expected a matching catalog fixture.");
  return item;
}

async function addLocalFixture(item: LearningItem) {
  if (item.localPath === null)
    throw new Error("Fixture requires a local path.");
  const absolutePath = join(localRoot, item.localPath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `# ${item.title}\n`, "utf8");
}

describe("Local Content Resolver", () => {
  it("returns an in-site local document when the allowlisted file exists", async () => {
    const item = itemWhere(
      ({ accessPolicy, localPath }) =>
        accessPolicy === "local-preferred" && localPath !== null,
    );
    await addLocalFixture(item);

    const result = await createLocalContentResolver({ localRoot }).resolve(
      item,
    );

    expect(result).toMatchObject({
      kind: "local-document",
      href: `/read/${item.id}`,
      label: "在站内阅读（本地）",
    });
  });

  it("falls back to the upstream URL when a local file is missing", async () => {
    const item = itemWhere(
      ({ accessPolicy, localPath, sourceUrl }) =>
        accessPolicy === "local-preferred" &&
        localPath !== null &&
        sourceUrl !== null,
    );

    const result = await createLocalContentResolver({ localRoot }).resolve(
      item,
    );

    expect(result).toMatchObject({
      kind: "external-link",
      href: item.sourceUrl,
      label: "打开上游",
    });
  });

  it("returns a safe unavailable result when neither local nor upstream content exists", async () => {
    const item = itemWhere(
      ({ accessPolicy, localPath, sourceUrl }) =>
        accessPolicy === "local-preferred" &&
        localPath !== null &&
        sourceUrl === null,
    );

    const result = await createLocalContentResolver({ localRoot }).resolve(
      item,
    );

    expect(result.kind).toBe("unavailable");
    expect("reason" in result ? result.reason : "").toContain("本地素材");
  });

  it("keeps owned content internal and upstream-only content external", async () => {
    const resolver = createLocalContentResolver({ localRoot });
    const owned = itemWhere(({ accessPolicy }) => accessPolicy === "owned");
    const upstreamOnly = itemWhere(
      ({ accessPolicy }) => accessPolicy === "upstream-only",
    );

    await expect(resolver.resolve(owned)).resolves.toMatchObject({
      kind: "internal-mdx",
      href: `/read/${owned.id}`,
    });
    await expect(resolver.resolve(upstreamOnly)).resolves.toMatchObject({
      kind: "external-link",
      href: upstreamOnly.sourceUrl,
    });
  });

  it("does not turn an unsafe local path into a readable target", async () => {
    const item = itemWhere(
      ({ accessPolicy, localPath }) =>
        accessPolicy === "local-preferred" && localPath !== null,
    );
    const unsafeItem = {
      ...item,
      localPath: "../outside.md",
      sourceUrl: null,
    } as LearningItem;

    const result = await createLocalContentResolver({ localRoot }).resolve(
      unsafeItem,
    );

    expect(result.kind).toBe("unavailable");
    expect("reason" in result ? result.reason : "").toContain("安全");
  });
});
