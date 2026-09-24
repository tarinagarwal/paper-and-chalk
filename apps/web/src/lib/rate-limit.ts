import { createHash } from "node:crypto";

/**
 * Fixed-window rate limiting (SPEC.md section 27). The store is swappable: Upstash in the app,
 * in-memory for tests and CI.
 */

export interface HitResult {
  /** Hits in the current window, including this one. */
  count: number;
  /** Seconds until the window resets. */
  resetInSeconds: number;
}

export interface RateLimitStore {
  hit(key: string, windowSeconds: number): Promise<HitResult>;
}

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Limits from step 3. Windows are 15 minutes. */
export const rateLimits = {
  magicLinkPerEmail: { name: "magic-link:email", limit: 5, windowSeconds: 15 * 60 },
  magicLinkPerIp: { name: "magic-link:ip", limit: 20, windowSeconds: 15 * 60 },
  signInPerIp: { name: "sign-in:ip", limit: 30, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/** Keys never contain raw emails or IPs. */
function keyFor(rule: RateLimitRule, subject: string): string {
  const digest = createHash("sha256").update(subject.trim().toLowerCase()).digest("base64url");
  return `rl:${rule.name}:${digest}`;
}

export async function consume(
  store: RateLimitStore,
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const { count, resetInSeconds } = await store.hit(keyFor(rule, subject), rule.windowSeconds);
  const allowed = count <= rule.limit;
  return {
    allowed,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, resetInSeconds),
  };
}

/** Single-process store for tests and CI. */
export class MemoryStore implements RateLimitStore {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, windowSeconds: number): Promise<HitResult> {
    const now = this.now();
    let entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.windows.set(key, entry);
    }
    entry.count += 1;
    return Promise.resolve({
      count: entry.count,
      resetInSeconds: Math.ceil((entry.resetAt - now) / 1000),
    });
  }
}

/** The subset of the Upstash client this store uses. */
export interface UpstashLike {
  pipeline(): {
    incr(key: string): unknown;
    expire(key: string, seconds: number, option?: "NX"): unknown;
    ttl(key: string): unknown;
    exec(): Promise<unknown[]>;
  };
}

/** Shared across every instance: INCR, set the expiry only on the first hit, read the TTL. */
export class UpstashStore implements RateLimitStore {
  constructor(private readonly redis: UpstashLike) {}

  async hit(key: string, windowSeconds: number): Promise<HitResult> {
    const pipeline = this.redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, windowSeconds, "NX");
    pipeline.ttl(key);
    const [count, , ttl] = await pipeline.exec();
    return {
      count: Number(count),
      resetInSeconds: typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds,
    };
  }
}

/**
 * The client address as seen by the proxy nearest to us. Cloud Run and Google load balancers
 * append the real client IP to X-Forwarded-For, so the last entry is the trustworthy one;
 * earlier entries can be forged by the client.
 */
export function clientIp(headers: Headers): string {
  const last = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (last) return last;
  // `||`, not `??`: an empty header value should fall through too.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return headers.get("x-real-ip")?.trim() || "local";
}
