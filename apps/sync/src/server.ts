import type { ServerResponse } from "node:http";

import { Server } from "@hocuspocus/server";

export interface SyncServerOptions {
  port: number;
  /** Stop on SIGINT/SIGTERM. Off in tests. */
  stopOnSignals?: boolean;
}

const startedAt = Date.now();

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

/**
 * Hocuspocus (Yjs) server. Auth, persistence and the Redis extension are added in later steps
 * (SPEC.md sections 3, 4 and 17).
 */
export function createSyncServer({ port, stopOnSignals = true }: SyncServerOptions): Server {
  return new Server({
    name: "paper-chalk-sync",
    port,
    stopOnSignals,
    quiet: true,

    // Plain HTTP requests (WebSocket upgrades never reach this hook).
    async onRequest({ request, response }) {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      if (path === "/health") {
        sendJson(response, 200, {
          ok: true,
          service: "sync",
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        });
      } else {
        sendJson(response, 404, { ok: false, error: "not found" });
      }
      // Hocuspocus convention: rejecting without an error stops its default response.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject();
    },
  });
}
