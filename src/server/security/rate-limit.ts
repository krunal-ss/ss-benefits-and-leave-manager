// KAN-69 (BE security): a small in-memory token-bucket rate limiter for the auth
// endpoints (login / signup / reset). Keyed by IP+email so a single client can't
// brute-force credentials or spam password-reset emails.
//
// CAVEAT: state lives in this process's memory, so it is per-instance. On a
// multi-instance / serverless deploy each instance keeps its own buckets — for a
// hard global limit this must move to a shared store (Redis / Upstash / Postgres).
// The pure `TokenBucketLimiter` below is store-agnostic so swapping the backing
// map is the only change needed.

export type RateLimitResult = {
  /** true = request may proceed; false = limit exceeded. */
  allowed: boolean;
  /** Tokens left in the bucket after this check (0 when blocked). */
  remaining: number;
  /** Whole seconds until at least one token is available again. */
  retryAfterSec: number;
};

export type TokenBucketOptions = {
  /** Bucket size — the most requests allowed in a burst. */
  capacity: number;
  /** Tokens added per second (steady-state allowed rate). */
  refillPerSec: number;
};

type Bucket = { tokens: number; updatedAt: number };

/**
 * Pure, deterministic token-bucket limiter. `now` is injected so it's fully
 * unit-testable without timers. Not tied to any transport — pass a stable key.
 */
export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerSec: number;

  constructor(opts: TokenBucketOptions) {
    if (opts.capacity <= 0) throw new Error("capacity must be > 0");
    if (opts.refillPerSec <= 0) throw new Error("refillPerSec must be > 0");
    this.capacity = opts.capacity;
    this.refillPerSec = opts.refillPerSec;
  }

  /** Take one token for `key`. Refills lazily based on elapsed time. */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: now };

    const elapsedSec = Math.max(0, (now - bucket.updatedAt) / 1000);
    const tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);

    if (tokens >= 1) {
      const remaining = tokens - 1;
      this.buckets.set(key, { tokens: remaining, updatedAt: now });
      return { allowed: true, remaining: Math.floor(remaining), retryAfterSec: 0 };
    }

    // Not enough tokens: reject without consuming; report when one is due.
    this.buckets.set(key, { tokens, updatedAt: now });
    const retryAfterSec = Math.ceil((1 - tokens) / this.refillPerSec);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  /** Drop a key's bucket (e.g. reset counting after a successful login). */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Test/GC helper: forget buckets untouched for `olderThanMs`. */
  sweep(olderThanMs: number, now: number = Date.now()): void {
    for (const [key, b] of this.buckets) {
      if (now - b.updatedAt > olderThanMs) this.buckets.delete(key);
    }
  }
}

// Shared limiter for auth endpoints: allow a short burst then throttle. ~5 attempts
// up front, refilling 1 token every 12s (5/min steady state) — enough for a human
// mistyping a password, painful for a script.
const authLimiter = new TokenBucketLimiter({ capacity: 5, refillPerSec: 1 / 12 });

/** Rate-limit an auth attempt. `action` + `identifier` (IP and/or email) form the key. */
export function checkAuthRateLimit(action: string, identifier: string): RateLimitResult {
  return authLimiter.check(`${action}:${identifier.toLowerCase()}`);
}

/** Clear the limiter for a key after a legitimate success. */
export function clearAuthRateLimit(action: string, identifier: string): void {
  authLimiter.reset(`${action}:${identifier.toLowerCase()}`);
}
