/**
 * Stored records (SPEC.md section 3, on MongoDB). One schema per collection; the repositories in
 * packages/db parse writes with these. Ids are UUIDv7 strings; users are referenced by their
 * Better Auth id (a string). Soft-deleted records carry `deletedAt`.
 */
import { z } from "zod";

import { roleSchema, shareLinkRoleSchema } from "./access";
import { pageBackgroundSchema, pageRotationSchema, pageSpecSchema } from "./page";
import { fractionalIndexSchema, hexColorSchema, positivePoints } from "./primitives";
import { EMBEDDING_DIMENSIONS } from "./search";
import {
  ASSET_BUCKETS,
  ASSET_KINDS,
  ASSET_STATUSES,
  sha256HexSchema,
  uploadMimeSchema,
} from "./uploads";

const recordId = z.uuid();
const userId = z.string().min(1).max(64);
const timestamps = { createdAt: z.date(), updatedAt: z.date() };
const softDelete = { deletedAt: z.date().nullable() };

export const PLANS = ["free", "pro", "team", "education"] as const;
export const planSchema = z.enum(PLANS);
export type Plan = z.infer<typeof planSchema>;

// ---------------------------------------------------------------------------------------------
// workspaces

export const workspaceRecordSchema = z.strictObject({
  _id: recordId,
  name: z.string().trim().min(1).max(100),
  ownerId: userId,
  plan: planSchema,
  /** Every user gets exactly one personal workspace, created at first sign-in. */
  personal: z.boolean(),
  ...timestamps,
  ...softDelete,
});
export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;

export const workspaceMemberRecordSchema = z.strictObject({
  _id: recordId,
  workspaceId: recordId,
  userId,
  /** Default role on every document in the workspace. */
  role: roleSchema,
  ...timestamps,
});
export type WorkspaceMemberRecord = z.infer<typeof workspaceMemberRecordSchema>;

// ---------------------------------------------------------------------------------------------
// folders and tags

export const folderRecordSchema = z.strictObject({
  _id: recordId,
  workspaceId: recordId,
  parentId: recordId.nullable(),
  name: z.string().trim().min(1).max(100),
  color: hexColorSchema.nullable(),
  icon: z.string().max(40).nullable(),
  orderKey: fractionalIndexSchema,
  createdBy: userId,
  ...timestamps,
  ...softDelete,
});
export type FolderRecord = z.infer<typeof folderRecordSchema>;

export const tagRecordSchema = z.strictObject({
  _id: recordId,
  workspaceId: recordId,
  name: z.string().trim().min(1).max(40),
  /** Lowercased name, unique per workspace. */
  nameKey: z.string().min(1).max(40),
  color: hexColorSchema,
  ...timestamps,
});
export type TagRecord = z.infer<typeof tagRecordSchema>;

// ---------------------------------------------------------------------------------------------
// documents and pages

export const DOCUMENT_TYPES = ["notebook", "canvas", "pdf"] as const;
export const documentTypeSchema = z.enum(DOCUMENT_TYPES);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const documentCoverSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("color"), color: hexColorSchema }),
  z.strictObject({ kind: z.literal("image"), assetId: recordId }),
]);

export const documentRecordSchema = z.strictObject({
  _id: recordId,
  workspaceId: recordId,
  folderId: recordId.nullable(),
  type: documentTypeSchema,
  title: z.string().trim().min(1).max(200),
  /** Trigrams of the title for fuzzy search (see search.ts). */
  titleTrigrams: z.array(z.string().length(3)).max(600),
  cover: documentCoverSchema.nullable(),
  /** Spec for new pages in notebooks; null for canvases. */
  defaultPageSpec: pageSpecSchema.nullable(),
  sourcePdfPath: z.string().max(1024).nullable(),
  pageCount: z.int().nonnegative(),
  thumbnailPath: z.string().max(1024).nullable(),
  tagIds: z.array(recordId).max(50),
  /** Section 4: editors may share only when the owner allows it. */
  editorsCanShare: z.boolean(),
  createdBy: userId,
  deletedBy: userId.nullable(),
  ...timestamps,
  ...softDelete,
});
export type DocumentRecord = z.infer<typeof documentRecordSchema>;

export const pageRecordSchema = z.strictObject({
  _id: recordId,
  documentId: recordId,
  orderKey: fractionalIndexSchema,
  widthPt: positivePoints,
  heightPt: positivePoints,
  rotation: pageRotationSchema,
  background: pageBackgroundSchema,
  /** Name of the page's Y.Doc on the sync server. */
  ydocName: z.string().min(1).max(200),
  thumbnailPath: z.string().max(1024).nullable(),
  /** PDF text, typed text and OCR'd handwriting, for full-text search. */
  searchText: z.string().max(200_000),
  embedding: z.array(z.number()).length(EMBEDDING_DIMENSIONS).nullable(),
  embeddingModel: z.string().max(100).nullable(),
  /** Section 4 page lock: only owners can change a locked page. */
  locked: z.boolean(),
  lockedBy: userId.nullable(),
  ...timestamps,
  ...softDelete,
});
export type PageRecord = z.infer<typeof pageRecordSchema>;

// ---------------------------------------------------------------------------------------------
// sharing

export const principalSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user"), userId }),
  /** An invite to someone who may not have an account yet; applies once they sign in. */
  z.strictObject({ kind: z.literal("email"), email: z.email().toLowerCase() }),
]);
export type Principal = z.infer<typeof principalSchema>;

export const documentPermissionRecordSchema = z.strictObject({
  _id: recordId,
  documentId: recordId,
  principal: principalSchema,
  role: roleSchema,
  expiresAt: z.date().nullable(),
  grantedBy: userId,
  ...timestamps,
});
export type DocumentPermissionRecord = z.infer<typeof documentPermissionRecordSchema>;

export const shareLinkRecordSchema = z.strictObject({
  _id: recordId,
  documentId: recordId,
  /** 128-bit random, base64url. */
  token: z.string().regex(/^[A-Za-z0-9_-]{22,}$/),
  role: shareLinkRoleSchema,
  expiresAt: z.date().nullable(),
  /** argon2id hash, or null for links without a password. */
  passwordHash: z.string().min(1).nullable(),
  allowDownload: z.boolean(),
  requireSignIn: z.boolean(),
  createdBy: userId,
  revokedAt: z.date().nullable(),
  ...timestamps,
});
export type ShareLinkRecord = z.infer<typeof shareLinkRecordSchema>;

// ---------------------------------------------------------------------------------------------
// comments, versions, media, jobs, activity

export const commentAnchorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("point"), x: z.number(), y: z.number() }),
  z.strictObject({
    kind: z.literal("area"),
    x: z.number(),
    y: z.number(),
    width: positivePoints,
    height: positivePoints,
  }),
  z.strictObject({
    kind: z.literal("textRange"),
    start: z.int().nonnegative(),
    end: z.int().nonnegative(),
  }),
  z.strictObject({ kind: z.literal("element"), elementId: z.uuid() }),
]);

export const commentRecordSchema = z.strictObject({
  _id: recordId,
  documentId: recordId,
  pageId: recordId.nullable(),
  anchor: commentAnchorSchema,
  /** The root comment's id; a root comment points at itself. */
  threadId: recordId,
  authorId: userId,
  body: z.string().min(1).max(10_000),
  resolvedAt: z.date().nullable(),
  resolvedBy: userId.nullable(),
  ...timestamps,
  ...softDelete,
});
export type CommentRecord = z.infer<typeof commentRecordSchema>;

export const versionRecordSchema = z.strictObject({
  _id: recordId,
  documentId: recordId,
  label: z.string().max(200).nullable(),
  /** Automatic snapshot (every 10 min of activity) or a named one. */
  auto: z.boolean(),
  createdBy: userId,
  /** Y.Doc name -> GCS object path of its snapshot. */
  snapshotPaths: z.record(z.string(), z.string()),
  createdAt: z.date(),
});
export type VersionRecord = z.infer<typeof versionRecordSchema>;

export const assetRecordSchema = z.strictObject({
  _id: recordId,
  workspaceId: recordId,
  documentId: recordId.nullable(),
  kind: z.enum(ASSET_KINDS),
  /** Which bucket role holds it, and the full object key (one object per upload). */
  bucket: z.enum(ASSET_BUCKETS),
  key: z.string().min(1).max(1024),
  fileName: z.string().min(1).max(255),
  bytes: z.int().positive(),
  mime: uploadMimeSchema,
  /** Dedupe key across the workspace. */
  sha256: sha256HexSchema,
  /** True once the stored bytes are known to hash to `sha256` (S3 checks single-PUT uploads). */
  sha256Verified: z.boolean(),
  /** A worker checks the file's real type before it is `ready`; mismatches are `rejected`. */
  status: z.enum(ASSET_STATUSES),
  rejectedReason: z.string().max(200).nullable(),
  createdBy: userId,
  /** Whose storage quota the bytes count against (the workspace owner at upload time). */
  chargedTo: userId,
  ...timestamps,
});
export type AssetRecord = z.infer<typeof assetRecordSchema>;

export const UPLOAD_STATUSES = ["pending", "completed", "aborted"] as const;

/** An upload in progress. Becomes the asset with the same id when it completes. */
export const uploadRecordSchema = z.strictObject({
  _id: recordId,
  workspaceId: recordId,
  documentId: recordId.nullable(),
  createdBy: userId,
  chargedTo: userId,
  fileName: z.string().min(1).max(255),
  mime: uploadMimeSchema,
  bytes: z.int().positive(),
  sha256: sha256HexSchema,
  bucket: z.enum(ASSET_BUCKETS),
  key: z.string().min(1).max(1024),
  /** S3 multipart upload id; null for single-PUT uploads. */
  multipartUploadId: z.string().min(1).nullable(),
  partSize: z.int().positive().nullable(),
  partCount: z.int().positive().nullable(),
  status: z.enum(UPLOAD_STATUSES),
  /** A TTL index removes the record after this; S3 aborts unfinished parts after a day. */
  expiresAt: z.date(),
  ...timestamps,
});
export type UploadRecord = z.infer<typeof uploadRecordSchema>;

export const audioSessionRecordSchema = z.strictObject({
  _id: recordId,
  documentId: recordId,
  assetId: recordId,
  startedAt: z.date(),
  durationMs: z.int().nonnegative(),
  createdBy: userId,
  ...timestamps,
});
export type AudioSessionRecord = z.infer<typeof audioSessionRecordSchema>;

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

export const jobRecordSchema = z.strictObject({
  _id: recordId,
  kind: z.string().min(1).max(100),
  status: z.enum(JOB_STATUSES),
  input: z.unknown(),
  output: z.unknown().nullable(),
  error: z.string().max(10_000).nullable(),
  attempts: z.int().nonnegative(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
  ...timestamps,
});
export type JobRecord = z.infer<typeof jobRecordSchema>;

export const activityRecordSchema = z.strictObject({
  _id: recordId,
  documentId: recordId,
  /** A user id, or a guest's temporary id. */
  actorId: z.string().min(1).max(64),
  verb: z.string().min(1).max(60),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
});
export type ActivityRecord = z.infer<typeof activityRecordSchema>;

/** Yjs updates waiting to be compacted into a snapshot (SPEC.md section 3). */
export const yjsUpdateRecordSchema = z.strictObject({
  _id: recordId,
  docName: z.string().min(1).max(200),
  documentId: recordId,
  /** Monotonic per docName. */
  seq: z.int().nonnegative(),
  update: z.instanceof(Uint8Array),
  createdAt: z.date(),
});
export type YjsUpdateRecord = z.infer<typeof yjsUpdateRecordSchema>;
