import { renameDocumentSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** Renames a document (inline rename in the library). */
export const PATCH = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    const { title } = await readJson(request, renameDocumentSchema);
    const { id } = await params;
    await getRepositories().documents.rename(ctx, id, title);
    return json({ id, title });
  },
);
