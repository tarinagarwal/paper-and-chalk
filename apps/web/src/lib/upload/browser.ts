/** The browser implementations of the engine's dependencies. */
import type { SignedRequestView } from "@pc/schema";

import { uploadApi } from "./api";
import { TransferError, type UploadDeps } from "./engine";
import type { HashMessage } from "./hash.worker";

const aborted = () => new DOMException("The upload was stopped", "AbortError");

/** Hashes in a Web Worker so the page stays responsive on large files. */
function hash(file: Blob, onProgress: (bytes: number) => void, signal: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(aborted());
      return;
    }
    const worker = new Worker(new URL("./hash.worker.ts", import.meta.url), { type: "module" });
    const stop = () => {
      worker.terminate();
      reject(aborted());
    };
    signal.addEventListener("abort", stop, { once: true });
    worker.onmessage = (event: MessageEvent<HashMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress(message.bytes);
        return;
      }
      signal.removeEventListener("abort", stop);
      worker.terminate();
      if (message.type === "done") resolve(message.sha256);
      else reject(new Error(message.message));
    };
    worker.postMessage({ file });
  });
}

/** XHR rather than fetch: only XHR reports upload progress. */
function send(
  request: SignedRequestView,
  body: Blob,
  onProgress: (loaded: number) => void,
  signal: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(aborted());
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open(request.method, request.url);
    // Exactly the signed headers: S3 checks them against the signature.
    for (const [name, value] of Object.entries(request.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(new TransferError(xhr.status, `Storage refused the upload (${String(xhr.status)})`));
    };
    xhr.onerror = () => {
      reject(new TransferError(0, "Connection lost"));
    };
    xhr.onabort = () => {
      reject(aborted());
    };
    signal.addEventListener(
      "abort",
      () => {
        xhr.abort();
      },
      { once: true },
    );
    xhr.send(body);
  });
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(aborted());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(aborted());
      },
      { once: true },
    );
  });
}

export const browserUploadDeps: UploadDeps = { api: uploadApi, hash, send, sleep };
