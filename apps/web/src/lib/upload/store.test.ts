import { MAX_UPLOAD_BYTES } from "@pc/schema";
import { describe, expect, it } from "vitest";

import type { UploadDeps } from "./engine";
import { createUploadStore, FILE_CONCURRENCY } from "./store";

/** Uploads that finish only when released, so the queue can be observed. */
function blockingDeps() {
  const waiting: (() => void)[] = [];
  const deps: UploadDeps = {
    api: {
      init: () =>
        Promise.resolve({
          status: "upload",
          uploadId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a61",
          mode: "single",
          request: {
            url: "https://s3.example/x",
            method: "PUT",
            headers: {},
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }),
      partUrls: () => Promise.resolve([]),
      complete: () =>
        Promise.resolve({
          id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
          workspaceId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c",
          documentId: null,
          kind: "pdf",
          fileName: "a.pdf",
          mime: "application/pdf",
          bytes: 3,
          sha256: "c".repeat(64),
          status: "ready",
          rejectedReason: null,
          createdAt: new Date().toISOString(),
        }),
      abort: () => Promise.resolve(),
      asset: () => Promise.reject(new Error("not polled for ready assets")),
    },
    hash: () => Promise.resolve("c".repeat(64)),
    send: () =>
      new Promise<void>((resolve) => {
        waiting.push(resolve);
      }),
    sleep: () => Promise.resolve(),
  };
  return { deps, release: () => waiting.shift()?.() };
}

const pdf = (name: string) => new File(["pdf"], name, { type: "application/pdf" });
const target = { workspaceId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c" };
const tick = () => new Promise((r) => setTimeout(r, 5));

describe("upload store", () => {
  it("refuses unsupported, empty and oversized files before hashing anything", () => {
    const store = createUploadStore(blockingDeps().deps);
    const huge = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(huge, "size", { value: MAX_UPLOAD_BYTES.pdf + 1 });
    store
      .getState()
      .add(
        [
          new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }),
          new File([], "empty.pdf", { type: "application/pdf" }),
          huge,
        ],
        target,
      );
    expect(store.getState().items.map((i) => [i.state, i.error])).toEqual([
      ["failed", "This type of file can't be uploaded."],
      ["failed", "This file is empty."],
      ["failed", "Too large: the limit is 300 MB."],
    ]);
  });

  it(`runs ${String(FILE_CONCURRENCY)} uploads at a time and starts the next when one finishes`, async () => {
    const { deps, release } = blockingDeps();
    const store = createUploadStore(deps);
    store.getState().add([pdf("1.pdf"), pdf("2.pdf"), pdf("3.pdf")], target);
    await tick();
    const states = () => store.getState().items.map((i) => i.state);
    expect(states()).toEqual(["uploading", "uploading", "queued"]);

    release();
    await tick();
    expect(states()).toEqual(["done", "uploading", "uploading"]);
  });

  it("dismisses only finished uploads", async () => {
    const { deps, release } = blockingDeps();
    const store = createUploadStore(deps);
    const [id = ""] = store.getState().add([pdf("1.pdf")], target);
    await tick();
    store.getState().dismiss(id);
    expect(store.getState().items).toHaveLength(1);
    release();
    await tick();
    store.getState().dismiss(id);
    expect(store.getState().items).toHaveLength(0);
  });
});
