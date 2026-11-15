import { randomUUID } from "node:crypto";
import type { DiscoveryDatabase } from "./database";

export type Job = {
  id: string;
  unique_key: string;
  kind: string;
  payload: string;
  state:
    "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled";
  priority: number;
  attempts: number;
  max_attempts: number;
  available_at: number;
  lease_token: string | null;
  lease_until: number | null;
  checkpoint: string;
  result: string | null;
  error_code: string | null;
};

export class LeaseLostError extends Error {
  constructor() {
    super("任务租约已失效。");
  }
}

export class DiscoveryJobs {
  constructor(
    private database: DiscoveryDatabase,
    private now = () => Date.now(),
  ) {}

  enqueue(input: {
    key: string;
    kind: string;
    payload: unknown;
    priority?: number;
    availableAt?: number;
    maxAttempts?: number;
  }): Job {
    const time = this.now();
    const maxAttempts = input.maxAttempts ?? 5;
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)
      throw new Error("重试次数无效。");
    this.database.handle
      .prepare(
        `INSERT INTO jobs
      (id,unique_key,kind,payload,state,priority,available_at,max_attempts,created_at,updated_at)
      VALUES (?,?,?,?,'queued',?,?,?,?,?) ON CONFLICT(unique_key) DO NOTHING`,
      )
      .run(
        randomUUID(),
        input.key,
        input.kind,
        JSON.stringify(input.payload),
        input.priority ?? 0,
        input.availableAt ?? time,
        maxAttempts,
        time,
        time,
      );
    return this.database.handle
      .prepare("SELECT * FROM jobs WHERE unique_key=?")
      .get(input.key) as Job;
  }

  claim(leaseMs = 60_000): Job | null {
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 1)
      throw new Error("租约时长无效。");
    return this.database.handle
      .transaction(() => {
        const time = this.now();
        this.database.handle
          .prepare(
            `UPDATE jobs SET state='failed', error_code='lease-exhausted',
        lease_token=NULL,lease_until=NULL,updated_at=? WHERE state='running' AND lease_until<=? AND attempts>=max_attempts`,
          )
          .run(time, time);
        const job = this.database.handle
          .prepare(
            `SELECT * FROM jobs WHERE
        ((state IN ('queued','waiting') AND available_at<=?) OR (state='running' AND lease_until<=?))
        AND attempts<max_attempts ORDER BY priority DESC,available_at,created_at LIMIT 1`,
          )
          .get(time, time) as Job | undefined;
        if (!job) return null;
        const token = randomUUID();
        this.database.handle
          .prepare(
            `UPDATE jobs SET state='running',attempts=attempts+1,
        lease_token=?,lease_until=?,heartbeat_at=?,updated_at=?,error_code=NULL WHERE id=?`,
          )
          .run(token, time + leaseMs, time, time, job.id);
        return this.get(job.id);
      })
      .immediate();
  }

  get(id: string): Job | null {
    return (
      (this.database.handle.prepare("SELECT * FROM jobs WHERE id=?").get(id) as
        Job | undefined) ?? null
    );
  }

  list(limit = 100): Job[] {
    return this.database.handle
      .prepare("SELECT * FROM jobs ORDER BY updated_at DESC LIMIT ?")
      .all(Math.min(500, Math.max(1, limit))) as Job[];
  }

  private updateLeased(
    job: Job,
    sql: string,
    values: (string | number | null)[],
  ) {
    const time = this.now();
    const result = this.database.handle
      .prepare(
        `UPDATE jobs SET ${sql},updated_at=?
      WHERE id=? AND state='running' AND lease_token=? AND lease_until>?`,
      )
      .run(...values, time, job.id, job.lease_token, time);
    if (result.changes !== 1) throw new LeaseLostError();
  }

  heartbeat(job: Job, leaseMs = 60_000) {
    this.updateLeased(job, "heartbeat_at=?,lease_until=?", [
      this.now(),
      this.now() + leaseMs,
    ]);
  }

  saveCheckpoint(job: Job, value: unknown) {
    this.updateLeased(job, "checkpoint=?", [JSON.stringify(value)]);
  }

  complete(job: Job, result: unknown = {}) {
    this.updateLeased(
      job,
      "state='completed',result=?,lease_token=NULL,lease_until=NULL",
      [JSON.stringify(result)],
    );
  }

  fail(job: Job, code: string) {
    const state = job.attempts >= job.max_attempts ? "failed" : "queued";
    this.updateLeased(
      job,
      "state=?,error_code=?,available_at=?,lease_token=NULL,lease_until=NULL",
      [
        state,
        code,
        this.now() + Math.min(3_600_000, 30_000 * 2 ** (job.attempts - 1)),
      ],
    );
  }

  defer(job: Job, availableAt: number, code: string) {
    this.updateLeased(
      job,
      "state='waiting',available_at=?,error_code=?,attempts=attempts-1,lease_token=NULL,lease_until=NULL",
      [availableAt, code],
    );
  }

  cancel(id: string) {
    this.database.handle
      .prepare(
        `UPDATE jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=?
      WHERE id=? AND state IN ('queued','waiting','running')`,
      )
      .run(this.now(), id);
  }

  retry(id: string) {
    this.database.handle
      .prepare(
        `UPDATE jobs SET state='queued',available_at=?,attempts=0,error_code=NULL,updated_at=?
      WHERE id=? AND state IN ('failed','cancelled')`,
      )
      .run(this.now(), this.now(), id);
  }

  workerHeartbeat(id: string, currentJob: string | null) {
    this.database.handle
      .prepare(
        `INSERT INTO worker_health VALUES (?,?,?) ON CONFLICT(id)
      DO UPDATE SET heartbeat_at=excluded.heartbeat_at,current_job=excluded.current_job`,
      )
      .run(id, this.now(), currentJob);
  }
}
