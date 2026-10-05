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

/**
 * Deletes documents and folders that have been in the trash longer than the retention period,
 * with their files. Runs daily on a schedule (EventBridge Scheduler -> SQS).
 */
export const purgeTrashJobSchema = z.strictObject({
  /** Defaults to TRASH_RETENTION_DAYS. */
  retentionDays: z.int().min(1).max(365).optional(),
});
export type PurgeTrashJob = z.infer<typeof purgeTrashJobSchema>;

/**
 * Fetches a PDF or image from a web address into S3 as an asset of the workspace (the Import
 * tab's "from URL"). The worker refuses private and local addresses and anything over the limit.
 */
export const importFromUrlJobSchema = z.strictObject({
  workspaceId: z.uuid(),
  userId: z.string().min(1).max(64),
  url: z.url().max(2000),
});
export type ImportFromUrlJob = z.infer<typeof importFromUrlJobSchema>;

/** Every job kind and its payload schema. Add new kinds here. */
export const jobPayloadSchemas = {
  ping: pingJobSchema,
  verifyAsset: verifyAssetJobSchema,
  purgeTrash: purgeTrashJobSchema,
  importFromUrl: importFromUrlJobSchema,
} as const;

export type JobKind = keyof typeof jobPayloadSchemas;
export type JobPayload<K extends JobKind> = z.infer<(typeof jobPayloadSchemas)[K]>;

export const jobKindSchema = z.enum(Object.keys(jobPayloadSchemas) as [JobKind, ...JobKind[]]);

export function isJobKind(value: string): value is JobKind {
  return Object.hasOwn(jobPayloadSchemas, value);
}

/**
 * A job on a queue (SQS in deployed environments): the job record's id, its kind and payload.
 * The payload is checked against its kind's schema by the worker. Scheduled jobs have no job
 * record (`jobId: null`); their runs show up in the logs.
 */
export const jobMessageSchema = z.strictObject({
  jobId: z.uuid().nullable(),
  kind: jobKindSchema,
  payload: z.unknown(),
});
export type JobMessage = z.infer<typeof jobMessageSchema>;
