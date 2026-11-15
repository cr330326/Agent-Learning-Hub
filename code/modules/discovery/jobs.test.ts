import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { openDiscoveryDatabase, type DiscoveryDatabase } from "./database";
import { DiscoveryJobs, LeaseLostError } from "./jobs";
import { budgetDay, DiscoveryBudget, nextBudgetDay } from "./budget";

const stores: DiscoveryDatabase[] = [];
const directories: string[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function store(filename = ":memory:") {
  const database = openDiscoveryDatabase(filename);
  stores.push(database);
  return database;
}

describe("discovery durable queue", () => {
  it("deduplicates scheduling, fences expired workers, preserves checkpoints on reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "discovery-jobs-"));
    directories.push(directory);
    const filename = join(directory, "news.sqlite");
    const first = store(filename);
    const second = store(filename);
    let time = 1000;
    const queue = new DiscoveryJobs(first, () => time);
    const other = new DiscoveryJobs(second, () => time);
    const scheduled = queue.enqueue({
      key: "source:1",
      kind: "collect",
      payload: { source: "1" },
    });
    expect(
      other.enqueue({
        key: "source:1",
        kind: "collect",
        payload: { source: "1" },
      }).id,
    ).toBe(scheduled.id);
    const leased = queue.claim(100)!;
    expect(other.claim()).toBeNull();
    queue.saveCheckpoint(leased, { page: "two" });
    time += 101;
    expect(() => queue.complete(leased)).toThrow(LeaseLostError);
    const reclaimed = other.claim()!;
    expect(reclaimed.attempts).toBe(2);
    expect(JSON.parse(reclaimed.checkpoint)).toEqual({ page: "two" });
    expect(() => queue.saveCheckpoint(leased, { page: "lost" })).toThrow(
      LeaseLostError,
    );
    other.complete(reclaimed, { count: 10 });
    const reopened = new DiscoveryJobs(store(filename), () => time);
    expect(reopened.get(scheduled.id)?.state).toBe("completed");
    expect(reopened.claim()).toBeNull();
    expect(
      first.handle
        .prepare("SELECT name FROM sqlite_master WHERE name='users'")
        .get(),
    ).toBeUndefined();
  });

  it("backs off failures, permits explicit retry and cancels active leases", () => {
    let time = 1000;
    const queue = new DiscoveryJobs(store(), () => time);
    const job = queue.enqueue({
      key: "retry",
      kind: "collect",
      payload: {},
      maxAttempts: 2,
    });
    queue.fail(queue.claim()!, "upstream-timeout");
    expect(queue.claim()).toBeNull();
    time += 30_000;
    queue.fail(queue.claim()!, "upstream-timeout");
    expect(queue.get(job.id)?.state).toBe("failed");
    queue.retry(job.id);
    const active = queue.claim()!;
    queue.cancel(job.id);
    expect(() => queue.complete(active)).toThrow(LeaseLostError);
    expect(queue.get(job.id)?.state).toBe("cancelled");
  });

  it("defers work across the budget boundary without exhausting retry attempts", () => {
    let time = Date.parse("2026-11-15T15:59:00Z");
    const queue = new DiscoveryJobs(store(), () => time);
    const job = queue.enqueue({
      key: "budget",
      kind: "process",
      payload: {},
      maxAttempts: 1,
    });
    queue.defer(queue.claim()!, nextBudgetDay(time), "budget-exhausted");
    expect(queue.claim()).toBeNull();
    time += 60_000;
    expect(queue.claim()?.attempts).toBe(1);
    expect(queue.get(job.id)?.state).toBe("running");
  });
});

describe("atomic model budget", () => {
  it("includes in-flight reservations, reuses results and charges late completion to its original day", () => {
    const directory = mkdtempSync(join(tmpdir(), "discovery-budget-"));
    directories.push(directory);
    const filename = join(directory, "news.sqlite");
    let time = Date.parse("2026-11-15T15:59:00Z");
    const budget = new DiscoveryBudget(store(filename), () => time);
    const other = new DiscoveryBudget(store(filename), () => time);
    const price = {
      maximumMicros: 3_000_000,
      priceVersion: "test-v1",
      currency: "USD",
      exchangeRate: 7,
    };
    expect(budget.reserve({ key: "one", ...price })?.state).toBe("reserved");
    expect(other.reserve({ key: "two", ...price })).toBeNull();
    expect(budget.dispatch("one")).toBe(true);
    expect(other.dispatch("one")).toBe(false);
    budget.markUnknown("one");
    expect(other.reserve({ key: "one", ...price })?.state).toBe("unknown");
    expect(budget.snapshot().reserved).toBe(3_000_000);
    time += 60_000;
    expect(budgetDay(time)).toBe("2026-11-16");
    expect(other.reserve({ key: "two", ...price })?.state).toBe("reserved");
    budget.settle("one", 2_000_000, { summary: "已生成" }, "provider-1");
    other.settle("one", 1, { summary: "重复结果" });
    expect(budget.snapshot("2026-11-15")).toMatchObject({
      spent: 2_000_000,
      reserved: 0,
    });
    expect(JSON.parse(budget.receipt("one")!.result!)).toEqual({
      summary: "已生成",
    });
    expect(budget.snapshot().reserved).toBe(3_000_000);
    other.releaseUnsent("two");
    expect(budget.snapshot().remaining).toBe(5_000_000);
  });
});
