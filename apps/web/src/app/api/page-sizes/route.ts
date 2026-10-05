import { createPageSizePresetSchema, type PageSizePresetView } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

const view = (p: {
  _id: string;
  name: string;
  widthPt: number;
  heightPt: number;
  unit: PageSizePresetView["unit"];
}): PageSizePresetView => ({
  id: p._id,
  name: p.name,
  widthPt: p.widthPt,
  heightPt: p.heightPt,
  unit: p.unit,
});

/** The user's saved custom page sizes. */
export const GET = route(async (request: Request) => {
  const ctx = await requireActor(request);
  return json({ sizes: (await getRepositories().pageSizePresets.list(ctx)).map(view) });
});

export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const input = await readJson(request, createPageSizePresetSchema);
  return json({ size: view(await getRepositories().pageSizePresets.create(ctx, input)) }, 201);
});
