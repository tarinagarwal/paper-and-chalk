import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { isJobKind, jobPayloadSchemas, type JobKind } from "@pc/schema";

import { readTaskMeta } from "./cloud-tasks";
import { jobHandlers, type JobContext, type JobHandlers } from "./jobs";

const MAX_BODY_BYTES = 1024 * 1024;
const JOB_PATH = /^\/jobs\/([A-Za-z0-9_-]+)$/;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "request body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "body is not valid JSON");
  }
}

// K ties the schema lookup and the handler lookup to the same job kind.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
async function runJob<K extends JobKind>(
  kind: K,
  body: unknown,
  ctx: JobContext,
  handlers: JobHandlers,
): Promise<unknown> {
  const parsed = jobPayloadSchemas[kind].safeParse(body);
  if (!parsed.success) {
    throw new HttpError(400, "invalid job payload", parsed.error.issues);
  }
  const handler: JobHandlers[K] = handlers[kind];
  return handler(parsed.data, ctx);
}

function log(severity: "INFO" | "ERROR", message: string, fields: Record<string, unknown>) {
  // One JSON line per event; Cloud Logging picks up `severity` and `message`.
  const line = JSON.stringify({ severity, message, ...fields });
  if (severity === "ERROR") console.error(line);
  else console.info(line);
}

/**
 * Receives jobs as Cloud Tasks HTTP targets: POST /jobs/:kind with a JSON payload.
 * 2xx acknowledges the task; 5xx makes Cloud Tasks retry it. 4xx means the request itself is
 * wrong; the queue's max-attempts setting bounds how often those are retried.
 */
export function createWorkerServer(handlers: JobHandlers = jobHandlers): Server {
  return createServer((req, res) => {
    void handle(req, res, handlers);
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, handlers: JobHandlers) {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;

  try {
    if (path === "/health") {
      if (req.method !== "GET") throw new HttpError(405, "method not allowed");
      sendJson(res, 200, { ok: true, service: "workers" });
      return;
    }

    const kind = JOB_PATH.exec(path)?.[1];
    if (kind === undefined) throw new HttpError(404, "not found");
    if (req.method !== "POST") throw new HttpError(405, "method not allowed");
    if (!isJobKind(kind)) throw new HttpError(404, `unknown job kind "${kind}"`);

    const body = await readJson(req);
    const task = readTaskMeta(req.headers);
    const startedAt = performance.now();
    const result = await runJob(kind, body, { task }, handlers);
    log("INFO", "job done", {
      kind,
      task: task.taskName,
      attempt: task.retryCount + 1,
      ms: Math.round(performance.now() - startedAt),
    });
    sendJson(res, 200, { ok: true, kind, result });
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(res, error.status, { ok: false, error: error.message, details: error.details });
      return;
    }
    log("ERROR", "job failed", {
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(res, 500, { ok: false, error: "job failed" });
  }
}
