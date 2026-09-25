import { json, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** Copies a document: same folder, or the user's personal workspace if they can't add there. */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    const copy = await getRepositories().documents.duplicate(ctx, (await params).id);
    return json({ id: copy._id, workspaceId: copy.workspaceId, title: copy.title }, 201);
  },
);
