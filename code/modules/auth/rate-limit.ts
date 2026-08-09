export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

type Bucket = {
  startedAt: number;
  count: number;
};

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new Error("Rate limit must be a positive integer.");
    }
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
      throw new Error("Rate-limit window must be positive.");
    }
    this.now = options.now ?? Date.now;
  }

  consume(key: string): RateLimitDecision {
    const timestamp = this.now();
    const current = this.buckets.get(key);
    const bucket =
      current && timestamp - current.startedAt < this.options.windowMs
        ? current
        : { startedAt: timestamp, count: 0 };
    bucket.count += 1;
    this.buckets.set(key, bucket);
    const allowed = bucket.count <= this.options.limit;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.startedAt + this.options.windowMs - timestamp) / 1000),
    );
    return {
      allowed,
      remaining: Math.max(0, this.options.limit - bucket.count),
      retryAfterSeconds,
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

export const stateWriteRateLimiter = new InMemoryRateLimiter({
  limit: 120,
  windowMs: 60_000,
});

export function getRequestRateLimitKey(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return (
    forwarded || request.headers.get("x-real-ip")?.trim() || "unknown-client"
  );
}

export const githubLoginRateLimiter = new InMemoryRateLimiter({
  limit: 10,
  windowMs: 15 * 60_000,
});
