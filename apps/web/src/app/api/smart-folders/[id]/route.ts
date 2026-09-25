import { updateSmartFolderSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { smartFolderView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireActor(request);
  const input = await readJson(request, updateSmartFolderSchema);
  const smart = await getRepositories().smartFolders.update(ctx, (await params).id, input);
  return json({ smartFolder: smartFolderView(smart) });
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const ctx = await requireActor(request);
  await getRepositories().smartFolders.delete(ctx, (await params).id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
