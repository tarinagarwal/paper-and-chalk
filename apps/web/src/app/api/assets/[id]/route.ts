import { json, requireActor, route } from "@/lib/server/api";
import { getFiles } from "@/lib/server/clients";
import { assetView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

/** An asset's details, e.g. to see when verification has finished. */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    return json({ asset: assetView(await getFiles().assets.get(ctx, (await params).id)) });
  },
);
