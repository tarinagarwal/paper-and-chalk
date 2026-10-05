import { DEFAULT_CANVAS_BACKGROUND } from "@pc/schema";

import { collections } from "../collections";
import {
  ensureCollection,
  nullableDate,
  nullableString,
  number,
  requireFields,
  timestamps,
} from "./helpers";
import type { Migration } from "./types";

/**
 * New document flows (SPEC.md section 6): canvases keep their background on the document,
 * documents list the files they were imported from, and files are shared by reference (indexes
 * to find who still uses an asset before deleting it). Adds "My templates" and saved page sizes.
 */
export const newDocuments: Migration = {
  id: "0005_new_documents",
  description: "Canvas backgrounds, document sources, asset references, templates, page sizes",
  async up(db) {
    const documents = db.collection(collections.documents);
    await documents.updateMany(
      { canvasBackground: { $exists: false }, type: "canvas" },
      { $set: { canvasBackground: DEFAULT_CANVAS_BACKGROUND } },
    );
    await documents.updateMany(
      { canvasBackground: { $exists: false } },
      { $set: { canvasBackground: null } },
    );
    await documents.updateMany({ sources: { $exists: false } }, { $set: { sources: [] } });
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
        canvasBackground: ["object", "null"],
        sources: "array",
        editorsCanShare: "bool",
        createdBy: "string",
        deletedAt: nullableDate,
        ...timestamps,
      }),
    );
    // Who still uses an asset: imports, covers and image or PDF pages.
    await documents.createIndexes([
      { key: { "sources.assetId": 1 }, name: "sources_asset" },
      {
        key: { "cover.assetId": 1 },
        name: "cover_asset",
        partialFilterExpression: { "cover.assetId": { $type: "string" } },
      },
    ]);
    await db.collection(collections.pages).createIndex(
      { "background.assetId": 1 },
      {
        name: "background_asset",
        partialFilterExpression: { "background.assetId": { $type: "string" } },
      },
    );
    // The storage breakdown sums a user's files.
    await db
      .collection(collections.assets)
      .createIndex({ chargedTo: 1, status: 1 }, { name: "charged_status" });

    await ensureCollection(
      db,
      collections.templates,
      requireFields({
        _id: "string",
        ownerId: "string",
        name: "string",
        type: "string",
        pages: "array",
        ...timestamps,
      }),
    );
    await db
      .collection(collections.templates)
      .createIndex({ ownerId: 1, createdAt: -1 }, { name: "owner_created" });

    await ensureCollection(
      db,
      collections.pageSizePresets,
      requireFields({
        _id: "string",
        userId: "string",
        name: "string",
        widthPt: number,
        heightPt: number,
        unit: "string",
        ...timestamps,
      }),
    );
    await db
      .collection(collections.pageSizePresets)
      .createIndex({ userId: 1, createdAt: 1 }, { name: "user_created" });
  },
};
