import { describe, expect, it } from "vitest";
import { TokenBucketLimiter } from "./rate-limit";

describe("TokenBucketLimiter", () => {
  it("allows up to capacity in a burst, then blocks", () => {
    const rl = new TokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
    const t0 = 1_000_000;
    expect(rl.check("a", t0).allowed).toBe(true);
    expect(rl.check("a", t0).allowed).toBe(true);
    expect(rl.check("a", t0).allowed).toBe(true);
    const blocked = rl.check("a", t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("reports whole-second retryAfter when blocked", () => {
    const rl = new TokenBucketLimiter({ capacity: 1, refillPerSec: 1 / 12 });
    const t0 = 0;
    expect(rl.check("a", t0).allowed).toBe(true);
    const blocked = rl.check("a", t0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(12); // one token every 12s
  });

  it("refills over time and allows again", () => {
    const rl = new TokenBucketLimiter({ capacity: 1, refillPerSec: 1 / 12 });
    const t0 = 0;
    expect(rl.check("a", t0).allowed).toBe(true);
    expect(rl.check("a", t0).allowed).toBe(false);
    // 12s later exactly one token is back.
    expect(rl.check("a", t0 + 12_000).allowed).toBe(true);
    expect(rl.check("a", t0 + 12_000).allowed).toBe(false);
  });

  it("never exceeds capacity no matter how long it idles", () => {
    const rl = new TokenBucketLimiter({ capacity: 2, refillPerSec: 5 });
    const t0 = 0;
    // Idle for an hour, then only capacity (2) bursts are allowed.
    expect(rl.check("a", t0 + 3_600_000).allowed).toBe(true);
    expect(rl.check("a", t0 + 3_600_000).allowed).toBe(true);
    expect(rl.check("a", t0 + 3_600_000).allowed).toBe(false);
  });

  it("keys are independent", () => {
    const rl = new TokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
    const t0 = 0;
    expect(rl.check("a", t0).allowed).toBe(true);
    expect(rl.check("a", t0).allowed).toBe(false);
    // A different key has its own bucket.
    expect(rl.check("b", t0).allowed).toBe(true);
  });

  it("reset() clears a key's bucket", () => {
    const rl = new TokenBucketLimiter({ capacity: 1, refillPerSec: 1 / 60 });
    const t0 = 0;
    expect(rl.check("a", t0).allowed).toBe(true);
    expect(rl.check("a", t0).allowed).toBe(false);
    rl.reset("a");
    expect(rl.check("a", t0).allowed).toBe(true);
  });

  it("rejects invalid options", () => {
    expect(() => new TokenBucketLimiter({ capacity: 0, refillPerSec: 1 })).toThrow();
    expect(() => new TokenBucketLimiter({ capacity: 1, refillPerSec: 0 })).toThrow();
  });
});
