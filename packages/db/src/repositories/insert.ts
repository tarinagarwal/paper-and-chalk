/**
 * Writing a new document: the document row, its owner grant, its pages and its meta Y.Doc stub,
 * in one transaction, plus the assets it uses. Shared by create, duplicate and the New dialog's
 * flows so every new document gets the same rows.
 */
import {
  documentPermissionRecordSchema,
  documentRecordSchema,
  keysBetween,
  pageRecordSchema,
  titleSortKey,
  trigrams,
  type CanvasBackground,
  type DocumentRecord,
  type DocumentSource,
  type DocumentType,
  type PageRecord,
  type PageSpec,
  type TemplatePage,
} from "@pc/schema";

import { InvalidRequestError } from "../errors";
import { newId } from "../ids";
import { withTransaction } from "../transaction";
import type { RepoContext } from "./context";
import { metaDocStub } from "./ydoc";

export interface NewDocumentRows {
  workspaceId: string;
  folderId: string | null;
  type: DocumentType;
  title: string;
  cover: DocumentRecord["cover"];
  defaultPageSpec: PageSpec | null;
  canvasBackground: CanvasBackground | null;
  sources: DocumentSource[];
  /** Total size of the files the document uses. */
  bytes: number;
  tagIds?: string[];
  pages: TemplatePage[];
  /** Assets the document uses that belong to no document yet: they become its own. */
  attachAssetIds?: string[];
}

/** Refuses a folder outside the workspace (or one in the trash). */
export async function checkFolder(r: RepoContext, workspaceId: string, folderId: string | null) {
  if (!folderId) return;
  const folder = await r.c.folders.findOne({ _id: folderId, deletedAt: null });
  if (folder?.workspaceId !== workspaceId) {
    throw new InvalidRequestError("wrong_folder", "That folder is not in this workspace");
  }
}

export async function insertDocument(
  r: RepoContext,
  userId: string,
  rows: NewDocumentRows,
): Promise<{ document: DocumentRecord; pages: PageRecord[] }> {
  const { c } = r;
  const now = r.now();
  const document = documentRecordSchema.parse({
    _id: newId(),
    workspaceId: rows.workspaceId,
    folderId: rows.folderId,
    type: rows.type,
    title: rows.title,
    titleTrigrams: trigrams(rows.title),
    titleKey: titleSortKey(rows.title),
    cover: rows.cover,
    defaultPageSpec: rows.defaultPageSpec,
    canvasBackground: rows.canvasBackground,
    sources: rows.sources,
    sourcePdfPath: null,
    pageCount: rows.pages.length,
    bytes: rows.bytes,
    thumbnailPath: null,
    tagIds: rows.tagIds ?? [],
    isShared: false,
    editorsCanShare: false,
    createdBy: userId,
    deletedBy: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  const owner = documentPermissionRecordSchema.parse({
    _id: newId(),
    documentId: document._id,
    principal: { kind: "user", userId },
    role: "owner",
    expiresAt: null,
    grantedBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  const keys = rows.pages.length > 0 ? keysBetween(null, null, rows.pages.length) : [];
  const pages = rows.pages.map((page, i) => {
    const id = newId();
    return pageRecordSchema.parse({
      _id: id,
      documentId: document._id,
      orderKey: keys[i],
      widthPt: page.widthPt,
      heightPt: page.heightPt,
      rotation: page.rotation,
      background: page.background,
      ydocName: `page:${id}`,
      thumbnailPath: null,
      searchText: "",
      embedding: null,
      embeddingModel: null,
      locked: false,
      lockedBy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  });
  const meta = metaDocStub(
    {
      documentId: document._id,
      type: rows.type,
      pageIds: pages.map((p) => p._id),
      canvasBackground: rows.canvasBackground,
    },
    now,
  );
  await withTransaction(r.conn.client, async (session) => {
    await c.documents.insertOne(document, { session });
    await c.documentPermissions.insertOne(owner, { session });
    if (pages.length > 0) await c.pages.insertMany(pages, { session });
    await c.yjsUpdates.insertOne(meta, { session });
    if (rows.attachAssetIds && rows.attachAssetIds.length > 0) {
      await c.assets.updateMany(
        { _id: { $in: rows.attachAssetIds }, documentId: null },
        { $set: { documentId: document._id, updatedAt: now } },
        { session },
      );
    }
  });
  return { document, pages };
}

/** Every asset a document uses: its imports, its cover and its image or PDF pages. */
export function assetIdsOf(
  document: Pick<DocumentRecord, "sources" | "cover">,
  pages: readonly Pick<PageRecord, "background">[],
): string[] {
  const ids = new Set(document.sources.map((s) => s.assetId));
  if (document.cover?.kind === "image") ids.add(document.cover.assetId);
  for (const page of pages) {
    if (page.background.kind !== "paper") ids.add(page.background.assetId);
  }
  return [...ids];
}
