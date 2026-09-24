import { requireActor, route } from "@/lib/server/api";
import { getFiles } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** Cancels an upload and removes whatever already reached S3. */
export const DELETE = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    await getFiles().uploads.abort(ctx, (await params).id);
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  },
);
