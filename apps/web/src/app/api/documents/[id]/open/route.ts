import { requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** Records that the user opened the document (Recents and the "last opened" sort). */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    await getRepositories().documents.recordOpen(ctx, (await params).id);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  },
);
