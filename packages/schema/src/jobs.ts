/**
 * Background job contracts shared by the enqueuer (apps/web) and apps/workers.
 * Workers receive jobs from a queue (SQS) when deployed, or over HTTP locally: POST /jobs/:kind.
 */
import { z } from "zod";

export const pingJobSchema = z.strictObject({
  message: z.string().min(1).max(200),
});
export type PingJob = z.infer<typeof pingJobSchema>;

/** Checks an uploaded file's real type (and hash, for multipart uploads) before it is usable. */
export const verifyAssetJobSchema = z.strictObject({
  assetId: z.uuid(),
});
export type VerifyAssetJob = z.infer<typeof verifyAssetJobSchema>;

/** Every job kind and its payload schema. Add new kinds here. */
export const jobPayloadSchemas = {
  ping: pingJobSchema,
  verifyAsset: verifyAssetJobSchema,
} as const;

export type JobKind = keyof typeof jobPayloadSchemas;
export type JobPayload<K extends JobKind> = z.infer<(typeof jobPayloadSchemas)[K]>;

export const jobKindSchema = z.enum(Object.keys(jobPayloadSchemas) as [JobKind, ...JobKind[]]);

export function isJobKind(value: string): value is JobKind {
  return Object.hasOwn(jobPayloadSchemas, value);
}

/**
 * A job on a queue (SQS in deployed environments): the job record's id, its kind and payload.
 * The payload is checked against its kind's schema by the worker.
 */
export const jobMessageSchema = z.strictObject({
  jobId: z.uuid(),
  kind: jobKindSchema,
  payload: z.unknown(),
});
export type JobMessage = z.infer<typeof jobMessageSchema>;
