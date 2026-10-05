import { templateView } from "@pc/db";
import { saveTemplateSchema } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** Saves the document's setup (pages, paper, cover colour) to "My templates". */
export const POST = route(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const ctx = await requireActor(request);
    const { name } = await readJson(request, saveTemplateSchema);
    const template = await getRepositories().templates.saveFromDocument(
      ctx,
      (await params).id,
      name,
    );
    return json({ template: templateView(template) }, 201);
  },
);
