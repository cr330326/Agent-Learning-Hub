import type { DiscoveryDatabase } from "./database";

// Integer millionths of CNY avoid rounding drift across reservations and receipts.
export type ModelReceipt = {
  call_key: string;
  budget_day: string;
  state: "reserved" | "dispatched" | "succeeded" | "released" | "unknown";
  reserved_micros: number;
  actual_micros: number | null;
  price_version: string;
  currency: string;
  exchange_rate: number;
  provider_request_id: string | null;
  result: string | null;
};

export function budgetDay(time: number): string {
  return new Date(time + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function nextBudgetDay(time: number): number {
  return Date.parse(`${budgetDay(time)}T00:00:00+08:00`) + 86_400_000;
}

function validateMoney(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("金额必须为非负整数微元。");
}

export class DiscoveryBudget {
  constructor(
    private database: DiscoveryDatabase,
    private now = () => Date.now(),
  ) {}

  limit(): number {
    const row = this.database.handle
      .prepare("SELECT value FROM settings WHERE key='daily_budget_micros'")
      .get() as { value: string };
    return Number(row.value);
  }

  setLimit(micros: number) {
    validateMoney(micros);
    this.database.handle
      .prepare("UPDATE settings SET value=? WHERE key='daily_budget_micros'")
      .run(String(micros));
  }

  receipt(key: string): ModelReceipt | null {
    return (
      (this.database.handle
        .prepare("SELECT * FROM model_receipts WHERE call_key=?")
        .get(key) as ModelReceipt | undefined) ?? null
    );
  }

  snapshot(day = budgetDay(this.now())) {
    const totals = this.database.handle
      .prepare(
        `SELECT
      COALESCE(SUM(CASE WHEN state='succeeded' THEN actual_micros ELSE 0 END),0) AS spent,
      COALESCE(SUM(CASE WHEN state IN ('reserved','dispatched','unknown') THEN reserved_micros ELSE 0 END),0) AS reserved
      FROM model_receipts WHERE budget_day=?`,
      )
      .get(day) as { spent: number; reserved: number };
    return {
      day,
      limit: this.limit(),
      ...totals,
      remaining: Math.max(0, this.limit() - totals.spent - totals.reserved),
    };
  }

  reserve(input: {
    key: string;
    maximumMicros: number;
    priceVersion: string;
    currency: string;
    exchangeRate: number;
  }): ModelReceipt | null {
    validateMoney(input.maximumMicros);
    if (
      !input.priceVersion ||
      !input.currency ||
      !Number.isFinite(input.exchangeRate) ||
      input.exchangeRate <= 0
    )
      throw new Error("计价配置无效。");
    return this.database.handle
      .transaction(() => {
        const existing = this.receipt(input.key);
        if (existing && existing.state !== "released") return existing;
        if (this.snapshot().remaining < input.maximumMicros) return null;
        const time = this.now();
        this.database.handle
          .prepare(
            `INSERT INTO model_receipts
        (call_key,budget_day,state,reserved_micros,price_version,currency,exchange_rate,created_at,updated_at)
        VALUES (?,?,'reserved',?,?,?,?,?,?) ON CONFLICT(call_key) DO UPDATE SET
        budget_day=excluded.budget_day,state='reserved',reserved_micros=excluded.reserved_micros,
        actual_micros=NULL,price_version=excluded.price_version,currency=excluded.currency,
        exchange_rate=excluded.exchange_rate,provider_request_id=NULL,result=NULL,updated_at=excluded.updated_at`,
          )
          .run(
            input.key,
            budgetDay(time),
            input.maximumMicros,
            input.priceVersion,
            input.currency,
            input.exchangeRate,
            time,
            time,
          );
        return this.receipt(input.key);
      })
      .immediate();
  }

  dispatch(key: string): boolean {
    return (
      this.database.handle
        .prepare(
          `UPDATE model_receipts SET state='dispatched',updated_at=?
      WHERE call_key=? AND state='reserved'`,
        )
        .run(this.now(), key).changes === 1
    );
  }

  settle(
    key: string,
    actualMicros: number,
    result: unknown,
    providerRequestId: string | null = null,
  ) {
    validateMoney(actualMicros);
    const changed = this.database.handle
      .prepare(
        `UPDATE model_receipts SET state='succeeded',actual_micros=?,
      result=?,provider_request_id=?,updated_at=? WHERE call_key=? AND state IN ('dispatched','unknown')`,
      )
      .run(
        actualMicros,
        JSON.stringify(result),
        providerRequestId,
        this.now(),
        key,
      ).changes;
    if (!changed && this.receipt(key)?.state !== "succeeded")
      throw new Error("调用回执状态无效。");
  }

  markUnknown(key: string) {
    this.database.handle
      .prepare(
        `UPDATE model_receipts SET state='unknown',updated_at=?
      WHERE call_key=? AND state='dispatched'`,
      )
      .run(this.now(), key);
  }

  releaseUnsent(key: string) {
    this.database.handle
      .prepare(
        `UPDATE model_receipts SET state='released',updated_at=?
      WHERE call_key=? AND state='reserved'`,
      )
      .run(this.now(), key);
  }
}
