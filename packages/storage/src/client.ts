import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { Bucket, StorageConfig } from "./config";

/** Signed read URLs live 15 minutes (SPEC.md section 27). */
export const READ_URL_TTL_SECONDS = 15 * 60;
/** Signed upload URLs live an hour; a paused upload asks for fresh part URLs. */
export const UPLOAD_URL_TTL_SECONDS = 60 * 60;

/** A signed request the browser makes as-is: these exact headers, nothing else signed. */
export interface SignedRequest {
  url: string;
  method: "PUT" | "GET";
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectInfo {
  size: number;
  contentType: string | null;
  etag: string | null;
  /** Base64 SHA-256 when the object was uploaded in one PUT with a checksum. */
  checksumSha256: string | null;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size: number;
}

const hexToBase64 = (hex: string) => Buffer.from(hex, "hex").toString("base64");

const isNotFound = (error: unknown) =>
  error instanceof S3ServiceException &&
  (error.$metadata.httpStatusCode === 404 ||
    error.name === "NotFound" ||
    error.name === "NoSuchKey");

/**
 * The only way the apps talk to S3. Keys are full object keys; build new ones with `key()` so
 * the environment's prefix is applied.
 */
export function createStorage(config: StorageConfig) {
  const s3 = new S3Client({
    region: config.region,
    ...(config.credentials ? { credentials: config.credentials } : {}),
    // Only send checksums an operation requires. The SDK default adds CRC32 headers that a
    // browser following a presigned URL would not send, which breaks the signature.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const name = (bucket: Bucket) => config.buckets[bucket];
  const prefix = config.keyPrefix ?? "";

  /** Only these headers are signed; the browser must send exactly them. */
  const signOptions = (
    ttlSeconds: number,
    headers: Record<string, string>,
    keep: string[] = [],
  ) => ({
    expiresIn: ttlSeconds,
    signableHeaders: new Set(Object.keys(headers)),
    unhoistableHeaders: new Set(keep),
  });

  /** Browsers set Content-Length themselves (it is still signed, so a wrong size fails). */
  const signedRequest = (
    url: string,
    method: SignedRequest["method"],
    headers: Record<string, string>,
    ttlSeconds: number,
  ): SignedRequest => ({
    url,
    method,
    headers: Object.fromEntries(Object.entries(headers).filter(([h]) => h !== "content-length")),
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  });

  return {
    s3,
    config,

    /** A new object key under this environment's prefix, e.g. `key("ws", id, sha)`. */
    key: (...segments: string[]) => `${prefix}${segments.join("/")}`,

    async bucketExists(bucket: Bucket): Promise<boolean> {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: name(bucket) }));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },

    /**
     * A single signed PUT bound to the content type, the exact size and the SHA-256 of the
     * bytes: S3 rejects anything else. The browser sends `headers` with the file as the body.
     */
    async presignUpload(input: {
      bucket: Bucket;
      key: string;
      contentType: string;
      size: number;
      sha256Hex: string;
    }): Promise<SignedRequest> {
      const checksum = hexToBase64(input.sha256Hex);
      const headers = {
        "content-type": input.contentType,
        "content-length": String(input.size),
        "x-amz-checksum-sha256": checksum,
      };
      const command = new PutObjectCommand({
        Bucket: name(input.bucket),
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.size,
        ChecksumSHA256: checksum,
      });
      const url = await getSignedUrl(
        s3,
        command,
        // The checksum must travel as a header for S3 to check the body against it.
        signOptions(UPLOAD_URL_TTL_SECONDS, headers, ["x-amz-checksum-sha256"]),
      );
      return signedRequest(url, "PUT", headers, UPLOAD_URL_TTL_SECONDS);
    },

    async startMultipart(input: {
      bucket: Bucket;
      key: string;
      contentType: string;
    }): Promise<string> {
      const result = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket: name(input.bucket),
          Key: input.key,
          ContentType: input.contentType,
        }),
      );
      if (!result.UploadId) throw new Error("S3 returned no upload id");
      return result.UploadId;
    },

    /** A signed PUT for one part, bound to that part's exact size. */
    async presignPart(input: {
      bucket: Bucket;
      key: string;
      uploadId: string;
      partNumber: number;
      size: number;
    }): Promise<SignedRequest> {
      const headers = { "content-length": String(input.size) };
      const command = new UploadPartCommand({
        Bucket: name(input.bucket),
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        ContentLength: input.size,
      });
      const url = await getSignedUrl(s3, command, signOptions(UPLOAD_URL_TTL_SECONDS, headers));
      return signedRequest(url, "PUT", headers, UPLOAD_URL_TTL_SECONDS);
    },

    /** Parts S3 already holds for a multipart upload (to resume, and to finish it). */
    async listParts(input: {
      bucket: Bucket;
      key: string;
      uploadId: string;
    }): Promise<UploadedPart[]> {
      const parts: UploadedPart[] = [];
      let marker: string | undefined;
      for (;;) {
        const page = await s3.send(
          new ListPartsCommand({
            Bucket: name(input.bucket),
            Key: input.key,
            UploadId: input.uploadId,
            PartNumberMarker: marker,
          }),
        );
        for (const part of page.Parts ?? []) {
          if (part.PartNumber && part.ETag) {
            parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size ?? 0 });
          }
        }
        if (!page.IsTruncated) return parts;
        marker = page.NextPartNumberMarker;
      }
    },

    async completeMultipart(input: {
      bucket: Bucket;
      key: string;
      uploadId: string;
      parts: readonly UploadedPart[];
    }): Promise<void> {
      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: name(input.bucket),
          Key: input.key,
          UploadId: input.uploadId,
          MultipartUpload: {
            Parts: [...input.parts]
              .sort((a, b) => a.partNumber - b.partNumber)
              .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
          },
        }),
      );
    },

    async abortMultipart(input: { bucket: Bucket; key: string; uploadId: string }): Promise<void> {
      try {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: name(input.bucket),
            Key: input.key,
            UploadId: input.uploadId,
          }),
        );
      } catch (error) {
        // Already finished or aborted: nothing left to clean up.
        if (!isNotFound(error)) throw error;
      }
    },

    /** Object metadata, or null when it does not exist. */
    async head(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
      try {
        const result = await s3.send(
          new HeadObjectCommand({ Bucket: name(bucket), Key: key, ChecksumMode: "ENABLED" }),
        );
        return {
          size: result.ContentLength ?? 0,
          contentType: result.ContentType ?? null,
          etag: result.ETag ?? null,
          checksumSha256: result.ChecksumSHA256 ?? null,
        };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    /** A 15-minute signed GET. `fileName` makes browsers save it under that name. */
    async presignRead(input: {
      bucket: Bucket;
      key: string;
      fileName?: string;
      download?: boolean;
    }): Promise<SignedRequest> {
      const disposition = input.fileName
        ? `${input.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(input.fileName)}`
        : undefined;
      const command = new GetObjectCommand({
        Bucket: name(input.bucket),
        Key: input.key,
        ...(disposition ? { ResponseContentDisposition: disposition } : {}),
      });
      const url = await getSignedUrl(s3, command, signOptions(READ_URL_TTL_SECONDS, {}));
      return signedRequest(url, "GET", {}, READ_URL_TTL_SECONDS);
    },

    /** The first bytes of an object (magic-byte checks). */
    async readStart(bucket: Bucket, key: string, bytes: number): Promise<Uint8Array> {
      const result = await s3.send(
        new GetObjectCommand({
          Bucket: name(bucket),
          Key: key,
          Range: `bytes=0-${String(bytes - 1)}`,
        }),
      );
      if (!result.Body) return new Uint8Array();
      return result.Body.transformToByteArray();
    },

    /** Streams the whole object through SHA-256 and returns the hex digest. */
    async sha256Hex(bucket: Bucket, key: string): Promise<string> {
      const result = await s3.send(new GetObjectCommand({ Bucket: name(bucket), Key: key }));
      const hash = createHash("sha256");
      // In Node the body is a Readable; stream it rather than loading the file into memory.
      if (result.Body instanceof Readable) {
        for await (const chunk of result.Body as AsyncIterable<Buffer>) hash.update(chunk);
      } else if (result.Body) {
        hash.update(await result.Body.transformToByteArray());
      }
      return hash.digest("hex");
    },

    async remove(bucket: Bucket, key: string): Promise<void> {
      await s3.send(new DeleteObjectCommand({ Bucket: name(bucket), Key: key }));
    },

    async copy(
      from: { bucket: Bucket; key: string },
      to: { bucket: Bucket; key: string },
    ): Promise<void> {
      await s3.send(
        new CopyObjectCommand({
          Bucket: name(to.bucket),
          Key: to.key,
          CopySource: `${name(from.bucket)}/${encodeURIComponent(from.key)}`,
        }),
      );
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
