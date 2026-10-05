/**
 * Files the server fetched for someone (the Import tab's "from URL"). The worker streams the file
 * into S3; this records it like a finished upload: deduplicated per workspace, charged to the
 * workspace owner, and ready at once (the worker hashed the bytes and checked their type).
 */
import { assetRecordSchema, uploadKind, type AssetRecord, type UploadMime } from "@pc/schema";
import type { Bucket, Storage } from "@pc/storage";
import { MongoServerError } from "mongodb";

import { InvalidRequestError } from "../errors";
import { withTransaction } from "../transaction";
import type { RepoContext } from "./context";
import { chargeStorage } from "./quota";

export function importsRepository(r: RepoContext, storage: Storage) {
  const { c } = r;

  return {
    /** System: called by the importFromUrl job after the web app checked the user may add files. */
    async registerFetched(input: {
      assetId: string;
      workspaceId: string;
      userId: string;
      fileName: string;
      mime: UploadMime;
      bucket: Bucket;
      key: string;
      bytes: number;
      sha256: string;
    }): Promise<{ asset: AssetRecord; created: boolean }> {
      const workspace = await c.workspaces.findOne({ _id: input.workspaceId, deletedAt: null });
      if (!workspace) throw new InvalidRequestError("not_found", "Workspace not found");
      const twin = () =>
        c.assets.findOne({
          workspaceId: input.workspaceId,
          sha256: input.sha256,
          status: { $in: ["verifying", "ready"] },
        });
      const existing = await twin();
      if (existing) {
        await storage.remove(input.bucket, input.key);
        return { asset: existing, created: false };
      }
      const now = r.now();
      const asset = assetRecordSchema.parse({
        _id: input.assetId,
        workspaceId: input.workspaceId,
        documentId: null,
        kind: uploadKind(input.mime),
        bucket: input.bucket,
        key: input.key,
        fileName: input.fileName,
        bytes: input.bytes,
        mime: input.mime,
        sha256: input.sha256,
        sha256Verified: true,
        status: "ready",
        rejectedReason: null,
        createdBy: input.userId,
        chargedTo: workspace.ownerId,
        createdAt: now,
        updatedAt: now,
      });
      try {
        await withTransaction(r.conn.client, async (session) => {
          await chargeStorage(c, workspace.ownerId, input.bytes, session);
          await c.assets.insertOne(asset, { session });
        });
        return { asset, created: true };
      } catch (error) {
        // Nothing was charged: the transaction rolled back. Drop this copy either way.
        await storage.remove(input.bucket, input.key);
        const duplicate = error instanceof MongoServerError && error.code === 11000;
        const winner = duplicate ? await twin() : null;
        if (winner) return { asset: winner, created: false };
        throw error;
      }
    },

    /** The object key for a fetched file, like an upload's. */
    keyFor: (workspaceId: string, assetId: string) => storage.key("ws", workspaceId, assetId),
  };
}
