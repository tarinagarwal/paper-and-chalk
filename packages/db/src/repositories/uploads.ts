/**
 * Uploads straight from the browser to S3 (SPEC.md sections 2, 6, 27). The server never sees the
 * bytes: `init` checks permission, type, size and quota and returns signed URLs (or an existing
 * asset with the same SHA-256), `complete` checks what landed in S3 and creates the asset, and a
 * worker then verifies the file's real type (see verification.ts).
 */
import {
  assetRecordSchema,
  MAX_UPLOAD_BYTES,
  partRange,
  planUpload,
  uploadBucket,
  uploadInitRequestSchema,
  uploadKind,
  uploadRecordSchema,
  type AssetRecord,
  type UploadInitRequest,
  type UploadRecord,
} from "@pc/schema";
import type { SignedRequest, Storage } from "@pc/storage";
import { MongoServerError } from "mongodb";

import { InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { withTransaction } from "../transaction";
import { authorize, requireUser, type RepoContext } from "./context";
import { chargeStorage, quotaExceeded, storageAccount } from "./quota";

/** S3 aborts unfinished multipart uploads after a day, so an upload can be resumed for a day. */
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export type UploadInitResult =
  | { status: "exists"; asset: AssetRecord }
  | { status: "upload"; upload: UploadRecord; mode: "single"; request: SignedRequest }
  | {
      status: "upload";
      upload: UploadRecord;
      mode: "multipart";
      partSize: number;
      partCount: number;
      completedParts: number[];
      parts: { partNumber: number; request: SignedRequest }[];
    };

const base64OfHex = (hex: string) => Buffer.from(hex, "hex").toString("base64");

const notFound = () => new InvalidRequestError("upload_not_found", "That upload does not exist");

export function uploadsRepository(r: RepoContext, storage: Storage) {
  const { c } = r;

  /** Uploading needs `createContent` on the workspace, or `edit` on the document it belongs to. */
  async function authorizeTarget(
    ctx: AccessContext,
    target: { workspaceId: string; documentId: string | null },
  ) {
    if (target.documentId) {
      await authorize(r, ctx, { type: "document", documentId: target.documentId }, "edit");
      const document = await c.documents.findOne({ _id: target.documentId });
      if (document?.workspaceId !== target.workspaceId) {
        throw new InvalidRequestError("wrong_document", "That document is not in this workspace");
      }
    } else {
      await authorize(
        r,
        ctx,
        { type: "workspace", workspaceId: target.workspaceId },
        "createContent",
      );
    }
  }

  async function pendingUpload(ctx: AccessContext, uploadId: string): Promise<UploadRecord> {
    const user = requireUser(ctx);
    const upload = await c.uploads.findOne({
      _id: uploadId,
      createdBy: user.userId,
      status: "pending",
      expiresAt: { $gt: r.now() },
    });
    if (!upload) throw notFound();
    return upload;
  }

  function signParts(upload: UploadRecord, partNumbers: readonly number[]) {
    const { multipartUploadId, partSize, partCount } = upload;
    if (!multipartUploadId || !partSize || !partCount) {
      throw new InvalidRequestError("not_multipart", "This upload is a single request");
    }
    return Promise.all(
      partNumbers.map(async (partNumber) => {
        if (partNumber > partCount) {
          throw new InvalidRequestError("bad_part", `This upload has ${String(partCount)} parts`);
        }
        const request = await storage.presignPart({
          bucket: upload.bucket,
          key: upload.key,
          uploadId: multipartUploadId,
          partNumber,
          size: partRange(upload.bytes, partSize, partNumber).size,
        });
        return { partNumber, request };
      }),
    );
  }

  async function signFor(upload: UploadRecord): Promise<UploadInitResult> {
    if (!upload.multipartUploadId || !upload.partSize || !upload.partCount) {
      const request = await storage.presignUpload({
        bucket: upload.bucket,
        key: upload.key,
        contentType: upload.mime,
        size: upload.bytes,
        sha256Hex: upload.sha256,
      });
      return { status: "upload", upload, mode: "single", request };
    }
    const done = await storage.listParts({
      bucket: upload.bucket,
      key: upload.key,
      uploadId: upload.multipartUploadId,
    });
    const completedParts = done
      .filter((p) => p.size === partRange(upload.bytes, upload.partSize ?? 0, p.partNumber).size)
      .map((p) => p.partNumber);
    const pending = Array.from({ length: upload.partCount }, (_, i) => i + 1).filter(
      (n) => !completedParts.includes(n),
    );
    return {
      status: "upload",
      upload,
      mode: "multipart",
      partSize: upload.partSize,
      partCount: upload.partCount,
      completedParts,
      parts: await signParts(upload, pending),
    };
  }

  /** Marks the upload finished without an asset, deleting whatever reached S3. */
  async function discard(upload: UploadRecord) {
    await storage.remove(upload.bucket, upload.key);
    await c.uploads.updateOne(
      { _id: upload._id },
      { $set: { status: "aborted", updatedAt: r.now() } },
    );
  }

  return {
    async init(ctx: AccessContext, raw: UploadInitRequest): Promise<UploadInitResult> {
      const user = requireUser(ctx);
      const input = uploadInitRequestSchema.parse(raw);
      const kind = uploadKind(input.contentType);
      if (input.size > MAX_UPLOAD_BYTES[kind]) {
        const limit = Math.round(MAX_UPLOAD_BYTES[kind] / (1024 * 1024));
        throw new InvalidRequestError(
          "file_too_large",
          `${kind} files can be up to ${String(limit)} MB`,
        );
      }
      await authorizeTarget(ctx, input);
      const workspace = await c.workspaces.findOne({ _id: input.workspaceId });
      if (!workspace) throw new InvalidRequestError("not_found", "Workspace not found");

      // The workspace already has this file: reuse it.
      const existing = await c.assets.findOne({
        workspaceId: input.workspaceId,
        sha256: input.sha256,
        status: { $in: ["verifying", "ready"] },
      });
      if (existing) return { status: "exists", asset: existing };

      const account = await storageAccount(c, workspace.ownerId);
      if (account.usedBytes + input.size > account.limitBytes) throw quotaExceeded();

      // The same person picking the same file again resumes where they left off.
      const resumable = await c.uploads.findOne({
        workspaceId: input.workspaceId,
        createdBy: user.userId,
        sha256: input.sha256,
        status: "pending",
        bytes: input.size,
        mime: input.contentType,
        expiresAt: { $gt: r.now() },
      });
      if (resumable) return signFor(resumable);

      const now = r.now();
      const id = newId();
      const bucket = uploadBucket(input.contentType);
      const key = storage.key("ws", input.workspaceId, id);
      const plan = planUpload(input.size);
      const multipartUploadId =
        plan.mode === "multipart"
          ? await storage.startMultipart({ bucket, key, contentType: input.contentType })
          : null;
      const upload = uploadRecordSchema.parse({
        _id: id,
        workspaceId: input.workspaceId,
        documentId: input.documentId,
        createdBy: user.userId,
        chargedTo: workspace.ownerId,
        fileName: input.fileName,
        mime: input.contentType,
        bytes: input.size,
        sha256: input.sha256,
        bucket,
        key,
        multipartUploadId,
        partSize: plan.mode === "multipart" ? plan.partSize : null,
        partCount: plan.mode === "multipart" ? plan.partCount : null,
        status: "pending",
        expiresAt: new Date(now.getTime() + UPLOAD_TTL_MS),
        createdAt: now,
        updatedAt: now,
      });
      await c.uploads.insertOne(upload);
      return signFor(upload);
    },

    /** Fresh signed URLs for parts, e.g. after a long pause let the first ones expire. */
    async partUrls(ctx: AccessContext, uploadId: string, partNumbers: readonly number[]) {
      const upload = await pendingUpload(ctx, uploadId);
      await authorizeTarget(ctx, upload);
      return signParts(upload, [...new Set(partNumbers)]);
    },

    /**
     * Checks what reached S3 (every part, the exact size, the checksum for single PUTs), charges
     * the quota and creates the asset. Returns `created: false` when the same file was finished
     * by someone else in the meantime; the caller only enqueues verification for new assets.
     */
    async complete(
      ctx: AccessContext,
      uploadId: string,
    ): Promise<{ asset: AssetRecord; created: boolean }> {
      const upload = await pendingUpload(ctx, uploadId);
      await authorizeTarget(ctx, upload);

      if (upload.multipartUploadId && upload.partSize && upload.partCount) {
        const { partSize, partCount } = upload;
        const parts = await storage.listParts({
          bucket: upload.bucket,
          key: upload.key,
          uploadId: upload.multipartUploadId,
        });
        const complete =
          parts.length === partCount &&
          parts.every(
            (p) =>
              p.partNumber <= partCount &&
              p.size === partRange(upload.bytes, partSize, p.partNumber).size,
          );
        if (!complete) {
          throw new InvalidRequestError("upload_incomplete", "Some parts have not been uploaded");
        }
        await storage.completeMultipart({
          bucket: upload.bucket,
          key: upload.key,
          uploadId: upload.multipartUploadId,
          parts,
        });
      }

      const info = await storage.head(upload.bucket, upload.key);
      if (!info) throw new InvalidRequestError("upload_missing", "The file has not been uploaded");
      if (info.size !== upload.bytes) {
        await discard(upload);
        throw new InvalidRequestError("size_mismatch", "The uploaded file has the wrong size");
      }
      const single = upload.multipartUploadId === null;
      if (single && info.checksumSha256 !== base64OfHex(upload.sha256)) {
        await discard(upload);
        throw new InvalidRequestError(
          "checksum_mismatch",
          "The uploaded file is not the one hashed",
        );
      }

      const now = r.now();
      const asset = assetRecordSchema.parse({
        _id: upload._id,
        workspaceId: upload.workspaceId,
        documentId: upload.documentId,
        kind: uploadKind(upload.mime),
        bucket: upload.bucket,
        key: upload.key,
        fileName: upload.fileName,
        bytes: upload.bytes,
        mime: upload.mime,
        sha256: upload.sha256,
        sha256Verified: single,
        status: "verifying",
        rejectedReason: null,
        createdBy: upload.createdBy,
        chargedTo: upload.chargedTo,
        createdAt: now,
        updatedAt: now,
      });
      try {
        await withTransaction(r.conn.client, async (session) => {
          await chargeStorage(c, upload.chargedTo, upload.bytes, session);
          await c.assets.insertOne(asset, { session });
          await c.uploads.updateOne(
            { _id: upload._id },
            { $set: { status: "completed", updatedAt: now } },
            { session },
          );
        });
        return { asset, created: true };
      } catch (error) {
        const duplicate = error instanceof MongoServerError && error.code === 11000;
        const twin = duplicate
          ? await c.assets.findOne({
              workspaceId: upload.workspaceId,
              sha256: upload.sha256,
              status: { $in: ["verifying", "ready"] },
            })
          : null;
        // Nothing was charged: the transaction rolled back. Drop this copy either way.
        await discard(upload);
        if (twin) return { asset: twin, created: false };
        throw error;
      }
    },

    /** Cancels an upload and removes whatever reached S3. */
    async abort(ctx: AccessContext, uploadId: string): Promise<void> {
      const upload = await pendingUpload(ctx, uploadId);
      if (upload.multipartUploadId) {
        await storage.abortMultipart({
          bucket: upload.bucket,
          key: upload.key,
          uploadId: upload.multipartUploadId,
        });
      }
      await discard(upload);
    },
  };
}
