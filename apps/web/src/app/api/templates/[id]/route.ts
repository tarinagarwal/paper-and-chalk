import { saveTemplateSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export const PATCH = route(async (request: Request, { params }: Params) => {
  const ctx = await requireActor(request);
  const { name } = await readJson(request, saveTemplateSchema);
  await getRepositories().templates.rename(ctx, (await params).id, name);
  return json({ ok: true });
});

export const DELETE = route(async (request: Request, { params }: Params) => {
  const ctx = await requireActor(request);
  await getRepositories().templates.delete(ctx, (await params).id);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
