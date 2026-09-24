import { jobPayloadSchemas, type JobKind, type JobPayload } from "@pc/schema";

import type { JobContext, JobHandlers } from "./jobs";
import { log } from "./log";

/** The payload does not match its kind's schema. Retrying cannot help. */
export class InvalidJobError extends Error {
  constructor(readonly issues: unknown) {
    super("invalid job payload");
    this.name = "InvalidJobError";
  }
}

// K ties the schema lookup and the handler lookup to the same job kind.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
async function runJob<K extends JobKind>(
  kind: K,
  payload: unknown,
  ctx: JobContext,
  handlers: JobHandlers,
): Promise<unknown> {
  const parsed = jobPayloadSchemas[kind].safeParse(payload);
  if (!parsed.success) throw new InvalidJobError(parsed.error.issues);
  const handler: JobHandlers[K] = handlers[kind];
  // TypeScript cannot tie the schema lookup to the handler lookup through K; both use `kind`.
  return handler(parsed.data as JobPayload<K>, ctx);
}

/**
 * Runs one job, whichever way it arrived (HTTP locally, SQS when deployed), and records it on
 * its job record when it has one: running, then succeeded or failed.
 */
export async function executeJob(input: {
  kind: JobKind;
  payload: unknown;
  jobId: string | null;
  ctx: JobContext;
  handlers: JobHandlers;
}): Promise<unknown> {
  const { kind, jobId, ctx } = input;
  const startedAt = performance.now();
  const fields = {
    kind,
    job: jobId,
    task: ctx.task.taskName,
    attempt: ctx.task.retryCount + 1,
  };
  if (jobId) await ctx.services.jobs.start(jobId);
  let result: unknown;
  try {
    result = await runJob(kind, input.payload, ctx, input.handlers);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jobId) await ctx.services.jobs.fail(jobId, message);
    log("ERROR", "job failed", { ...fields, error: message });
    throw error;
  }
  if (jobId) await ctx.services.jobs.succeed(jobId, result);
  log("INFO", "job done", { ...fields, ms: Math.round(performance.now() - startedAt) });
  return result;
}
