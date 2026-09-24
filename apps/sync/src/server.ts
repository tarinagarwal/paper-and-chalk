import type { ServerResponse } from "node:http";

import { Server } from "@hocuspocus/server";
import type { SyncIdentity } from "@pc/schema";
import { SyncTokenError, verifySyncToken } from "@pc/sync-token";

export interface SyncServerOptions {
  port: number;
  /** Shared with the web app, which signs the tokens (SYNC_JWT_SECRET). */
  syncJwtSecret: string;
  /** Stop on SIGINT/SIGTERM. Off in tests. */
  stopOnSignals?: boolean;
}

/** Per-connection context available to later hooks. */
export interface SyncContext {
  user: SyncIdentity;
}

const startedAt = Date.now();

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function log(severity: "INFO" | "WARNING", message: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ severity, message, ...fields });
  if (severity === "WARNING") console.warn(line);
  else console.info(line);
}

/**
 * Hocuspocus (Yjs) server. Every connection must present a sync token from the web app
 * (GET /api/sync-token). Persistence, permissions and the Redis extension come in later steps.
 */
export function createSyncServer({
  port,
  syncJwtSecret,
  stopOnSignals = true,
}: SyncServerOptions): Server<SyncContext> {
  return new Server<SyncContext>({
    name: "paper-chalk-sync",
    port,
    stopOnSignals,
    quiet: true,

    async onAuthenticate({ token, documentName, socketId }): Promise<SyncContext> {
      try {
        const user = await verifySyncToken(token, syncJwtSecret);
        return { user };
      } catch (error) {
        const reason = error instanceof SyncTokenError ? error.reason : "invalid";
        log("WARNING", "sync auth rejected", { reason, documentName, socketId });
        // Hocuspocus closes the connection with an "unauthorized" message.
        throw new Error(`unauthorized: ${reason}`, { cause: error });
      }
    },

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
