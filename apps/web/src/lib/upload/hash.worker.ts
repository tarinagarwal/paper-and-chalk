/**
 * SHA-256 of a file, off the main thread. hash-wasm hashes incrementally, so a 1 GB video is read
 * in 8 MB slices instead of being loaded whole (WebCrypto can only hash a complete buffer).
 */
import { createSHA256 } from "hash-wasm";

export interface HashRequest {
  file: Blob;
}
export type HashMessage =
  | { type: "progress"; bytes: number }
  | { type: "done"; sha256: string }
  | { type: "error"; message: string };

const SLICE_BYTES = 8 * 1024 * 1024;

/** The worker global, typed by hand: the webworker lib clashes with the app's DOM types. */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HashRequest>) => void) | null;
  postMessage(message: HashMessage): void;
};

const post = (message: HashMessage) => {
  scope.postMessage(message);
};

async function hashFile(file: Blob): Promise<void> {
  try {
    const hasher = await createSHA256();
    hasher.init();
    for (let offset = 0; offset < file.size; offset += SLICE_BYTES) {
      const slice = file.slice(offset, Math.min(offset + SLICE_BYTES, file.size));
      hasher.update(new Uint8Array(await slice.arrayBuffer()));
      post({ type: "progress", bytes: Math.min(offset + SLICE_BYTES, file.size) });
    }
    post({ type: "done", sha256: hasher.digest("hex") });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : "Hashing failed" });
  }
}

scope.onmessage = (event) => {
  void hashFile(event.data.file);
};
