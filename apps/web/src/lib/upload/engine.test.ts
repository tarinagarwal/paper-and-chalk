import type {
  AssetView,
  SignedRequestView,
  UploadInitRequest,
  UploadInitResponse,
} from "@pc/schema";
import { describe, expect, it } from "vitest";

import {
  backoffMs,
  MAX_ATTEMPTS,
  TransferError,
  UploadTask,
  type UploadApi,
  type UploadDeps,
  type UploadSnapshot,
} from "./engine";

const SHA = "c".repeat(64);
const later = () => new Date(Date.now() + 3_600_000).toISOString();
const signed = (label: string, expiresAt = later()): SignedRequestView => ({
  url: `https://s3.example/${label}`,
  method: "PUT",
  headers: {},
  expiresAt,
});
const asset = (status: AssetView["status"], extra: Partial<AssetView> = {}): AssetView => ({
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
  workspaceId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c",
  documentId: null,
  kind: "pdf",
  fileName: "notes.pdf",
  mime: "application/pdf",
  bytes: 25,
  sha256: SHA,
  status,
  rejectedReason: null,
  createdAt: new Date().toISOString(),
  ...extra,
});

const aborted = () => new DOMException("stopped", "AbortError");

/** A scripted API and transport that records what the engine did. */
function harness(options: {
  init: UploadInitResponse | UploadInitResponse[];
  send?: (request: SignedRequestView, body: Blob, signal: AbortSignal) => Promise<void>;
  statuses?: AssetView["status"][];
  rejectedReason?: string;
}) {
  const inits = Array.isArray(options.init) ? [...options.init] : [options.init];
  const calls = {
    init: [] as UploadInitRequest[],
    sent: [] as { url: string; body: string }[],
    partUrls: [] as number[][],
    completed: [] as string[],
    aborted: [] as string[],
    sleeps: [] as number[],
  };
  const statuses = [...(options.statuses ?? ["ready"])];
  const api: UploadApi = {
    init: (input) => {
      calls.init.push(input);
      const next = inits.length > 1 ? inits.shift() : inits[0];
      if (!next) throw new Error("no init scripted");
      return Promise.resolve(next);
    },
    partUrls: (_id, partNumbers) => {
      calls.partUrls.push(partNumbers);
      return Promise.resolve(
        partNumbers.map((partNumber) => ({
          partNumber,
          request: signed(`fresh-${String(partNumber)}`),
        })),
      );
    },
    complete: (uploadId) => {
      calls.completed.push(uploadId);
      return Promise.resolve(asset("verifying"));
    },
    abort: (uploadId) => {
      calls.aborted.push(uploadId);
      return Promise.resolve();
    },
    asset: () =>
      Promise.resolve(
        asset(statuses.shift() ?? "ready", { rejectedReason: options.rejectedReason ?? null }),
      ),
  };
  const deps: UploadDeps = {
    api,
    hash: (file, onProgress) => {
      onProgress(file.size / 2);
      return Promise.resolve(SHA);
    },
    send: async (request, body, onProgress, signal) => {
      await (options.send?.(request, body, signal) ?? Promise.resolve());
      calls.sent.push({ url: request.url, body: await body.text() });
      onProgress(body.size);
    },
    sleep: (ms, signal) => {
      calls.sleeps.push(ms);
      return signal.aborted ? Promise.reject(aborted()) : Promise.resolve();
    },
    random: () => 0.5,
  };
  const states: UploadSnapshot[] = [];
  const file = new File(["abcdefghijklmnopqrstuvwxy"], "notes.pdf", { type: "application/pdf" });
  const task = new UploadTask(
    file,
    "application/pdf",
    { workspaceId: asset("ready").workspaceId },
    deps,
    (s) => states.push(s),
    "u1",
  );
  return { task, calls, states };
}

const multipart = (completedParts: number[] = [], expiresAt = later()): UploadInitResponse => ({
  status: "upload",
  uploadId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a60",
  mode: "multipart",
  partSize: 10,
  partCount: 3,
  completedParts,
  parts: [1, 2, 3]
    .filter((n) => !completedParts.includes(n))
    .map((partNumber) => ({
      partNumber,
      request: signed(`part-${String(partNumber)}`, expiresAt),
    })),
});

const SINGLE_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a61";
const single: UploadInitResponse = {
  status: "upload",
  uploadId: SINGLE_ID,
  mode: "single",
  request: signed("single"),
};

describe("UploadTask", () => {
  it("skips the upload when the workspace already has the file", async () => {
    const { task, calls } = harness({ init: { status: "exists", asset: asset("ready") } });
    await task.start();
    expect(task.current).toMatchObject({ state: "done", duplicate: true, uploadedBytes: 25 });
    expect(calls.sent).toEqual([]);
    expect(calls.init[0]).toMatchObject({ sha256: SHA, size: 25, contentType: "application/pdf" });
  });

  it("uploads in one request, completes and waits for verification", async () => {
    const { task, calls, states } = harness({ init: single, statuses: ["verifying", "ready"] });
    await task.start();
    expect(calls.sent).toEqual([
      { url: "https://s3.example/single", body: "abcdefghijklmnopqrstuvwxy" },
    ]);
    expect(calls.completed).toEqual([SINGLE_ID]);
    expect(task.current).toMatchObject({ state: "done", asset: { status: "ready" } });
    expect(states.map((s) => s.state)).toEqual(
      expect.arrayContaining([
        "hashing",
        "starting",
        "uploading",
        "finishing",
        "verifying",
        "done",
      ]),
    );
    expect(states.find((s) => s.state === "hashing" && s.hashedBytes > 0)?.hashedBytes).toBe(12.5);
    // Polls back off: 500 ms, then 750 ms.
    expect(calls.sleeps).toEqual([500, 750]);
  });

  it("retries transient failures with backoff, then gives up after the last attempt", async () => {
    let failures = 2;
    const ok = harness({
      init: single,
      send: () =>
        failures-- > 0 ? Promise.reject(new TransferError(503, "busy")) : Promise.resolve(),
    });
    await ok.task.start();
    expect(ok.task.current.state).toBe("done");
    expect(ok.calls.sleeps.slice(0, 2)).toEqual([backoffMs(0, () => 0.5), backoffMs(1, () => 0.5)]);

    const down = harness({
      init: single,
      send: () => Promise.reject(new TransferError(0, "offline")),
    });
    await down.task.start();
    expect(down.task.current).toMatchObject({ state: "failed" });
    expect(down.task.current.error).toMatch(/Connection lost/);
    expect(down.calls.sleeps).toHaveLength(MAX_ATTEMPTS - 1);
  });

  it("does not retry a request the server refused on its merits", async () => {
    const { task, calls } = harness({
      init: single,
      send: () => Promise.reject(new TransferError(400, "Bad request")),
    });
    await task.start();
    expect(task.current).toMatchObject({ state: "failed", error: "Bad request" });
    expect(calls.sleeps).toEqual([]);
  });

  it("sends only the missing parts of a resumed multipart upload", async () => {
    const { task, calls, states } = harness({ init: multipart([1]) });
    await task.start();
    expect(calls.sent.map((s) => s.body).sort()).toEqual(["klmnopqrst", "uvwxy"]);
    expect(Math.max(...states.map((s) => s.uploadedBytes))).toBe(25);
    // Progress starts from the part S3 already had and never goes backwards.
    const uploading = states.filter((s) => s.state === "uploading").map((s) => s.uploadedBytes);
    const resumedAt = uploading.indexOf(10);
    expect(resumedAt).toBeGreaterThanOrEqual(0);
    expect(uploading.slice(resumedAt).every((b, i, all) => i === 0 || b >= (all[i - 1] ?? 0))).toBe(
      true,
    );
    expect(task.current.state).toBe("done");
  });

  it("asks for a fresh URL when a part's signature is refused or about to expire", async () => {
    let refused = false;
    const expired = harness({ init: multipart([], new Date(Date.now() - 1000).toISOString()) });
    await expired.task.start();
    expect(expired.calls.partUrls.flat().sort()).toEqual([1, 2, 3]);
    expect(expired.calls.sent.every((s) => s.url.includes("fresh"))).toBe(true);

    const forbidden = harness({
      init: multipart(),
      send: (request) => {
        if (request.url.endsWith("part-2") && !refused) {
          refused = true;
          return Promise.reject(new TransferError(403, "expired"));
        }
        return Promise.resolve();
      },
    });
    await forbidden.task.start();
    expect(forbidden.calls.partUrls).toEqual([[2]]);
    expect(forbidden.calls.sent.map((s) => s.url)).toContain("https://s3.example/fresh-2");
    expect(forbidden.task.current.state).toBe("done");
  });

  it("pauses without losing finished parts and resumes from the server's list", async () => {
    let release: (() => void) | null = null;
    const { task, calls } = harness({
      init: [multipart(), multipart([1, 2])],
      send: (request, _body, signal) =>
        request.url.endsWith("part-3") && !release
          ? new Promise<void>((_resolve, reject) => {
              release = () => undefined;
              signal.addEventListener("abort", () => {
                reject(aborted());
              });
            })
          : Promise.resolve(),
    });
    const running = task.start();
    await new Promise((r) => setTimeout(r, 10));
    task.pause();
    await running;
    expect(task.current.state).toBe("paused");

    await task.resume();
    expect(calls.init).toHaveLength(2);
    expect(calls.sent.filter((s) => s.url.endsWith("part-3"))).toHaveLength(1);
    expect(task.current.state).toBe("done");
  });

  it("cancels an upload and tells the server to drop it", async () => {
    const { task, calls } = harness({
      init: single,
      send: (_request, _body, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            reject(aborted());
          });
        }),
    });
    const running = task.start();
    await new Promise((r) => setTimeout(r, 10));
    await task.cancel();
    await running;
    expect(task.current.state).toBe("cancelled");
    expect(calls.aborted).toEqual([SINGLE_ID]);
  });

  it("reports a file the worker rejected", async () => {
    const { task } = harness({
      init: single,
      statuses: ["rejected"],
      rejectedReason: "type_mismatch",
    });
    await task.start();
    expect(task.current).toMatchObject({ state: "failed" });
    expect(task.current.error).toMatch(/don't match its type/);
  });
});

describe("backoffMs", () => {
  it("doubles from 500 ms, caps at 8 s, and adds jitter in the upper half", () => {
    expect(backoffMs(0, () => 0)).toBe(250);
    expect(backoffMs(0, () => 1)).toBe(500);
    expect(backoffMs(3, () => 1)).toBe(4000);
    expect(backoffMs(10, () => 1)).toBe(8000);
  });
});
