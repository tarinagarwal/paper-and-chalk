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
    via: string | null = null,
  ): Promise<AssetRecord> {
    const asset = await c.assets.findOne({ _id: assetId });
    if (!asset) throw new InvalidRequestError("not_found", "That file does not exist");
    if (via) {
      // Through a document that uses the file (files can be shared by several documents).
      await authorize(r, ctx, { type: "document", documentId: via }, purpose);
      const document = await c.documents.findOne({ _id: via });
      const uses =
        document !== null &&
        (document.sources.some((s) => s.assetId === assetId) ||
          (document.cover?.kind === "image" && document.cover.assetId === assetId) ||
          (await c.pages.countDocuments(
            { documentId: via, deletedAt: null, "background.assetId": assetId },
            { limit: 1 },
          )) > 0);
      if (!uses) throw new InvalidRequestError("not_found", "That file does not exist");
    } else if (asset.documentId) {
      await authorize(r, ctx, { type: "document", documentId: asset.documentId }, purpose);
    } else {
      await authorize(r, ctx, { type: "workspace", workspaceId: asset.workspaceId }, "view");
    }
    return asset;
  }

  return {
    get: (ctx: AccessContext, assetId: string) => load(ctx, assetId, "view"),

    /**
     * A 15-minute signed URL. Only verified files are served. `documentId` reads the file as part
     * of that document (image pages, covers): how people with access to the document but not the
     * workspace see its files.
     */
    async readUrl(
      ctx: AccessContext,
      assetId: string,
      options: { download?: boolean; documentId?: string | null } = {},
    ): Promise<SignedRequest> {
      const asset = await load(
        ctx,
        assetId,
        options.download ? "download" : "view",
        options.documentId ?? null,
      );
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
