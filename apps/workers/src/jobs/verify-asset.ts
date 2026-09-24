import type { VerifyAssetJob } from "@pc/schema";

import type { JobContext } from "./types";

/**
 * Checks an uploaded file's real type (and its hash, for multipart uploads) and marks it ready,
 * or deletes it, rejects it and refunds the quota. Safe to retry.
 */
export function verifyAsset(payload: VerifyAssetJob, ctx: JobContext) {
  return ctx.services.files.verification.verify(payload.assetId);
}
