/**
 * The upload engine: one file from the browser to S3 (SPEC.md section 6). Framework-free and
 * driven through injected dependencies, so it runs the same in the app and in unit tests.
 *
 * hash (Web Worker) -> init (dedupe, or signed URLs) -> upload (one PUT, or parts 3 at a time,
 * each retried with backoff and re-signed when a URL expires) -> complete -> wait for the worker's
 * verification. Pause aborts the requests in flight; resume asks the server again, which answers
 * with the parts S3 already has, so nothing is sent twice.
 */
import {
  partRange,
  type AssetView,
  type SignedRequestView,
  type UploadInitRequest,
  type UploadInitResponse,
  type UploadMime,
} from "@pc/schema";

export type UploadState =
  | "queued"
  | "hashing"
  | "starting"
  | "uploading"
  | "paused"
  | "finishing"
  | "verifying"
  | "done"
  | "failed"
  | "cancelled";

export interface UploadSnapshot {
  id: string;
  fileName: string;
  size: number;
  /** Null for files refused before upload (unsupported type). */
  mime: UploadMime | null;
  state: UploadState;
  /** Bytes hashed and uploaded so far. */
  hashedBytes: number;
  uploadedBytes: number;
  /** A person-readable reason when `failed`. */
  error: string | null;
  asset: AssetView | null;
  /** The workspace already had this file, so nothing was uploaded. */
  duplicate: boolean;
}

/** An HTTP error from our API or from S3. */
export class TransferError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "TransferError";
  }
}

export interface UploadApi {
  init(input: UploadInitRequest): Promise<UploadInitResponse>;
  partUrls(
    uploadId: string,
    partNumbers: number[],
  ): Promise<{ partNumber: number; request: SignedRequestView }[]>;
  complete(uploadId: string): Promise<AssetView>;
  abort(uploadId: string): Promise<void>;
  asset(assetId: string): Promise<AssetView>;
}

export interface UploadDeps {
  api: UploadApi;
  hash(file: Blob, onProgress: (bytes: number) => void, signal: AbortSignal): Promise<string>;
  send(
    request: SignedRequestView,
    body: Blob,
    onProgress: (loaded: number) => void,
    signal: AbortSignal,
  ): Promise<void>;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface UploadTarget {
  workspaceId: string;
  documentId?: string | null;
}

/** Parts in flight at once. */
export const PART_CONCURRENCY = 3;
export const MAX_ATTEMPTS = 5;
/** Longest wait for the worker's verification before we stop watching. */
export const VERIFY_TIMEOUT_MS = 3 * 60 * 1000;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** Worth trying again: network trouble, throttling, server errors, or an expired signature. */
const retryable = (error: unknown) =>
  error instanceof TransferError
    ? error.status === 0 ||
      error.status === 403 ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500
    : !isAbort(error);

export function backoffMs(attempt: number, random = Math.random): number {
  const base = Math.min(8000, 500 * 2 ** attempt);
  return Math.round(base / 2 + (random() * base) / 2);
}

export class UploadTask {
  private snapshot: UploadSnapshot;
  private controller: AbortController | null = null;
  private sha256: string | null = null;
  private uploadId: string | null = null;
  private running: Promise<void> | null = null;
  private stopReason: "pause" | "cancel" | null = null;

  constructor(
    readonly file: File,
    readonly mime: UploadMime,
    private readonly target: UploadTarget,
    private readonly deps: UploadDeps,
    private readonly onChange: (snapshot: UploadSnapshot) => void,
    id: string,
  ) {
    this.snapshot = {
      id,
      fileName: file.name,
      size: file.size,
      mime,
      state: "queued",
      hashedBytes: 0,
      uploadedBytes: 0,
      error: null,
      asset: null,
      duplicate: false,
    };
  }

  get current(): UploadSnapshot {
    return this.snapshot;
  }

  /** Runs (or continues) the upload. Resolves when it finishes, fails, pauses or is cancelled. */
  start(): Promise<void> {
    if (this.running) return this.running;
    if (["done", "cancelled"].includes(this.snapshot.state)) return Promise.resolve();
    this.stopReason = null;
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  pause(): void {
    if (!["hashing", "starting", "uploading"].includes(this.snapshot.state)) return;
    this.stopReason = "pause";
    this.controller?.abort();
  }

  resume(): Promise<void> {
    return this.snapshot.state === "paused" ? this.start() : Promise.resolve();
  }

  retry(): Promise<void> {
    if (this.snapshot.state !== "failed") return Promise.resolve();
    this.update({ error: null });
    return this.start();
  }

  async cancel(): Promise<void> {
    if (["done", "cancelled"].includes(this.snapshot.state)) return;
    this.stopReason = "cancel";
    this.controller?.abort();
    await this.running?.catch(() => undefined);
    this.update({ state: "cancelled" });
    if (this.uploadId) await this.deps.api.abort(this.uploadId).catch(() => undefined);
  }

  private update(change: Partial<UploadSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change };
    this.onChange(this.snapshot);
  }

  private async run(): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    try {
      if (!this.sha256) {
        this.update({ state: "hashing" });
        this.sha256 = await this.deps.hash(
          this.file,
          (bytes) => {
            this.update({ hashedBytes: bytes });
          },
          signal,
        );
        this.update({ hashedBytes: this.file.size });
      }

      this.update({ state: "starting" });
      const init = await this.deps.api.init({
        workspaceId: this.target.workspaceId,
        documentId: this.target.documentId ?? null,
        fileName: this.file.name,
        contentType: this.mime,
        size: this.file.size,
        sha256: this.sha256,
      });
      signal.throwIfAborted();

      let asset: AssetView;
      if (init.status === "exists") {
        this.update({ duplicate: true, uploadedBytes: this.file.size });
        asset = init.asset;
      } else {
        this.uploadId = init.uploadId;
        this.update({ state: "uploading" });
        if (init.mode === "single") {
          await this.withRetry(signal, () =>
            this.deps.send(
              init.request,
              this.file,
              (loaded) => {
                this.update({ uploadedBytes: loaded });
              },
              signal,
            ),
          );
        } else {
          await this.sendParts(init, signal);
        }
        this.update({ state: "finishing", uploadedBytes: this.file.size });
        asset = await this.deps.api.complete(init.uploadId);
      }
      await this.waitForVerification(asset, signal);
    } catch (error) {
      if (this.stopReason === "pause" && isAbort(error)) {
        this.update({ state: "paused" });
      } else if (this.stopReason === "cancel") {
        // cancel() sets the final state.
      } else {
        this.update({ state: "failed", error: describe(error) });
      }
    } finally {
      this.controller = null;
    }
  }

  private async sendParts(
    init: Extract<UploadInitResponse, { mode: "multipart" }>,
    signal: AbortSignal,
  ): Promise<void> {
    const { uploadId, partSize, partCount } = init;
    const size = this.file.size;
    const urls = new Map(init.parts.map((p) => [p.partNumber, p.request]));
    const done = new Set(init.completedParts);
    const inFlight = new Map<number, number>();
    const report = () => {
      let bytes = 0;
      for (const n of done) bytes += partRange(size, partSize, n).size;
      for (const loaded of inFlight.values()) bytes += loaded;
      this.update({ uploadedBytes: Math.min(bytes, size) });
    };
    report();

    const queue = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !done.has(n));
    const sendPart = async (partNumber: number) => {
      const range = partRange(size, partSize, partNumber);
      const body = this.file.slice(range.start, range.end);
      await this.withRetry(
        signal,
        async () => {
          let request = urls.get(partNumber);
          if (
            !request ||
            Date.parse(request.expiresAt) - (this.deps.now?.() ?? Date.now()) < 60_000
          ) {
            request = await this.refresh(uploadId, partNumber, urls);
          }
          inFlight.set(partNumber, 0);
          await this.deps.send(
            request,
            body,
            (loaded) => {
              inFlight.set(partNumber, loaded);
              report();
            },
            signal,
          );
        },
        async (error) => {
          inFlight.delete(partNumber);
          report();
          // An expired or revoked signature: ask for a fresh URL before the next attempt.
          if (error instanceof TransferError && error.status === 403) {
            await this.refresh(uploadId, partNumber, urls);
          }
        },
      );
      inFlight.delete(partNumber);
      done.add(partNumber);
      report();
    };

    const workers = Array.from({ length: Math.min(PART_CONCURRENCY, queue.length) }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        signal.throwIfAborted();
        await sendPart(next);
      }
    });
    await Promise.all(workers);
  }

  private async refresh(
    uploadId: string,
    partNumber: number,
    urls: Map<number, SignedRequestView>,
  ): Promise<SignedRequestView> {
    const [fresh] = await this.deps.api.partUrls(uploadId, [partNumber]);
    if (!fresh) throw new TransferError(500, "The server did not sign the part");
    urls.set(partNumber, fresh.request);
    return fresh.request;
  }

  private async withRetry(
    signal: AbortSignal,
    attempt: () => Promise<void>,
    onError?: (error: unknown) => Promise<void>,
  ): Promise<void> {
    for (let n = 0; ; n++) {
      try {
        await attempt();
        return;
      } catch (error) {
        if (isAbort(error) || signal.aborted || !retryable(error) || n + 1 >= MAX_ATTEMPTS)
          throw error;
        await onError?.(error);
        await this.deps.sleep(backoffMs(n, this.deps.random), signal);
      }
    }
  }

  private async waitForVerification(asset: AssetView, signal: AbortSignal): Promise<void> {
    this.update({ state: "verifying", asset });
    const now = this.deps.now ?? Date.now;
    const deadline = now() + VERIFY_TIMEOUT_MS;
    let current = asset;
    for (
      let wait = 500;
      current.status === "verifying" && now() < deadline;
      wait = Math.min(wait * 1.5, 3000)
    ) {
      await this.deps.sleep(wait, signal);
      current = await this.deps.api.asset(current.id);
    }
    if (current.status === "rejected") {
      this.update({
        state: "failed",
        asset: current,
        error: rejectionMessage(current.rejectedReason),
      });
    } else {
      // Still verifying after the deadline: the upload itself is done; the file shows up later.
      this.update({ state: "done", asset: current });
    }
  }
}

export function rejectionMessage(reason: string | null): string {
  switch (reason) {
    case "type_mismatch":
      return "The file's contents don't match its type, so it was removed.";
    case "hash_mismatch":
      return "The file changed while uploading, so it was removed. Try again.";
    default:
      return "The file could not be verified, so it was removed.";
  }
}

function describe(error: unknown): string {
  if (error instanceof TransferError) {
    if (error.status === 0) return "Connection lost. Check your network and retry.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
