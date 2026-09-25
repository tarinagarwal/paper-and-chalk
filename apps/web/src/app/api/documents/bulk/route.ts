import {
  AccessDeniedError,
  InvalidRequestError,
  type AccessContext,
  type PurgeFailure,
} from "@pc/db";
import { bulkActionSchema, type BulkAction, type BulkResult } from "@pc/schema";

import { json, readJson, requireActor, route } from "@/lib/server/api";
import { getFiles, getRepositories } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

type OneByOne = Exclude<BulkAction, { action: "purge" }>;

/** One document's part of a bulk action, through the repositories (each checks `can()`). */
function runOne(ctx: AccessContext, action: OneByOne, id: string): Promise<void> {
  const documents = getRepositories().documents;
  switch (action.action) {
    case "move":
      return documents.move(ctx, id, action.folderId);
    case "addTag":
      return documents.changeTags(ctx, id, { add: [action.tagId] });
    case "removeTag":
      return documents.changeTags(ctx, id, { remove: [action.tagId] });
    case "trash":
      return documents.trash(ctx, id);
    case "restore":
      return documents.restore(ctx, id);
    case "favourite":
      return documents.setFavourite(ctx, id, action.on);
  }
}

/** A few at a time: quick for hundreds of documents without flooding the database. */
const CONCURRENCY = 8;

/**
 * Applies one action to many documents: move, tag, trash, restore, delete forever, favourite.
 * Each document is checked on its own; the answer lists which ones worked and why the others did
 * not, so the browser keeps its optimistic update for the rest.
 */
export const POST = route(async (request: Request) => {
  const ctx = await requireActor(request);
  const action = await readJson(request, bulkActionSchema);
  const ids = [...new Set(action.ids)];

  if (action.action === "purge") {
    const result = await getFiles().trash.purge(ctx, ids);
    return json({ done: result.done, failed: result.failed } satisfies BulkResult);
  }

  const done: string[] = [];
  const failed: PurgeFailure[] = [];
  let next = 0;
  async function worker() {
    for (let id = ids[next++]; id !== undefined; id = ids[next++]) {
      try {
        await runOne(ctx, action as OneByOne, id);
        done.push(id);
      } catch (error) {
        if (error instanceof AccessDeniedError) {
          failed.push({ id, error: error.reason, message: error.message });
        } else if (error instanceof InvalidRequestError) {
          failed.push({ id, error: error.code, message: error.message });
        } else {
          throw error;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  return json({ done, failed } satisfies BulkResult);
});
