import type { JobView } from "@pc/schema";

import { ApiError, json, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** How a job the user started is going (URL imports). Other people's jobs do not exist. */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    if (ctx.actor.kind !== "user") throw new ApiError(401, "unauthorized", "Sign in to continue.");
    const job = await getRepositories().jobs.getForUser((await params).id, ctx.actor.userId);
    if (!job) throw new ApiError(404, "not_found", "That job does not exist.");
    const view: JobView = {
      id: job._id,
      kind: job.kind,
      status: job.status,
      output: job.output,
      error: job.error,
    };
    return json(view);
  },
);
