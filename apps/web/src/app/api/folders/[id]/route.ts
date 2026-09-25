import { updateFolderSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { folderView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/** Name, colour or icon. */
export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireActor(request);
  const input = await readJson(request, updateFolderSchema);
  const folder = await getRepositories().folders.update(ctx, (await params).id, input);
  return json({ folder: folderView(folder) });
});

/** Moves the folder, its subfolders and their documents to the trash. */
export const DELETE = route(async (request: Request, { params }: Params) => {
  const ctx = await requireActor(request);
  return json(await getRepositories().folders.trash(ctx, (await params).id));
});
