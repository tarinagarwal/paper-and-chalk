import {
  keyBetween,
  smartFolderRecordSchema,
  type LibraryFilters,
  type LibrarySort,
  type SmartFolderRecord,
  type SortDir,
} from "@pc/schema";

import { InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { authorize, requireUser, type RepoContext } from "./context";

/** Saved filter sets (smart folders). Private: only the user who saved one sees it. */
export function smartFoldersRepository(r: RepoContext) {
  const { c } = r;

  async function load(ctx: AccessContext, smartFolderId: string) {
    await authorize(r, ctx, { type: "smartFolder", smartFolderId }, "view");
    const smart = await c.smartFolders.findOne({ _id: smartFolderId });
    if (!smart) throw new InvalidRequestError("not_found", "Smart folder not found");
    return smart;
  }

  return {
    /** The user's smart folders in a workspace, in sidebar order. */
    async list(ctx: AccessContext, workspaceId: string): Promise<SmartFolderRecord[]> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      return c.smartFolders
        .find({ workspaceId, userId: user.userId })
        .sort({ orderKey: 1, _id: 1 })
        .toArray();
    },

    get: load,

    async create(
      ctx: AccessContext,
      input: {
        workspaceId: string;
        name: string;
        filters: LibraryFilters;
        sort: LibrarySort;
        dir: SortDir;
      },
    ): Promise<SmartFolderRecord> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "workspace", workspaceId: input.workspaceId }, "view");
      const last = await c.smartFolders
        .find({ workspaceId: input.workspaceId, userId: user.userId })
        .sort({ orderKey: -1, _id: -1 })
        .limit(1)
        .next();
      const now = r.now();
      const smart = smartFolderRecordSchema.parse({
        _id: newId(),
        workspaceId: input.workspaceId,
        userId: user.userId,
        name: input.name,
        filters: input.filters,
        sort: input.sort,
        dir: input.dir,
        orderKey: keyBetween(last?.orderKey ?? null, null),
        createdAt: now,
        updatedAt: now,
      });
      await c.smartFolders.insertOne(smart);
      return smart;
    },

    async update(
      ctx: AccessContext,
      smartFolderId: string,
      input: { name?: string; filters?: LibraryFilters; sort?: LibrarySort; dir?: SortDir },
    ): Promise<SmartFolderRecord> {
      const smart = await load(ctx, smartFolderId);
      await authorize(r, ctx, { type: "smartFolder", smartFolderId }, "edit");
      const next = smartFolderRecordSchema.parse({
        ...smart,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.filters !== undefined ? { filters: input.filters } : {}),
        ...(input.sort !== undefined ? { sort: input.sort } : {}),
        ...(input.dir !== undefined ? { dir: input.dir } : {}),
        updatedAt: r.now(),
      });
      await c.smartFolders.replaceOne({ _id: smartFolderId }, next);
      return next;
    },

    async delete(ctx: AccessContext, smartFolderId: string): Promise<void> {
      await authorize(r, ctx, { type: "smartFolder", smartFolderId }, "edit");
      await c.smartFolders.deleteOne({ _id: smartFolderId });
    },
  };
}
