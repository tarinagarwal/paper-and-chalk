import { createHash, randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createFileRepositories, createRepositories, typedCollections } from "@pc/db";
import { closeTestDb, openTestDb } from "@pc/db/testing";
import { testStorage } from "@pc/storage/testing";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { jobHandlers, type JobHandlers, type WorkerServices } from "./jobs";
import { createWorkerServer } from "./server";

type JobCall = [string, string, ...unknown[]];

/** Services that only record job bookkeeping calls. */
function fakeServices(calls: JobCall[] = []): WorkerServices {
  return {
    files: {
      verification: { verify: () => Promise.resolve({ status: "skipped", reason: "not_found" }) },
    },
    jobs: {
      start: (id) => {
        calls.push(["start", id]);
        return Promise.resolve();
      },
      succeed: (id, output) => {
        calls.push(["succeed", id, output]);
        return Promise.resolve();
      },
      fail: (id, error) => {
        calls.push(["fail", id, error]);
        return Promise.resolve();
      },
    },
  };
}

async function start(
  services: WorkerServices,
  handlers: JobHandlers = jobHandlers,
): Promise<{ server: Server; base: string }> {
  const server = createWorkerServer({ services, handlers });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function stop(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("workers server", () => {
  let server: Server;
  let base: string;
  const calls: JobCall[] = [];

  beforeAll(async () => {
    ({ server, base } = await start(fakeServices(calls)));
  });

  afterAll(async () => {
    await stop(server);
  });

  it("answers GET /health", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "workers" });
  });

  it("runs the ping job and reads Cloud Tasks headers", async () => {
    const res = await post(
      base,
      "/jobs/ping",
      { message: "hello" },
      { "X-CloudTasks-TaskName": "t-1", "X-CloudTasks-TaskRetryCount": "2" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; result: { pong: string; attempt: number } };
    expect(body.ok).toBe(true);
    expect(body.result.pong).toBe("hello");
    expect(body.result.attempt).toBe(3);
  });

  it("records the job's start and result when the request names a job", async () => {
    calls.length = 0;
    const res = await post(base, "/jobs/ping", { message: "hi" }, { "X-PC-Job-Id": "job-1" });
    expect(res.status).toBe(200);
    expect(calls.map(([step, id]) => [step, id])).toEqual([
      ["start", "job-1"],
      ["succeed", "job-1"],
    ]);
  });

  it("rejects an invalid payload with 400", async () => {
    const res = await post(base, "/jobs/ping", { message: "" });
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await post(base, "/jobs/ping", "{not json");
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown job kind", async () => {
    const res = await post(base, "/jobs/nope", {});
    expect(res.status).toBe(404);
  });

  it("returns 405 for GET on a job route", async () => {
    const res = await fetch(`${base}/jobs/ping`);
    expect(res.status).toBe(405);
  });

  it("returns 500 so the queue retries when a handler throws, and records the failure", async () => {
    const failed: JobCall[] = [];
    const failing = await start(fakeServices(failed), {
      ...jobHandlers,
      ping: () => Promise.reject(new Error("boom")),
    });
    try {
      const res = await post(failing.base, "/jobs/ping", { message: "x" }, { "X-PC-Job-Id": "j" });
      expect(res.status).toBe(500);
      expect(failed.at(-1)).toEqual(["fail", "j", "boom"]);
    } finally {
      await stop(failing.server);
    }
  });
});

describe("verifyAsset job", () => {
  it("marks a real uploaded file ready and records the job", async () => {
    const conn = await openTestDb("workers");
    const storage = testStorage();
    const files = createFileRepositories(conn, storage);
    const repos = createRepositories(conn);
    const owner = new ObjectId();
    await typedCollections(conn.db).users.insertOne({
      _id: owner,
      name: "Owner",
      email: "owner@example.com",
      emailVerified: true,
      plan: "free",
      storageUsedBytes: 0,
      settings: "{}",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const ctx = { actor: { kind: "user", userId: owner.toHexString(), email: "o@e.x" } } as const;
    const workspace = await repos.workspaces.create(ctx, { name: "Worker test" });

    const bytes = new Uint8Array([...new TextEncoder().encode("%PDF-1.7\n"), ...randomBytes(500)]);
    const init = await files.uploads.init(ctx, {
      workspaceId: workspace._id,
      fileName: "a.pdf",
      contentType: "application/pdf",
      size: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (init.status !== "upload" || init.mode !== "single") throw new Error("expected an upload");
    const put = await fetch(init.request.url, {
      method: "PUT",
      headers: init.request.headers,
      body: bytes,
    });
    expect(put.status).toBe(200);
    const { asset } = await files.uploads.complete(ctx, init.upload._id);
    const job = await repos.jobs.create("verifyAsset", { assetId: asset._id });

    const worker = await start({ files, jobs: repos.jobs });
    try {
      const res = await post(
        worker.base,
        "/jobs/verifyAsset",
        { assetId: asset._id },
        {
          "X-PC-Job-Id": job._id,
        },
      );
      expect(await res.json()).toMatchObject({ ok: true, result: { status: "ready" } });
      expect((await typedCollections(conn.db).assets.findOne({ _id: asset._id }))?.status).toBe(
        "ready",
      );
      expect(await repos.jobs.get(job._id)).toMatchObject({ status: "succeeded", attempts: 1 });
    } finally {
      await stop(worker.server);
      await storage.remove(asset.bucket, asset.key);
      await closeTestDb(conn);
    }
  });
});
