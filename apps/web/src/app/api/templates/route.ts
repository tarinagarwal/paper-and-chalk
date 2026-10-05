import { systemTemplateViews, templateView } from "@pc/db";

import { json, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

/** The Templates tab: the system gallery and the user's own templates. */
export const GET = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const mine = await getRepositories().templates.list(ctx);
  return json({ system: systemTemplateViews(), mine: mine.map(templateView) });
});
