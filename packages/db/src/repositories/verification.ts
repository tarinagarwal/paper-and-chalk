/**
 * Asset verification, run by the `verifyAsset` worker job. System code: no actor, no `can()`.
 * A file becomes `ready` when its first bytes match the declared type and (for multipart
 * uploads, which S3 cannot hash) its SHA-256 matches the one the browser claimed. Otherwise the
 * object is deleted, the asset is `rejected` with a reason and the quota is refunded.
 */
import { matchesDeclaredType, SNIFF_BYTES, type Storage } from "@pc/storage";

import { withTransaction } from "../transaction";
import type { RepoContext } from "./context";
import { refundStorage } from "./quota";

export type VerificationResult =
  | { status: "ready" }
  | { status: "rejected"; reason: "missing" | "type_mismatch" | "hash_mismatch" }
  | { status: "skipped"; reason: "not_found" | "already_checked" };

export function verificationRepository(r: RepoContext, storage: Storage) {
  const { c } = r;

  return {
    async verify(assetId: string): Promise<VerificationResult> {
      const asset = await c.assets.findOne({ _id: assetId });
      if (!asset) return { status: "skipped", reason: "not_found" };
      if (asset.status !== "verifying") return { status: "skipped", reason: "already_checked" };

      const reject = async (reason: "missing" | "type_mismatch" | "hash_mismatch") => {
        await storage.remove(asset.bucket, asset.key);
        await withTransaction(r.conn.client, async (session) => {
          // Conditional on status so a retried job never refunds twice.
          const result = await c.assets.updateOne(
            { _id: asset._id, status: "verifying" },
            { $set: { status: "rejected", rejectedReason: reason, updatedAt: r.now() } },
            { session },
          );
          if (result.modifiedCount === 1) {
            await refundStorage(c, asset.chargedTo, asset.bytes, session);
          }
        });
        return { status: "rejected", reason } as const;
      };

      if (!(await storage.head(asset.bucket, asset.key))) return reject("missing");
      const firstBytes = await storage.readStart(asset.bucket, asset.key, SNIFF_BYTES);
      if (!matchesDeclaredType(asset.mime, firstBytes)) return reject("type_mismatch");
      if (
        !asset.sha256Verified &&
        (await storage.sha256Hex(asset.bucket, asset.key)) !== asset.sha256
      ) {
        return reject("hash_mismatch");
      }

      await c.assets.updateOne(
        { _id: asset._id, status: "verifying" },
        {
          $set: { status: "ready", sha256Verified: true, rejectedReason: null, updatedAt: r.now() },
        },
      );
      return { status: "ready" };
    },
  };
}
