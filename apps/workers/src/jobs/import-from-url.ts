import { newId } from "@pc/db";
import {
  MAX_UPLOAD_BYTES,
  uploadBucket,
  uploadKind,
  type ImportedFile,
  type ImportFromUrlJob,
} from "@pc/schema";
import { SNIFF_BYTES, sniffImportType, StreamTooLargeError } from "@pc/storage";

import { FetchRefusedError } from "../fetch-url";
import { JobRefusedError } from "../run-job";
import type { JobContext } from "./types";

/** The first bytes of a stream (to see what it is), then the whole stream again. */
async function peek(body: AsyncIterable<Uint8Array>, bytes: number) {
  const iterator = body[Symbol.asyncIterator]();
  const head: Uint8Array[] = [];
  let seen = 0;
  let done = false;
  while (seen < bytes) {
    const next = await iterator.next();
    if (next.done) {
      done = true;
      break;
    }
    head.push(next.value);
    seen += next.value.length;
  }
  const first = Buffer.concat(head);
  async function* replay() {
    if (first.length > 0) yield first;
    if (done) return;
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
      yield next.value;
    }
  }
  return { first, body: replay() };
}

const EXTENSIONS = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;

/**
 * Fetches a PDF or image from a web address into S3 as an asset of the workspace (the Import
 * tab's "from URL"). Its type comes from its first bytes, not from what the server claims.
 * Refusals (private address, wrong type, too large, HTTP errors) fail the job without retries.
 */
export async function importFromUrl(
  payload: ImportFromUrlJob,
  ctx: JobContext,
): Promise<ImportedFile> {
  const { fetchUrl, storage, files } = ctx.services;
  let fetched;
  try {
    fetched = await fetchUrl.fetch(payload.url);
  } catch (error) {
    if (error instanceof FetchRefusedError) throw new JobRefusedError(error.message);
    throw error;
  }
  const { first, body } = await peek(fetched.body, SNIFF_BYTES);
  const mime = sniffImportType(first);
  if (!mime) throw new JobRefusedError("That address is not a PDF or an image (JPG, PNG, WebP)");
  const maxBytes = MAX_UPLOAD_BYTES[uploadKind(mime)];
  if (fetched.declaredBytes !== null && fetched.declaredBytes > maxBytes) {
    throw new JobRefusedError(
      `The file is larger than ${String(Math.round(maxBytes / 1024 / 1024))} MB`,
    );
  }
  const assetId = newId();
  const bucket = uploadBucket(mime);
  const key = files.imports.keyFor(payload.workspaceId, assetId);
  let stored;
  try {
    stored = await storage.putStream({ bucket, key, contentType: mime, body, maxBytes });
  } catch (error) {
    if (error instanceof StreamTooLargeError) throw new JobRefusedError(error.message);
    throw error;
  }
  const base = fetched.fileName.replace(/\.[a-z0-9]{2,5}$/i, "");
  const fileName = `${base || "download"}.${EXTENSIONS[mime]}`;
  const { asset } = await files.imports.registerFetched({
    assetId,
    workspaceId: payload.workspaceId,
    userId: payload.userId,
    fileName,
    mime,
    bucket,
    key,
    bytes: stored.bytes,
    sha256: stored.sha256Hex,
  });
  return {
    assetId: asset._id,
    fileName: asset.fileName,
    kind: asset.kind === "pdf" ? "pdf" : "image",
    bytes: asset.bytes,
  };
}
