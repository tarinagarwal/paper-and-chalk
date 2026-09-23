/**
 * Background job contracts shared by the enqueuer (apps/web) and apps/workers.
 * Workers receive jobs as Cloud Tasks HTTP targets: POST /jobs/:kind with a JSON body.
 */
import { z } from "zod";

export const pingJobSchema = z.strictObject({
  message: z.string().min(1).max(200),
});
export type PingJob = z.infer<typeof pingJobSchema>;

/** Every job kind and its payload schema. Add new kinds here. */
export const jobPayloadSchemas = {
  ping: pingJobSchema,
} as const;

export type JobKind = keyof typeof jobPayloadSchemas;
export type JobPayload<K extends JobKind> = z.infer<(typeof jobPayloadSchemas)[K]>;

export const jobKindSchema = z.enum(Object.keys(jobPayloadSchemas) as [JobKind, ...JobKind[]]);

export function isJobKind(value: string): value is JobKind {
  return Object.hasOwn(jobPayloadSchemas, value);
}
