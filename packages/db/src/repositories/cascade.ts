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
 * Deletes documents and everything that belongs to them. No permission check: callers decide
 * (the trash repository checks `can()`, the purge job goes by age, the seed removes only its own
 * records). Asset records go here and their bytes are refunded; the S3 objects they pointed at are
 * returned so the caller can remove them once the transaction has committed.
 */
export async function deleteDocumentsCascade(
  c: TypedCollections,
  documentIds: readonly string[],
  session: ClientSession,
): Promise<CascadeResult> {
  if (documentIds.length === 0) return { documents: 0, objects: [] };
  const byDoc = { documentId: { $in: [...documentIds] } };
  // Give the bytes of live assets back to whoever was charged for them.
  const charged = await c.assets
    .aggregate<{ _id: string; bytes: number }>(
      [
        { $match: { ...byDoc, status: { $in: ["verifying", "ready"] } } },
        { $group: { _id: "$chargedTo", bytes: { $sum: "$bytes" } } },
      ],
      { session },
    )
    .toArray();
  for (const { _id: userId, bytes } of charged) await refundStorage(c, userId, bytes, session);
  const objects = (
    await c.assets.find(byDoc, { projection: { bucket: 1, key: 1 }, session }).toArray()
  ).map(({ bucket, key }) => ({ bucket, key }));
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
    c.assets,
    c.documentUserStates,
  ] as const) {
    await dependent.deleteMany(byDoc, { session });
  }
  const result = await c.documents.deleteMany({ _id: { $in: [...documentIds] } }, { session });
  return { documents: result.deletedCount, objects };
}
