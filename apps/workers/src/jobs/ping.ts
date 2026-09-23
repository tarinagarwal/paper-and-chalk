import type { PingJob } from "@pc/schema";

import type { JobContext } from "./types";

/** Proves the enqueue → worker → response loop works. */
export function ping(payload: PingJob, ctx: JobContext) {
  return Promise.resolve({
    pong: payload.message,
    attempt: ctx.task.retryCount + 1,
    receivedAt: new Date().toISOString(),
  });
}
