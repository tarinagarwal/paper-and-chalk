import "server-only";

import { AccessDeniedError, InvalidRequestError, type AccessContext } from "@pc/db";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";

import { getAuth } from "@/lib/auth";
import type { RateLimitRule } from "@/lib/rate-limit";
import { hitLimit } from "@/lib/server/limits";
import { log } from "@/lib/server/log";
import { needsDisplayName } from "@/lib/user";

/** An error a route answers with directly. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** HTTP status for repository error codes; anything unlisted is a 400. */
const STATUS: Record<string, number> = {
  not_found: 404,
  upload_not_found: 404,
  file_too_large: 413,
  quota_exceeded: 413,
  upload_incomplete: 409,
  upload_missing: 409,
  asset_not_ready: 409,
  asset_rejected: 410,
  size_mismatch: 422,
  checksum_mismatch: 422,
};

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return json({ error: error.code, message: error.message }, error.status, error.headers);
  }
  if (error instanceof AccessDeniedError) {
    // Not found and not shared look the same, so ids cannot be probed.
    const status = error.reason === "not_found" || error.reason === "no_access" ? 404 : 403;
    return json({ error: error.reason, message: error.message }, status);
  }
  if (error instanceof InvalidRequestError) {
    return json({ error: error.code, message: error.message }, STATUS[error.code] ?? 400);
  }
  if (error instanceof ZodError) {
    return json(
      { error: "invalid_request", message: "The request is not valid.", issues: error.issues },
      400,
    );
  }
  log("ERROR", "api route failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return json({ error: "internal", message: "Something went wrong. Try again." }, 500);
}

/** Wraps a route handler so thrown errors become JSON responses with the right status. */
export function route<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/**
 * The signed-in user as a repository actor. Routes re-check the session themselves (the proxy is
 * only the first line), and users without a display name are held at the name dialog.
 */
export async function requireActor(request: Request): Promise<AccessContext> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new ApiError(401, "unauthorized", "Sign in to continue.");
  if (needsDisplayName(session.user)) {
    throw new ApiError(403, "profile_incomplete", "Choose a display name first.");
  }
  return { actor: { kind: "user", userId: session.user.id, email: session.user.email } };
}

export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
  return schema.parse(body);
}

/** Throws 429 with Retry-After when the subject is over the limit. */
export async function enforceLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const result = await hitLimit(rule, subject);
  if (!result.allowed) {
    const minutes = Math.ceil(result.retryAfterSeconds / 60);
    throw new ApiError(
      429,
      "rate_limited",
      `Too many requests. Try again in ${String(minutes)} minute${minutes === 1 ? "" : "s"}.`,
      { "Retry-After": String(result.retryAfterSeconds) },
    );
  }
}
