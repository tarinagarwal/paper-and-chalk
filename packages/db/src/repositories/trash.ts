import { TRASH_RETENTION_DAYS } from "@pc/schema";
import type { Storage } from "@pc/storage";

import { AccessDeniedError, InvalidRequestError } from "../errors";
import type { AccessContext } from "../permissions/can";
import { withTransaction } from "../transaction";
import { deleteDocumentsCascade, type StoredObject } from "./cascade";
import { authorize, type RepoContext } from "./context";

const DAY_MS = 86_400_000;
/** Documents deleted per transaction by the purge job. */
const PURGE_BATCH = 200;

export interface PurgeFailure {
  id: string;
  error: string;
  message: string;
}

export interface ExpiredPurgeResult {
  documents: number;
  folders: number;
  objectsRemoved: number;
  objectsFailed: number;
}

/**
 * Deleting for good: documents (with everything that belongs to them) and their files on S3.
 * Records go first, in a transaction; S3 objects are removed after it commits. If S3 fails the
 * object is orphaned (it costs a little storage) rather than a document pointing at a missing file.
 */
export function trashRepository(r: RepoContext, storage: Storage) {
  const { c } = r;

  async function removeObjects(objects: readonly StoredObject[]) {
    let removed = 0;
    let failed = 0;
    for (const object of objects) {
      try {
        await storage.remove(object.bucket, object.key);
        removed++;
      } catch {
        failed++;
      }
    }
    return { removed, failed };
  }

  return {
    /** "Delete forever" for trashed documents the user owns. Reports the ones it refused. */
    async purge(
      ctx: AccessContext,
      documentIds: readonly string[],
    ): Promise<{ done: string[]; failed: PurgeFailure[] }> {
      const done: string[] = [];
      const failed: PurgeFailure[] = [];
      for (const id of new Set(documentIds)) {
        try {
          await authorize(r, ctx, { type: "document", documentId: id }, "purge");
          done.push(id);
        } catch (error) {
          if (error instanceof AccessDeniedError) {
            failed.push({ id, error: error.reason, message: error.message });
          } else if (error instanceof InvalidRequestError) {
            failed.push({ id, error: error.code, message: error.message });
          } else {
            throw error;
          }
        }
      }
      if (done.length > 0) {
        const result = await withTransaction(r.conn.client, (session) =>
          deleteDocumentsCascade(c, done, session),
        );
        await removeObjects(result.objects);
      }
      return { done, failed };
    },

    /**
     * System (the daily purgeTrash job): deletes documents and folders that have been in the trash
     * longer than the retention period. Safe to run twice; each batch is its own transaction.
     */
    async purgeExpired(options: { retentionDays?: number } = {}): Promise<ExpiredPurgeResult> {
      const cutoff = new Date(
        r.now().getTime() - (options.retentionDays ?? TRASH_RETENTION_DAYS) * DAY_MS,
      );
      const result: ExpiredPurgeResult = {
        documents: 0,
        folders: 0,
        objectsRemoved: 0,
        objectsFailed: 0,
      };
      for (;;) {
        const expired = await c.documents
          .find({ deletedAt: { $type: "date", $lt: cutoff } }, { projection: { _id: 1 } })
          .limit(PURGE_BATCH)
          .toArray();
        if (expired.length === 0) break;
        const deleted = await withTransaction(r.conn.client, (session) =>
          deleteDocumentsCascade(
            c,
            expired.map((d) => d._id),
            session,
          ),
        );
        const objects = await removeObjects(deleted.objects);
        result.documents += deleted.documents;
        result.objectsRemoved += objects.removed;
        result.objectsFailed += objects.failed;
        if (expired.length < PURGE_BATCH) break;
      }
      // Documents in a trashed folder were trashed with it (and a restored one moves to the top
      // level), so by now no document points at these folders.
      const folders = await c.folders.deleteMany({ deletedAt: { $type: "date", $lt: cutoff } });
      result.folders = folders.deletedCount;
      return result;
    },
  };
}

export type TrashRepository = ReturnType<typeof trashRepository>;
