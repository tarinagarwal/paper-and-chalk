import { json, requireActor, route } from "@/lib/server/api";
import { getFiles } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/**
 * A 15-minute signed S3 URL for a verified file (SPEC.md section 27). `?download=1` asks the
 * browser to save it under its original name, and follows the download permission; `?document=`
 * reads a file through a document that uses it.
 */
export const GET = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    const search = new URL(request.url).searchParams;
    const download = search.get("download") === "1";
    // ?document= reads the file as part of that document (image pages, covers).
    const documentId = search.get("document");
    const signed = await getFiles().assets.readUrl(ctx, (await params).id, {
      download,
      documentId,
    });
    return json({ url: signed.url, expiresAt: signed.expiresAt.toISOString() });
  },
);
