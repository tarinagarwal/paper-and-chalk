import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Server } from "@hocuspocus/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createSyncServer } from "./server";

describe("sync server", () => {
  let server: Server;
  let httpUrl: string;
  let wsUrl: string;

  beforeAll(async () => {
    server = createSyncServer({ port: 0, stopOnSignals: false });
    await server.listen();
    httpUrl = `http://127.0.0.1:${server.address.port}`;
    wsUrl = `ws://127.0.0.1:${server.address.port}`;
  });

  afterAll(async () => {
    await server.destroy();
  });

  it("answers GET /health", async () => {
    const res = await fetch(`${httpUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body).toMatchObject({ ok: true, service: "sync" });
  });

  it("returns 404 for other paths", async () => {
    const res = await fetch(`${httpUrl}/nope`);
    expect(res.status).toBe(404);
  });

  it("syncs a Yjs document between two clients", async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = new HocuspocusProvider({ url: wsUrl, name: "test-doc", document: docA });
    const b = new HocuspocusProvider({ url: wsUrl, name: "test-doc", document: docB });

    try {
      const received = new Promise<string>((resolve) => {
        const map = docB.getMap<string>("m");
        map.observe(() => {
          const value = map.get("hello");
          if (value) resolve(value);
        });
      });
      docA.getMap<string>("m").set("hello", "world");
      await expect(received).resolves.toBe("world");
    } finally {
      a.destroy();
      b.destroy();
    }
  });
});
