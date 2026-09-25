import type { PurgeTrashJob } from "@pc/schema";

import type { JobContext } from "./types";

/**
 * Deletes documents and folders that have been in the trash longer than the retention period,
 * with their files. Scheduled daily (EventBridge Scheduler -> SQS -> Lambda); safe to rerun.
 */
export function purgeTrash(payload: PurgeTrashJob, ctx: JobContext) {
  return ctx.services.files.trash.purgeExpired(
    payload.retentionDays === undefined ? {} : { retentionDays: payload.retentionDays },
  );
}
