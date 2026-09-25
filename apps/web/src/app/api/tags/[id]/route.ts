import { updateTagSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { tagView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireActor(request);
  const input = await readJson(request, updateTagSchema);
  return json({ tag: tagView(await getRepositories().tags.update(ctx, (await params).id, input)) });
});

/** Deletes the tag and takes it off every document and smart folder. */
export const DELETE = route(async (request: Request, { params }: Params) => {
  const ctx = await requireActor(request);
  await getRepositories().tags.delete(ctx, (await params).id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
