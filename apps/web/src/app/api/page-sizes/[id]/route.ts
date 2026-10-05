import { requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

export const DELETE = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    await getRepositories().pageSizePresets.delete(ctx, (await params).id);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  },
);
