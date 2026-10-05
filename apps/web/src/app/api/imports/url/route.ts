import { importUrlSchema } from "@pc/schema";

import { rateLimits } from "@/lib/rate-limit";
import { ApiError, enforceLimit, json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { enqueueJob } from "@/lib/server/jobs";

export const dynamic = "force-dynamic";

/**
 * Imports a PDF or image from a web address: a worker downloads it into S3 (refusing private
 * addresses) and records it like an upload. Answers with the job to poll.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  if (ctx.actor.kind !== "user") throw new ApiError(401, "unauthorized", "Sign in to continue.");
  await enforceLimit(rateLimits.uploadInitPerUser, ctx.actor.userId);
  const { workspaceId, url } = await readJson(request, importUrlSchema);
  await getRepositories().creation.assertCanCreate(ctx, workspaceId);
  const job = await enqueueJob("importFromUrl", { workspaceId, userId: ctx.actor.userId, url });
  return json({ jobId: job._id }, 202);
});
