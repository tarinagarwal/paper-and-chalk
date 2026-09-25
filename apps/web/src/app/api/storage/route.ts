import { storageAccount, typedCollections } from "@pc/db";
import type { StorageView } from "@pc/schema";

import { ApiError, json, requireActor, route } from "@/lib/server/api";
import { getMongo } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** The signed-in user's storage use against their plan (the sidebar meter). */
export const GET = route(async (request: Request) => {
  const ctx = await requireActor(request);
  if (ctx.actor.kind !== "user") throw new ApiError(401, "unauthorized", "Sign in to continue.");
  const account = await storageAccount(typedCollections(getMongo().db), ctx.actor.userId);
  return json(account satisfies StorageView);
});
