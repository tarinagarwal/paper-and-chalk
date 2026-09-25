import { createFolderSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { folderView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const input = await readJson(request, createFolderSchema);
  return json({ folder: folderView(await getRepositories().folders.create(ctx, input)) }, 201);
});
