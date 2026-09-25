import "server-only";

import type { LibraryItem, LibraryResult, UploadInitResult, WorkspaceWithRole } from "@pc/db";
import {
  folderIconSchema,
  type AssetRecord,
  type AssetView,
  type FolderRecord,
  type FolderView,
  type LibraryDocument,
  type LibraryPage,
  type SignedRequestView,
  type SmartFolderRecord,
  type SmartFolderView,
  type TagRecord,
  type TagView,
  type UploadInitResponse,
  type WorkspaceView,
} from "@pc/schema";
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

// ---------------------------------------------------------------------------------------------
// library

/** A library item as the browser sees it (no internal fields such as trigrams or page specs). */
export function libraryDocumentView(item: LibraryItem): LibraryDocument {
  const d = item.document;
  return {
    id: d._id,
    workspaceId: d.workspaceId,
    folderId: d.folderId,
    type: d.type,
    title: d.title,
    pageCount: d.pageCount,
    bytes: d.bytes,
    isShared: d.isShared,
    tags: item.tags.map(tagView),
    owner: item.owner,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    deletedAt: d.deletedAt?.toISOString() ?? null,
    lastOpenedAt: item.lastOpenedAt?.toISOString() ?? null,
    favourite: item.favourite,
    role: item.role,
    can: item.can,
  };
}

export function libraryPageView(result: LibraryResult): LibraryPage {
  return {
    items: result.items.map(libraryDocumentView),
    nextCursor: result.nextCursor,
    total: result.total,
  };
}

export function tagView(tag: TagRecord): TagView {
  return { id: tag._id, workspaceId: tag.workspaceId, name: tag.name, color: tag.color };
}

export function folderView(folder: FolderRecord): FolderView {
  const icon = folderIconSchema.safeParse(folder.icon);
  return {
    id: folder._id,
    workspaceId: folder.workspaceId,
    parentId: folder.parentId,
    name: folder.name,
    color: folder.color,
    icon: icon.success ? icon.data : null,
    orderKey: folder.orderKey,
  };
}

export function smartFolderView(smart: SmartFolderRecord): SmartFolderView {
  return {
    id: smart._id,
    workspaceId: smart.workspaceId,
    name: smart.name,
    filters: smart.filters,
    sort: smart.sort,
    dir: smart.dir,
    orderKey: smart.orderKey,
  };
}

export function workspaceView(workspace: WorkspaceWithRole): WorkspaceView {
  return {
    id: workspace._id,
    name: workspace.name,
    personal: workspace.personal,
    role: workspace.role,
  };
}
