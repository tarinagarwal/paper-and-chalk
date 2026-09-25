import { activeWorkspaceSchema } from "@pc/schema";

import { ACTIVE_WORKSPACE_COOKIE, PREFERENCE_COOKIE_MAX_AGE } from "@/lib/library/constants";
import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** Remembers which workspace the library shows (the user must belong to it). */
export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const { workspaceId } = await readJson(request, activeWorkspaceSchema);
  await getRepositories().workspaces.get(ctx, workspaceId);
  const response = json({ workspaceId });
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    maxAge: PREFERENCE_COOKIE_MAX_AGE,
  });
  return response;
});
