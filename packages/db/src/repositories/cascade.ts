import type { ClientSession } from "mongodb";

import type { TypedCollections } from "../collections";

/**
 * Deletes documents and everything that belongs to them. No permission check: callers decide
 * (documents.purge checks `can()`, the seed removes only its own records). Asset records go here;
 * their GCS objects are removed by a cleanup job (later step).
 */
export async function deleteDocumentsCascade(
  c: TypedCollections,
  documentIds: readonly string[],
  session: ClientSession,
): Promise<number> {
  if (documentIds.length === 0) return 0;
  const byDoc = { documentId: { $in: [...documentIds] } };
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
  ] as const) {
    await dependent.deleteMany(byDoc, { session });
  }
  const result = await c.documents.deleteMany({ _id: { $in: [...documentIds] } }, { session });
  return result.deletedCount;
}
