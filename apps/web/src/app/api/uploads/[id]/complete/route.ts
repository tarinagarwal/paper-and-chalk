import { json, requireActor, route } from "@/lib/server/api";
import { getFiles } from "@/lib/server/clients";
import { enqueueJob } from "@/lib/server/jobs";
import { assetView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

/** Finishes an upload: checks what reached S3, creates the asset and queues its verification. */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    const { asset, created } = await getFiles().uploads.complete(ctx, (await params).id);
    if (created) await enqueueJob("verifyAsset", { assetId: asset._id });
    return json({ asset: assetView(asset) }, created ? 201 : 200);
  },
);
