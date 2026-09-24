import { describe, expect, it } from "vitest";

import {
  clientIp,
  consume,
  MemoryStore,
  rateLimits,
  UpstashStore,
  type RateLimitRule,
  type UpstashLike,
} from "./rate-limit";

const rule: RateLimitRule = { name: "test", limit: 3, windowSeconds: 60 };

describe("consume with MemoryStore", () => {
  it("allows up to the limit, then blocks with a retry time", async () => {
    const store = new MemoryStore();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consume(store, rule, "a@example.com"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3]?.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts subjects separately and case-insensitively", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 3; i++) await consume(store, rule, "A@Example.com");
    expect((await consume(store, rule, "a@example.com")).allowed).toBe(false);
    expect((await consume(store, rule, "b@example.com")).allowed).toBe(true);
  });

  it("counts rules separately", async () => {
    const store = new MemoryStore();
    const other = { ...rule, name: "other" };
    for (let i = 0; i < 3; i++) await consume(store, rule, "x");
    expect((await consume(store, other, "x")).allowed).toBe(true);
  });

  it("resets after the window", async () => {
    let now = 1_000_000;
    const store = new MemoryStore(() => now);
    for (let i = 0; i < 4; i++) await consume(store, rule, "x");
    expect((await consume(store, rule, "x")).allowed).toBe(false);
    now += 61_000;
    expect((await consume(store, rule, "x")).allowed).toBe(true);
  });

  it("has the step 3 limits", () => {
    expect(rateLimits.magicLinkPerEmail).toMatchObject({ limit: 5, windowSeconds: 900 });
    expect(rateLimits.magicLinkPerIp.limit).toBeGreaterThan(rateLimits.magicLinkPerEmail.limit);
  });
});

describe("UpstashStore", () => {
  function fakeRedis() {
    const counts = new Map<string, number>();
    const calls: string[] = [];
    const redis: UpstashLike = {
      pipeline() {
        const ops: (() => unknown)[] = [];
        return {
          incr(key) {
            ops.push(() => {
              const n = (counts.get(key) ?? 0) + 1;
              counts.set(key, n);
              return n;
            });
          },
          expire(key, seconds, option) {
            calls.push(`expire ${key.slice(0, 12)} ${seconds} ${option ?? ""}`);
            ops.push(() => 1);
          },
          ttl() {
            ops.push(() => 42);
          },
          exec: () => Promise.resolve(ops.map((op) => op())),
        };
      },
    };
    return { redis, calls };
  }

  it("increments, sets the expiry only if missing, and reports the TTL", async () => {
    const { redis, calls } = fakeRedis();
    const store = new UpstashStore(redis);
    expect(await store.hit("rl:k", 900)).toEqual({ count: 1, resetInSeconds: 42 });
    expect(await store.hit("rl:k", 900)).toEqual({ count: 2, resetInSeconds: 42 });
    expect(calls.every((c) => c.endsWith("900 NX"))).toBe(true);
  });

  it("keeps environments apart with a key prefix", async () => {
    const { redis, calls } = fakeRedis();
    await new UpstashStore(redis, "staging:").hit("rl:k", 900);
    expect(calls[0]).toMatch(/^expire staging:rl:k/);
  });

  it("never sends raw subjects as keys", async () => {
    const { redis, calls } = fakeRedis();
    await consume(new UpstashStore(redis), rule, "secret@example.com");
    expect(calls.join(" ")).not.toContain("secret@example.com");
  });
});

describe("clientIp", () => {
  it("uses the last X-Forwarded-For entry (appended by our proxy)", () => {
    const headers = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(clientIp(headers)).toBe("203.0.113.9");
  });

  it("falls back to X-Real-IP, then a local placeholder", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("local");
  });
});
