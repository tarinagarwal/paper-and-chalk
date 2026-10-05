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
import { SNIFF_BYTES } from "./file-types";

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

/** A streamed body went over its size limit; nothing was kept. */
export class StreamTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`The file is larger than ${String(Math.round(maxBytes / 1024 / 1024))} MB`);
    this.name = "StreamTooLargeError";
  }
}

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

    /**
     * Streams a body the server fetched (a URL import) into S3: one PUT when it fits in a part,
     * 8 MB parts otherwise. Hashes as it goes and keeps the first bytes for type checks. Throws
     * `StreamTooLargeError` (and leaves nothing behind) once `maxBytes` is passed.
     */
    async putStream(input: {
      bucket: Bucket;
      key: string;
      contentType: string;
      body: AsyncIterable<Uint8Array>;
      maxBytes: number;
    }): Promise<{ bytes: number; sha256Hex: string; head: Uint8Array }> {
      const PART = 8 * 1024 * 1024;
      const hash = createHash("sha256");
      const head: number[] = [];
      let bytes = 0;
      let buffered: Uint8Array[] = [];
      let bufferedBytes = 0;
      // Set by flush() once the stream outgrows one part (an object, so the closure's write is seen).
      const multipart: { uploadId: string | null } = { uploadId: null };
      const parts: UploadedPart[] = [];
      const target = { Bucket: name(input.bucket), Key: input.key };

      const flush = async () => {
        multipart.uploadId ??=
          (
            await s3.send(
              new CreateMultipartUploadCommand({ ...target, ContentType: input.contentType }),
            )
          ).UploadId ?? null;
        const uploadId = multipart.uploadId;
        if (!uploadId) throw new Error("S3 returned no upload id");
        const body = Buffer.concat(buffered);
        const partNumber = parts.length + 1;
        const result = await s3.send(
          new UploadPartCommand({
            ...target,
            UploadId: uploadId,
            PartNumber: partNumber,
            Body: body,
          }),
        );
        if (!result.ETag) throw new Error("S3 returned no part ETag");
        parts.push({ partNumber, etag: result.ETag, size: body.length });
        buffered = [];
        bufferedBytes = 0;
      };

      try {
        for await (const chunk of input.body) {
          bytes += chunk.length;
          if (bytes > input.maxBytes) throw new StreamTooLargeError(input.maxBytes);
          hash.update(chunk);
          for (let i = 0; head.length < SNIFF_BYTES && i < chunk.length; i++)
            head.push(chunk[i] ?? 0);
          buffered.push(chunk);
          bufferedBytes += chunk.length;
          if (bufferedBytes >= PART) await flush();
        }
        const uploadId = multipart.uploadId;
        if (uploadId === null) {
          await s3.send(
            new PutObjectCommand({
              ...target,
              ContentType: input.contentType,
              Body: Buffer.concat(buffered),
            }),
          );
        } else {
          if (bufferedBytes > 0) await flush();
          await s3.send(
            new CompleteMultipartUploadCommand({
              ...target,
              UploadId: uploadId,
              MultipartUpload: {
                Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
              },
            }),
          );
        }
      } catch (error) {
        if (multipart.uploadId !== null) {
          await s3
            .send(new AbortMultipartUploadCommand({ ...target, UploadId: multipart.uploadId }))
            .catch(() => undefined);
        }
        throw error;
      }
      return { bytes, sha256Hex: hash.digest("hex"), head: Uint8Array.from(head) };
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
