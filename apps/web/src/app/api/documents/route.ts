import { newDocumentSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/**
 * Creates a document from the New dialog (SPEC.md section 6): a notebook, an infinite canvas, an
 * import of uploaded files, or a document from a template. Answers with where to open it.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const input = await readJson(request, newDocumentSchema);
  const document = await getRepositories().creation.create(ctx, input);
  return json({ id: document._id, url: `/app/d/${document._id}` }, 201);
});
