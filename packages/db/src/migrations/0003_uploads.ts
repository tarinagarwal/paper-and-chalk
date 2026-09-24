import { collections } from "../collections";
import {
  dropIndexIfExists,
  ensureCollection,
  nullableString,
  number,
  requireFields,
  timestamps,
} from "./helpers";
import type { Migration } from "./types";

/**
 * Step 5, file storage on S3: assets describe an S3 object (bucket role + key) with a verification
 * status and the user whose quota they count against; `uploads` tracks uploads in progress.
 */
export const uploads: Migration = {
  id: "0003_uploads",
  description: "Assets on S3 with verification status; uploads in progress; dedupe index",
  async up(db) {
    await ensureCollection(
      db,
      collections.assets,
      requireFields({
        _id: "string",
        workspaceId: "string",
        documentId: nullableString,
        kind: "string",
        bucket: "string",
        key: "string",
        fileName: "string",
        bytes: number,
        mime: "string",
        sha256: "string",
        sha256Verified: "bool",
        status: "string",
        createdBy: "string",
        chargedTo: "string",
        ...timestamps,
      }),
    );
    // One live copy of a file per workspace; rejected uploads do not block a later good one.
    await dropIndexIfExists(db, collections.assets, "workspace_sha256");
    await db.collection(collections.assets).createIndex(
      { workspaceId: 1, sha256: 1 },
      {
        name: "workspace_sha256_live",
        unique: true,
        partialFilterExpression: { status: { $in: ["verifying", "ready"] } },
      },
    );

    await ensureCollection(
      db,
      collections.uploads,
      requireFields({
        _id: "string",
        workspaceId: "string",
        createdBy: "string",
        chargedTo: "string",
        fileName: "string",
        mime: "string",
        bytes: number,
        sha256: "string",
        bucket: "string",
        key: "string",
        multipartUploadId: nullableString,
        status: "string",
        expiresAt: "date",
        ...timestamps,
      }),
    );
    await db.collection(collections.uploads).createIndexes([
      // Resuming: the same person uploading the same file into the same workspace.
      { key: { workspaceId: 1, createdBy: 1, sha256: 1, status: 1 }, name: "resume" },
      { key: { expiresAt: 1 }, name: "expiresAt_ttl", expireAfterSeconds: 0 },
    ]);
  },
};
