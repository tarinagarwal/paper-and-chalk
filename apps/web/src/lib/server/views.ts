import "server-only";

import type { UploadInitResult } from "@pc/db";
import type { AssetRecord, AssetView, SignedRequestView, UploadInitResponse } from "@pc/schema";
import type { SignedRequest } from "@pc/storage";

/** What the browser may know about an asset: no bucket, key or quota owner. */
export function assetView(asset: AssetRecord): AssetView {
  return {
    id: asset._id,
    workspaceId: asset.workspaceId,
    documentId: asset.documentId,
    kind: asset.kind,
    fileName: asset.fileName,
    mime: asset.mime,
    bytes: asset.bytes,
    sha256: asset.sha256,
    status: asset.status,
    rejectedReason: asset.rejectedReason,
    createdAt: asset.createdAt.toISOString(),
  };
}

export function signedView(request: SignedRequest): SignedRequestView {
  return { ...request, expiresAt: request.expiresAt.toISOString() };
}

export function uploadInitView(result: UploadInitResult): UploadInitResponse {
  if (result.status === "exists") return { status: "exists", asset: assetView(result.asset) };
  if (result.mode === "single") {
    return {
      status: "upload",
      uploadId: result.upload._id,
      mode: "single",
      request: signedView(result.request),
    };
  }
  return {
    status: "upload",
    uploadId: result.upload._id,
    mode: "multipart",
    partSize: result.partSize,
    partCount: result.partCount,
    completedParts: result.completedParts,
    parts: result.parts.map((p) => ({ partNumber: p.partNumber, request: signedView(p.request) })),
  };
}
