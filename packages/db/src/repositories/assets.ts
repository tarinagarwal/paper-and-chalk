import type { AssetRecord } from "@pc/schema";
import type { SignedRequest, Storage } from "@pc/storage";

import { InvalidRequestError } from "../errors";
import type { AccessContext } from "../permissions/can";
import { authorize, type RepoContext } from "./context";

export function assetsRepository(r: RepoContext, storage: Storage) {
  const { c } = r;

  /**
   * Assets inside a document follow the document's permissions (a share-link guest can see the
   * images in it; downloading the original follows the link's download switch). Loose assets
   * follow the workspace.
   */
  async function load(
    ctx: AccessContext,
    assetId: string,
    purpose: "view" | "download",
  ): Promise<AssetRecord> {
    const asset = await c.assets.findOne({ _id: assetId });
    if (!asset) throw new InvalidRequestError("not_found", "That file does not exist");
    if (asset.documentId) {
      await authorize(r, ctx, { type: "document", documentId: asset.documentId }, purpose);
    } else {
      await authorize(r, ctx, { type: "workspace", workspaceId: asset.workspaceId }, "view");
    }
    return asset;
  }

  return {
    get: (ctx: AccessContext, assetId: string) => load(ctx, assetId, "view"),

    /** A 15-minute signed URL. Only verified files are served. */
    async readUrl(
      ctx: AccessContext,
      assetId: string,
      options: { download?: boolean } = {},
    ): Promise<SignedRequest> {
      const asset = await load(ctx, assetId, options.download ? "download" : "view");
      if (asset.status === "rejected") {
        throw new InvalidRequestError("asset_rejected", "This file was rejected");
      }
      if (asset.status !== "ready") {
        throw new InvalidRequestError("asset_not_ready", "This file is still being checked");
      }
      return storage.presignRead({
        bucket: asset.bucket,
        key: asset.key,
        fileName: asset.fileName,
        download: options.download ?? false,
      });
    },
  };
}
