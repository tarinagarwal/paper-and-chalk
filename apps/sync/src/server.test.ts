import { HocuspocusProvider } from "@hocuspocus/provider";
import type { Server } from "@hocuspocus/server";
import { signSyncToken } from "@pc/sync-token";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

import { createSyncServer, type SyncContext } from "./server";

const secret = "s".repeat(40);
const maya = { userId: "u_maya", name: "Maya", avatar: null, color: "#3f7d4e" };
const jun = { userId: "u_jun", name: "Jun", avatar: null, color: "#7a3e8f" };

describe("sync server", () => {
  let server: Server<SyncContext>;
  let httpUrl: string;
  let wsUrl: string;

  beforeAll(async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    server = createSyncServer({ port: 0, syncJwtSecret: secret, stopOnSignals: false });
    await server.listen();
    httpUrl = `http://127.0.0.1:${server.address.port}`;
    wsUrl = `ws://127.0.0.1:${server.address.port}`;
  });

  afterAll(async () => {
    await server.destroy();
    vi.restoreAllMocks();
  });

  /** Connects and resolves with "authenticated" or the failure reason. */
  function connect(name: string, token: string, document = new Y.Doc()) {
    return new Promise<{ result: string; provider: HocuspocusProvider }>((resolve) => {
      const provider: HocuspocusProvider = new HocuspocusProvider({
        url: wsUrl,
        name,
        document,
        token,
        onAuthenticated: () => {
          resolve({ result: "authenticated", provider });
        },
        onAuthenticationFailed: ({ reason }) => {
          resolve({ result: `failed: ${reason}`, provider });
        },
      });
    });
  }

  it("answers GET /health", async () => {
    const res = await fetch(`${httpUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: "sync" });
  });

  it("returns 404 for other paths", async () => {
    expect((await fetch(`${httpUrl}/nope`)).status).toBe(404);
  });

  it("accepts a valid token and syncs a document between two users", async () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = await connect("doc-1", (await signSyncToken(maya, secret)).token, docA);
    const b = await connect("doc-1", (await signSyncToken(jun, secret)).token, docB);
    try {
      expect(a.result).toBe("authenticated");
      expect(b.result).toBe("authenticated");
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
      a.provider.destroy();
      b.provider.destroy();
    }
  });

  it("rejects an expired token", async () => {
    const { token } = await signSyncToken(maya, secret, {
      now: Math.floor(Date.now() / 1000) - 3600,
    });
    const { result, provider } = await connect("doc-2", token);
    provider.destroy();
    expect(result).toMatch(/^failed/);
  });

  it("rejects a token signed with another secret", async () => {
    const { token } = await signSyncToken(maya, "x".repeat(40));
    const { result, provider } = await connect("doc-3", token);
    provider.destroy();
    expect(result).toMatch(/^failed/);
  });

  it("rejects garbage and empty tokens", async () => {
    for (const token of ["not-a-jwt", ""]) {
      const { result, provider } = await connect("doc-4", token);
      provider.destroy();
      expect(result).toMatch(/^failed/);
    }
  });
});
