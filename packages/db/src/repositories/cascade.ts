import type { AssetBucket } from "@pc/schema";
import type { ClientSession } from "mongodb";

import type { TypedCollections } from "../collections";
import { refundStorage } from "./quota";

/** An S3 object whose asset record was deleted. The caller removes it after the commit. */
export interface StoredObject {
  bucket: AssetBucket;
  key: string;
}

export interface CascadeResult {
  documents: number;
  objects: StoredObject[];
}

/**
 * The assets these documents use (their own uploads, imports, covers, image and PDF pages) that
 * no other document uses. Uploads are deduplicated per workspace, so one file can back several
 * documents; it may only go when the last of them does.
 */
async function assetsOnlyUsedBy(
  c: TypedCollections,
  documentIds: readonly string[],
  session: ClientSession,
): Promise<string[]> {
  const ids = [...documentIds];
  // One at a time: operations in a transaction must not run in parallel on its session.
  const owned = await c.assets
    .find({ documentId: { $in: ids } }, { projection: { _id: 1 }, session })
    .toArray();
  const documents = await c.documents
    .find({ _id: { $in: ids } }, { projection: { sources: 1, cover: 1 }, session })
    .toArray();
  const pages = await c.pages
    .find(
      { documentId: { $in: ids }, "background.assetId": { $type: "string" } },
      { projection: { background: 1 }, session },
    )
    .toArray();
  const candidates = new Set(owned.map((a) => a._id));
  for (const d of documents) {
    for (const s of d.sources) candidates.add(s.assetId);
    if (d.cover?.kind === "image") candidates.add(d.cover.assetId);
  }
  for (const p of pages) if (p.background.kind !== "paper") candidates.add(p.background.assetId);
  if (candidates.size === 0) return [];

  const list = [...candidates];
  const otherDocuments = await c.documents
    .find(
      {
        _id: { $nin: ids },
        $or: [{ "sources.assetId": { $in: list } }, { "cover.assetId": { $in: list } }],
      },
      { projection: { sources: 1, cover: 1 }, session },
    )
    .toArray();
  const otherPages = await c.pages
    .find(
      { documentId: { $nin: ids }, "background.assetId": { $in: list } },
      { projection: { background: 1 }, session },
    )
    .toArray();
  const stillUsed = new Set<string>();
  for (const d of otherDocuments) {
    for (const s of d.sources) stillUsed.add(s.assetId);
    if (d.cover?.kind === "image") stillUsed.add(d.cover.assetId);
  }
  for (const p of otherPages)
    if (p.background.kind !== "paper") stillUsed.add(p.background.assetId);
  return list.filter((id) => !stillUsed.has(id));
}

/**
 * Deletes documents and everything that belongs to them. No permission check: callers decide
 * (the trash repository checks `can()`, the purge job goes by age, the seed removes only its own
 * records). Files no other document uses are deleted and their bytes refunded; the S3 objects
 * they pointed at are returned so the caller can remove them once the transaction has committed.
 */
export async function deleteDocumentsCascade(
  c: TypedCollections,
  documentIds: readonly string[],
  session: ClientSession,
): Promise<CascadeResult> {
  if (documentIds.length === 0) return { documents: 0, objects: [] };
  const ids = [...documentIds];
  const doomed = await assetsOnlyUsedBy(c, ids, session);
  const assets = await c.assets
    .find(
      { _id: { $in: doomed } },
      { projection: { bucket: 1, key: 1, bytes: 1, chargedTo: 1, status: 1 }, session },
    )
    .toArray();
  // Give the bytes of live files back to whoever was charged for them.
  const refunds = new Map<string, number>();
  for (const a of assets) {
    if (a.status === "verifying" || a.status === "ready") {
      refunds.set(a.chargedTo, (refunds.get(a.chargedTo) ?? 0) + a.bytes);
    }
  }
  for (const [userId, bytes] of refunds) await refundStorage(c, userId, bytes, session);

  const byDoc = { documentId: { $in: ids } };
  // One at a time: operations in a transaction must not run in parallel on its session.
  for (const dependent of [
    c.pages,
    c.documentPermissions,
    c.shareLinks,
    c.comments,
    c.versions,
    c.audioSessions,
    c.activity,
    c.yjsUpdates,
    c.documentUserStates,
  ] as const) {
    await dependent.deleteMany(byDoc, { session });
  }
  await c.assets.deleteMany({ _id: { $in: doomed } }, { session });
  // Files other documents still use stay, but no longer point at a document that is gone.
  await c.assets.updateMany(byDoc, { $set: { documentId: null } }, { session });
  const result = await c.documents.deleteMany({ _id: { $in: ids } }, { session });
  return {
    documents: result.deletedCount,
    objects: assets.map(({ bucket, key }) => ({ bucket, key })),
  };
}
