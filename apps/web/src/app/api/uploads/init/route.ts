import { uploadInitRequestSchema } from "@pc/schema";

import { rateLimits } from "@/lib/rate-limit";
import { enforceLimit, json, readJson, requireActor, route } from "@/lib/server/api";
import { getFiles } from "@/lib/server/clients";
import { uploadInitView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

/**
 * Starts an upload (SPEC.md section 6). The browser sends the file's name, type, size and
 * SHA-256; the answer is an existing asset with the same bytes, or signed S3 URLs to upload to.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  if (ctx.actor.kind === "user") await enforceLimit(rateLimits.uploadInitPerUser, ctx.actor.userId);
  const input = await readJson(request, uploadInitRequestSchema);
  return json(uploadInitView(await getFiles().uploads.init(ctx, input)));
});
