import { moveFolderSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { folderView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

/** Reorders or nests a folder: under `parentId`, just before `beforeId` (or last). */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    const { parentId, beforeId } = await readJson(request, moveFolderSchema);
    const folder = await getRepositories().folders.move(ctx, (await params).id, parentId, beforeId);
    return json({ folder: folderView(folder) });
  },
);
