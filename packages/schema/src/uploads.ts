/**
 * Uploads (SPEC.md sections 6, 12, 27): which files are accepted, how big they may be, how they
 * are split into parts, the storage quota per plan, and the upload API's request and response
 * shapes. Shared by the browser (early checks, chunking) and the server (enforcement).
 */
import { z } from "zod";

import type { Plan } from "./records";

export const MiB = 1024 * 1024;
export const GiB = 1024 * MiB;

export const ASSET_KINDS = ["image", "audio", "pdf", "video", "attachment"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Buckets that hold uploaded files: PDFs are originals, everything else is an asset. */
export const ASSET_BUCKETS = ["originals", "assets"] as const;
export type AssetBucket = (typeof ASSET_BUCKETS)[number];

export const MAX_UPLOAD_BYTES: Record<AssetKind, number> = {
  pdf: 300 * MiB,
  image: 50 * MiB,
  audio: 500 * MiB,
  video: 1 * GiB,
  attachment: 100 * MiB,
};

interface UploadType {
  kind: AssetKind;
  extensions: readonly string[];
  /** Other names browsers use for the same format. */
  aliases?: readonly string[];
}

/** The allowlist. Keys are the canonical MIME types stored on assets and signed into uploads. */
export const UPLOAD_TYPES = {
  "application/pdf": { kind: "pdf", extensions: ["pdf"] },
  "image/jpeg": { kind: "image", extensions: ["jpg", "jpeg"], aliases: ["image/pjpeg"] },
  "image/png": { kind: "image", extensions: ["png"] },
  "image/webp": { kind: "image", extensions: ["webp"] },
  "image/heic": { kind: "image", extensions: ["heic", "heif"], aliases: ["image/heif"] },
  "image/gif": { kind: "image", extensions: ["gif"] },
  "audio/webm": { kind: "audio", extensions: ["weba"] },
  "audio/ogg": { kind: "audio", extensions: ["ogg", "oga", "opus"], aliases: ["audio/opus"] },
  "audio/mpeg": { kind: "audio", extensions: ["mp3"], aliases: ["audio/mp3"] },
  "audio/mp4": { kind: "audio", extensions: ["m4a"], aliases: ["audio/x-m4a", "audio/aac"] },
  "audio/wav": { kind: "audio", extensions: ["wav"], aliases: ["audio/x-wav", "audio/wave"] },
  "video/mp4": { kind: "video", extensions: ["mp4", "m4v"] },
  "video/webm": { kind: "video", extensions: ["webm"] },
  "application/zip": {
    kind: "attachment",
    extensions: ["zip"],
    aliases: ["application/x-zip-compressed"],
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    kind: "attachment",
    extensions: ["docx"],
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    kind: "attachment",
    extensions: ["xlsx"],
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    kind: "attachment",
    extensions: ["pptx"],
  },
} as const satisfies Record<string, UploadType>;

export type UploadMime = keyof typeof UPLOAD_TYPES;
export const uploadMimeSchema = z.enum(Object.keys(UPLOAD_TYPES) as [UploadMime, ...UploadMime[]]);

export const uploadKind = (mime: UploadMime): AssetKind => UPLOAD_TYPES[mime].kind;
export const uploadBucket = (mime: UploadMime): AssetBucket =>
  uploadKind(mime) === "pdf" ? "originals" : "assets";

/**
 * The canonical type for a file, from what the browser reports and the file name. Browsers
 * disagree (HEIC is often blank on Windows, m4a is `audio/x-m4a` in some), so aliases and the
 * extension decide when the reported type is not canonical. Null when the file is not allowed.
 */
export function resolveUploadMime(fileName: string, reported: string): UploadMime | null {
  const type = reported.toLowerCase().split(";")[0]?.trim() ?? "";
  const entries = Object.entries(UPLOAD_TYPES) as [UploadMime, UploadType][];
  for (const [mime, spec] of entries) {
    if (type === mime || spec.aliases?.includes(type)) return mime;
  }
  const extension = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (!extension || (type !== "" && type !== "application/octet-stream")) return null;
  return entries.find(([, spec]) => spec.extensions.includes(extension))?.[0] ?? null;
}

/** Storage quota per plan (section 28). Team and Education match Pro until billing defines seats. */
export const PLAN_STORAGE_BYTES: Record<Plan, number> = {
  free: 3 * GiB,
  pro: 100 * GiB,
  team: 100 * GiB,
  education: 100 * GiB,
};

// ---------------------------------------------------------------------------------------------
// splitting into parts

/** Files up to this size go up in one signed PUT that S3 checks against the SHA-256. */
export const SINGLE_UPLOAD_MAX_BYTES = 16 * MiB;
/** Larger files go up as S3 multipart uploads in parts of this size (the last may be smaller). */
export const PART_SIZE_BYTES = 8 * MiB;

export type UploadPlan =
  { mode: "single" } | { mode: "multipart"; partSize: number; partCount: number };

export function planUpload(size: number): UploadPlan {
  if (size <= SINGLE_UPLOAD_MAX_BYTES) return { mode: "single" };
  return {
    mode: "multipart",
    partSize: PART_SIZE_BYTES,
    partCount: Math.ceil(size / PART_SIZE_BYTES),
  };
}

/** Byte range [start, end) and size of a 1-based part. */
export function partRange(size: number, partSize: number, partNumber: number) {
  const start = (partNumber - 1) * partSize;
  const end = Math.min(start + partSize, size);
  return { start, end, size: end - start };
}

// ---------------------------------------------------------------------------------------------
// API

export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, "expected a hex SHA-256");
const id = z.uuid();

export const uploadInitRequestSchema = z.strictObject({
  workspaceId: id,
  documentId: id.nullable().default(null),
  fileName: z.string().trim().min(1).max(255),
  contentType: uploadMimeSchema,
  size: z.int().positive(),
  sha256: sha256HexSchema,
});
export type UploadInitRequest = z.input<typeof uploadInitRequestSchema>;

export const signedRequestSchema = z.strictObject({
  url: z.url(),
  method: z.enum(["PUT", "GET"]),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});
export type SignedRequestView = z.infer<typeof signedRequestSchema>;

export const ASSET_STATUSES = ["verifying", "ready", "rejected"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** What the API returns about an asset. */
export const assetViewSchema = z.strictObject({
  id,
  workspaceId: id,
  documentId: id.nullable(),
  kind: z.enum(ASSET_KINDS),
  fileName: z.string(),
  mime: z.string(),
  bytes: z.int().nonnegative(),
  sha256: sha256HexSchema,
  status: z.enum(ASSET_STATUSES),
  rejectedReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AssetView = z.infer<typeof assetViewSchema>;

export const partUrlSchema = z.strictObject({
  partNumber: z.int().positive(),
  request: signedRequestSchema,
});

// A plain union: two of the shapes share `status: "upload"` and differ by `mode`.
export const uploadInitResponseSchema = z.union([
  /** The workspace already has this file: no upload needed. */
  z.strictObject({ status: z.literal("exists"), asset: assetViewSchema }),
  z.strictObject({
    status: z.literal("upload"),
    uploadId: id,
    mode: z.literal("single"),
    request: signedRequestSchema,
  }),
  z.strictObject({
    status: z.literal("upload"),
    uploadId: id,
    mode: z.literal("multipart"),
    partSize: z.int().positive(),
    partCount: z.int().positive(),
    /** Parts S3 already holds, when resuming an earlier upload of the same file. */
    completedParts: z.array(z.int().positive()),
    parts: z.array(partUrlSchema),
  }),
]);
export type UploadInitResponse = z.infer<typeof uploadInitResponseSchema>;

export const uploadPartsRequestSchema = z.strictObject({
  partNumbers: z.array(z.int().positive().max(10_000)).min(1).max(1_000),
});
export const uploadPartsResponseSchema = z.strictObject({ parts: z.array(partUrlSchema) });

export const uploadCompleteResponseSchema = z.strictObject({ asset: assetViewSchema });

export const assetUrlResponseSchema = z.strictObject({
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
