import { createSmartFolderSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { smartFolderView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

/** Saves the current filter set as a smart folder (private to the user). */
export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const input = await readJson(request, createSmartFolderSchema);
  const smart = await getRepositories().smartFolders.create(ctx, input);
  return json({ smartFolder: smartFolderView(smart) }, 201);
});
