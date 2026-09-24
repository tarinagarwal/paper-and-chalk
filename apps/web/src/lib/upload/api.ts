import {
  assetViewSchema,
  uploadCompleteResponseSchema,
  uploadInitResponseSchema,
  uploadPartsResponseSchema,
  type AssetView,
} from "@pc/schema";
import { z } from "zod";

import { TransferError, type UploadApi } from "./engine";

const errorBody = z.object({ error: z.string(), message: z.string() }).partial();

async function call<S extends z.ZodType>(
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: string },
  schema: S | null,
): Promise<z.output<S> | null> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
    });
  } catch {
    throw new TransferError(0, "Connection lost");
  }
  if (!response.ok) {
    const body = errorBody.safeParse(await response.json().catch(() => ({})));
    throw new TransferError(
      response.status,
      body.data?.message ?? `Request failed (${String(response.status)})`,
      body.data?.error ?? null,
    );
  }
  return schema ? schema.parse(await response.json()) : null;
}

/** The upload API (app/api/uploads, app/api/assets), with every response checked. */
export const uploadApi: UploadApi = {
  async init(input) {
    const result = await call(
      "/api/uploads/init",
      { method: "POST", body: JSON.stringify(input) },
      uploadInitResponseSchema,
    );
    if (!result) throw new TransferError(500, "Empty response");
    return result;
  },
  async partUrls(uploadId, partNumbers) {
    const result = await call(
      `/api/uploads/${uploadId}/parts`,
      { method: "POST", body: JSON.stringify({ partNumbers }) },
      uploadPartsResponseSchema,
    );
    return result?.parts ?? [];
  },
  async complete(uploadId) {
    const result = await call(
      `/api/uploads/${uploadId}/complete`,
      { method: "POST" },
      uploadCompleteResponseSchema,
    );
    if (!result) throw new TransferError(500, "Empty response");
    return result.asset;
  },
  async abort(uploadId) {
    await call(`/api/uploads/${uploadId}`, { method: "DELETE" }, null);
  },
  async asset(assetId): Promise<AssetView> {
    const result = await call(
      `/api/assets/${assetId}`,
      { method: "GET" },
      z.object({ asset: assetViewSchema }),
    );
    if (!result) throw new TransferError(500, "Empty response");
    return result.asset;
  },
};

/** A signed URL for a verified asset; `download` names the file when saved. */
export async function assetUrl(assetId: string, download = false): Promise<string> {
  const result = await call(
    `/api/assets/${assetId}/url${download ? "?download=1" : ""}`,
    { method: "GET" },
    z.object({ url: z.url(), expiresAt: z.string() }),
  );
  if (!result) throw new TransferError(500, "Empty response");
  return result.url;
}
