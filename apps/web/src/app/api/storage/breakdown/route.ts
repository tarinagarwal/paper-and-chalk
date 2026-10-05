import { storageBreakdown, typedCollections } from "@pc/db";
import type { StorageBreakdown } from "@pc/schema";

import { ApiError, json, requireActor, route } from "@/lib/server/api";
import { getMongo } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** Where the signed-in user's storage goes (the meter's details): files in and out of documents. */
export const GET = route(async (request: Request) => {
  const ctx = await requireActor(request);
  if (ctx.actor.kind !== "user") throw new ApiError(401, "unauthorized", "Sign in to continue.");
  const breakdown = await storageBreakdown(typedCollections(getMongo().db), ctx.actor.userId);
  return json(breakdown satisfies StorageBreakdown);
});
