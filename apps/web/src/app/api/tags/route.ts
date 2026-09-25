import { createTagSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { tagView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const input = await readJson(request, createTagSchema);
  return json({ tag: tagView(await getRepositories().tags.create(ctx, input)) }, 201);
});
