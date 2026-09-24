import { MongoServerError, type Db, type Document, type IndexDescription } from "mongodb";

import { collections } from "../collections";
import type { Migration } from "./types";

type BsonType =
  | "string"
  | "bool"
  | "date"
  | "int"
  | "long"
  | "double"
  | "object"
  | "array"
  | "null"
  | "binData"
  | "number";

/**
 * A light MongoDB validator: the listed fields must exist with these BSON types. Zod schemas in
 * @pc/schema do the full validation before every write; this is the database-level backstop.
 */
function requireFields(fields: Record<string, BsonType | BsonType[]>): Document {
  return {
    $jsonSchema: {
      bsonType: "object",
      required: Object.keys(fields),
      properties: Object.fromEntries(
        Object.entries(fields).map(([name, type]) => [name, { bsonType: type }]),
      ),
    },
  };
}

const ts = { createdAt: "date", updatedAt: "date" } as const;
const nullableDate: BsonType[] = ["date", "null"];
const nullableString: BsonType[] = ["string", "null"];

const specs: { name: string; validator: Document; indexes: IndexDescription[] }[] = [
  {
    name: collections.workspaces,
    validator: requireFields({
      _id: "string",
      name: "string",
      ownerId: "string",
      plan: "string",
      personal: "bool",
      deletedAt: nullableDate,
      ...ts,
    }),
    indexes: [
      { key: { ownerId: 1 }, name: "ownerId" },
      // Exactly one personal workspace per user.
      {
        key: { ownerId: 1, personal: 1 },
        name: "one_personal_per_owner",
        unique: true,
        partialFilterExpression: { personal: true },
      },
    ],
  },
  {
    name: collections.workspaceMembers,
    validator: requireFields({
      _id: "string",
      workspaceId: "string",
      userId: "string",
      role: "string",
      ...ts,
    }),
    indexes: [
      { key: { workspaceId: 1, userId: 1 }, name: "workspace_user_unique", unique: true },
      { key: { userId: 1 }, name: "userId" },
    ],
  },
  {
    name: collections.folders,
    validator: requireFields({
      _id: "string",
      workspaceId: "string",
      parentId: nullableString,
      name: "string",
      orderKey: "string",
      deletedAt: nullableDate,
      ...ts,
    }),
    indexes: [
      { key: { workspaceId: 1, parentId: 1, orderKey: 1 }, name: "workspace_parent_order" },
    ],
  },
  {
    name: collections.documents,
    validator: requireFields({
      _id: "string",
      workspaceId: "string",
      folderId: nullableString,
      type: "string",
      title: "string",
      titleTrigrams: "array",
      pageCount: ["int", "long", "double"],
      tagIds: "array",
      editorsCanShare: "bool",
      createdBy: "string",
      deletedAt: nullableDate,
      ...ts,
    }),
    indexes: [
      { key: { workspaceId: 1, folderId: 1, updatedAt: -1 }, name: "workspace_folder_updated" },
      { key: { workspaceId: 1, deletedAt: 1, updatedAt: -1 }, name: "workspace_trash_updated" },
      // Fuzzy title search: candidates share trigrams with the query (see @pc/schema search.ts).
      { key: { workspaceId: 1, titleTrigrams: 1 }, name: "workspace_title_trigrams" },
      { key: { tagIds: 1 }, name: "tagIds" },
    ],
  },
  {
    name: collections.pages,
    validator: requireFields({
      _id: "string",
      documentId: "string",
      orderKey: "string",
      widthPt: ["int", "long", "double"],
      heightPt: ["int", "long", "double"],
      background: "object",
      ydocName: "string",
      searchText: "string",
      locked: "bool",
      deletedAt: nullableDate,
      ...ts,
    }),
    indexes: [
      { key: { documentId: 1, deletedAt: 1, orderKey: 1 }, name: "document_order" },
      // Full-text search over PDF text, typed text and OCR'd handwriting.
      { key: { searchText: "text" }, name: "search_text", default_language: "none" },
    ],
  },
  {
    name: collections.documentPermissions,
    validator: requireFields({
      _id: "string",
      documentId: "string",
      principal: "object",
      role: "string",
      expiresAt: nullableDate,
      grantedBy: "string",
      ...ts,
    }),
    indexes: [
      { key: { documentId: 1 }, name: "documentId" },
      { key: { "principal.userId": 1 }, name: "principal_user", sparse: true },
      { key: { "principal.email": 1 }, name: "principal_email", sparse: true },
    ],
  },
  {
    name: collections.shareLinks,
    validator: requireFields({
      _id: "string",
      documentId: "string",
      token: "string",
      role: "string",
      expiresAt: nullableDate,
      passwordHash: nullableString,
      allowDownload: "bool",
      requireSignIn: "bool",
      revokedAt: nullableDate,
      ...ts,
    }),
    indexes: [
      { key: { token: 1 }, name: "token_unique", unique: true },
      { key: { documentId: 1 }, name: "documentId" },
    ],
  },
  {
    name: collections.tags,
    validator: requireFields({
      _id: "string",
      workspaceId: "string",
      name: "string",
      nameKey: "string",
      color: "string",
      ...ts,
    }),
    indexes: [{ key: { workspaceId: 1, nameKey: 1 }, name: "workspace_name_unique", unique: true }],
  },
  {
    name: collections.comments,
    validator: requireFields({
      _id: "string",
      documentId: "string",
      pageId: nullableString,
      anchor: "object",
      threadId: "string",
      authorId: "string",
      body: "string",
      deletedAt: nullableDate,
      ...ts,
    }),
    indexes: [
      { key: { documentId: 1, pageId: 1 }, name: "document_page" },
      { key: { threadId: 1, createdAt: 1 }, name: "thread_created" },
    ],
  },
  {
    name: collections.versions,
    validator: requireFields({
      _id: "string",
      documentId: "string",
      auto: "bool",
      createdBy: "string",
      snapshotPaths: "object",
      createdAt: "date",
    }),
    indexes: [{ key: { documentId: 1, createdAt: -1 }, name: "document_created" }],
  },
  {
    name: collections.assets,
    validator: requireFields({
      _id: "string",
      workspaceId: "string",
      kind: "string",
      gcsPath: "string",
      bytes: ["int", "long", "double"],
      mime: "string",
      sha256: "string",
      ...ts,
    }),
    indexes: [
      { key: { workspaceId: 1, sha256: 1 }, name: "workspace_sha256" },
      { key: { documentId: 1 }, name: "documentId" },
    ],
  },
  {
    name: collections.audioSessions,
    validator: requireFields({
      _id: "string",
      documentId: "string",
      assetId: "string",
      startedAt: "date",
      durationMs: ["int", "long", "double"],
      ...ts,
    }),
    indexes: [{ key: { documentId: 1, startedAt: -1 }, name: "document_started" }],
  },
  {
    name: collections.jobs,
    validator: requireFields({
      _id: "string",
      kind: "string",
      status: "string",
      attempts: ["int", "long", "double"],
      ...ts,
    }),
    indexes: [
      { key: { status: 1, createdAt: 1 }, name: "status_created" },
      { key: { kind: 1, createdAt: -1 }, name: "kind_created" },
    ],
  },
  {
    name: collections.activity,
    validator: requireFields({
      _id: "string",
      documentId: "string",
      actorId: "string",
      verb: "string",
      payload: "object",
      createdAt: "date",
    }),
    indexes: [{ key: { documentId: 1, createdAt: -1 }, name: "document_created" }],
  },
  {
    name: collections.yjsUpdates,
    validator: requireFields({
      _id: "string",
      docName: "string",
      documentId: "string",
      seq: ["int", "long"],
      update: "binData",
      createdAt: "date",
    }),
    indexes: [
      { key: { docName: 1, seq: 1 }, name: "doc_seq_unique", unique: true },
      { key: { documentId: 1 }, name: "documentId" },
    ],
  },
];

async function ensureCollection(db: Db, name: string, validator: Document): Promise<void> {
  const options = { validator, validationLevel: "moderate", validationAction: "error" } as const;
  try {
    await db.createCollection(name, options);
  } catch (error) {
    // 48 = NamespaceExists: apply the validator to the existing collection instead.
    if (error instanceof MongoServerError && error.code === 48) {
      await db.command({ collMod: name, ...options });
    } else {
      throw error;
    }
  }
}

/** Every collection from SPEC.md section 3, with validators and indexes (step 4). */
export const coreCollections: Migration = {
  id: "0002_core_collections",
  description:
    "Workspaces, folders, documents, pages, sharing, comments, media, jobs, activity, Yjs updates",
  async up(db) {
    for (const spec of specs) {
      await ensureCollection(db, spec.name, spec.validator);
      await db.collection(spec.name).createIndexes(spec.indexes);
    }
  },
};

export const coreCollectionNames = specs.map((s) => s.name);
