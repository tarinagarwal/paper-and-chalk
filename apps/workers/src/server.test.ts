import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { jobHandlers, type JobHandlers } from "./jobs";
import { createWorkerServer } from "./server";

async function start(handlers: JobHandlers): Promise<{ server: Server; base: string }> {
  const server = createWorkerServer(handlers);
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

  beforeAll(async () => {
    ({ server, base } = await start(jobHandlers));
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

  it("returns 500 so Cloud Tasks retries when a handler throws", async () => {
    const failing = await start({ ping: () => Promise.reject(new Error("boom")) });
    try {
      const res = await post(failing.base, "/jobs/ping", { message: "x" });
      expect(res.status).toBe(500);
    } finally {
      await stop(failing.server);
    }
  });
});
