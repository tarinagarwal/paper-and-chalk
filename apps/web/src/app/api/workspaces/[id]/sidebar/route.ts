import { json, requireActor, route } from "@/lib/server/api";
import { workspaceSidebar } from "@/lib/server/library";

export const dynamic = "force-dynamic";

/** Folders, tags and the user's smart folders in one workspace. */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    return json(await workspaceSidebar(ctx, (await params).id));
  },
);
