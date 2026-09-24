import { uploadPartsRequestSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getFiles } from "@/lib/server/clients";
import { signedView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

/** Fresh signed URLs for some parts of a multipart upload (after a pause let them expire). */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    const { partNumbers } = await readJson(request, uploadPartsRequestSchema);
    const parts = await getFiles().uploads.partUrls(ctx, (await params).id, partNumbers);
    return json({
      parts: parts.map((p) => ({ partNumber: p.partNumber, request: signedView(p.request) })),
    });
  },
);
