import { titleSortKey } from "@pc/schema";
import type { AnyBulkWriteOperation, Db } from "mongodb";

import { collections } from "../collections";
import {
  dropIndexIfExists,
  ensureCollection,
  nullableDate,
  nullableString,
  number,
  requireFields,
  timestamps,
} from "./helpers";
import type { Migration } from "./types";

interface OldDocument {
  _id: string;
  title: string;
  createdBy: string;
}

/** Sets `bytes`, `titleKey` and `isShared` on documents written before this migration. */
async function backfillDocuments(db: Db) {
  const documents = db.collection<OldDocument>(collections.documents);
  await documents.updateMany({ bytes: { $exists: false } }, { $set: { bytes: 0 } });
  const missing = documents.find(
    { $or: [{ isShared: { $exists: false } }, { titleKey: { $exists: false } }] },
    { projection: { _id: 1, title: 1, createdBy: 1 } },
  );
  let batch: AnyBulkWriteOperation<OldDocument>[] = [];
  for await (const doc of missing) {
    const id = doc._id;
    const [grants, links] = await Promise.all([
      db
        .collection(collections.documentPermissions)
        .countDocuments(
          { documentId: id, "principal.userId": { $ne: doc.createdBy } },
          { limit: 1 },
        ),
      db
        .collection(collections.shareLinks)
        .countDocuments({ documentId: id, revokedAt: null }, { limit: 1 }),
    ]);
    batch.push({
      updateOne: {
        filter: { _id: id },
        update: { $set: { isShared: grants + links > 0, titleKey: titleSortKey(doc.title) } },
      },
    });
    if (batch.length === 500) {
      await documents.bulkWrite(batch);
      batch = [];
    }
  }
  if (batch.length > 0) await documents.bulkWrite(batch);
}

/**
 * The library (SPEC.md section 5): document size, name key and "shared" flag, per-user favourites
 * and last-opened times, smart folders, and indexes for every library sort (keyset paging stays
 * fast at 10,000 documents) and for the daily trash purge.
 */
export const library: Migration = {
  id: "0004_library",
  description:
    "Library: document size/shared/name key, favourites and recents, smart folders, sort indexes",
  async up(db) {
    await backfillDocuments(db);
    await ensureCollection(
      db,
      collections.documents,
      requireFields({
        _id: "string",
        workspaceId: "string",
        folderId: nullableString,
        type: "string",
        title: "string",
        titleTrigrams: "array",
        titleKey: "string",
        pageCount: number,
        bytes: number,
        tagIds: "array",
        isShared: "bool",
        editorsCanShare: "bool",
        createdBy: "string",
        deletedAt: nullableDate,
        ...timestamps,
      }),
    );
    // Covered by library_updated below.
    await dropIndexIfExists(db, collections.documents, "workspace_trash_updated");
    await db.collection(collections.documents).createIndexes([
      { key: { workspaceId: 1, deletedAt: 1, updatedAt: -1, _id: -1 }, name: "library_updated" },
      { key: { workspaceId: 1, deletedAt: 1, createdAt: -1, _id: -1 }, name: "library_created" },
      { key: { workspaceId: 1, deletedAt: 1, bytes: -1, _id: -1 }, name: "library_bytes" },
      { key: { workspaceId: 1, deletedAt: 1, titleKey: 1, _id: 1 }, name: "library_title" },
      {
        key: { folderId: 1, deletedAt: 1, updatedAt: -1, _id: -1 },
        name: "folder_updated",
        partialFilterExpression: { folderId: { $type: "string" } },
      },
      {
        key: { deletedAt: 1 },
        name: "trash_purge",
        partialFilterExpression: { deletedAt: { $type: "date" } },
      },
    ]);
    await db
      .collection(collections.folders)
      .createIndex(
        { deletedAt: 1 },
        { name: "trash_purge", partialFilterExpression: { deletedAt: { $type: "date" } } },
      );

    await ensureCollection(
      db,
      collections.documentUserStates,
      requireFields({
        _id: "string",
        userId: "string",
        documentId: "string",
        workspaceId: "string",
        favoritedAt: nullableDate,
        lastOpenedAt: nullableDate,
        ...timestamps,
      }),
    );
    await db.collection(collections.documentUserStates).createIndexes([
      { key: { userId: 1, documentId: 1 }, name: "user_document_unique", unique: true },
      {
        key: { userId: 1, lastOpenedAt: -1, documentId: -1 },
        name: "user_recent",
        partialFilterExpression: { lastOpenedAt: { $type: "date" } },
      },
      {
        key: { userId: 1, workspaceId: 1, lastOpenedAt: -1, documentId: -1 },
        name: "user_workspace_recent",
        partialFilterExpression: { lastOpenedAt: { $type: "date" } },
      },
      {
        key: { userId: 1, favoritedAt: -1 },
        name: "user_favourites",
        partialFilterExpression: { favoritedAt: { $type: "date" } },
      },
      { key: { documentId: 1 }, name: "documentId" },
    ]);

    await ensureCollection(
      db,
      collections.smartFolders,
      requireFields({
        _id: "string",
        workspaceId: "string",
        userId: "string",
        name: "string",
        filters: "object",
        sort: "string",
        dir: "string",
        orderKey: "string",
        ...timestamps,
      }),
    );
    await db
      .collection(collections.smartFolders)
      .createIndex({ workspaceId: 1, userId: 1, orderKey: 1 }, { name: "workspace_user_order" });
  },
};
