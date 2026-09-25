import { libraryQueryFromParams } from "@pc/schema";

import { json, requireActor, route } from "@/lib/server/api";
import { getRepositories } from "@/lib/server/clients";
import { libraryPageView } from "@/lib/server/views";

export const dynamic = "force-dynamic";

/**
 * One page of a library view (SPEC.md section 5). The query string carries the scope, sort,
 * filters and cursor (libraryQueryToParams in @pc/schema), the same parameters as the page URL.
 */
export const GET = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const query = libraryQueryFromParams(new URL(request.url).searchParams);
  return json(libraryPageView(await getRepositories().library.query(ctx, query)));
});
