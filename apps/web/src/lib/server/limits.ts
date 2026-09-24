import "server-only";

import { env } from "@/env";
import {
  consume,
  MemoryStore,
  UpstashStore,
  type RateLimitResult,
  type RateLimitRule,
  type RateLimitStore,
} from "@/lib/rate-limit";
import { getUpstash } from "@/lib/server/clients";

let store: RateLimitStore | undefined;

/** The process-wide limiter store: Upstash (shared by every instance) or memory in tests/CI. */
function limiter(): RateLimitStore {
  store ??= env.RATE_LIMIT_STORE === "memory" ? new MemoryStore() : new UpstashStore(getUpstash());
  return store;
}

/** Counts one hit against `rule` for `subject` and says whether it is within the limit. */
export function hitLimit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  return consume(limiter(), rule, subject);
}
