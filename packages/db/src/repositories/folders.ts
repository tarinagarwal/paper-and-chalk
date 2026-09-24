import { folderRecordSchema, keyBetween, type FolderRecord } from "@pc/schema";

import { InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { withTransaction } from "../transaction";
import { authorize, requireUser, type RepoContext } from "./context";

export function foldersRepository(r: RepoContext) {
  const { c } = r;

  async function lastKey(workspaceId: string, parentId: string | null) {
    const last = await c.folders
      .find({ workspaceId, parentId, deletedAt: null }, { projection: { orderKey: 1 } })
      .sort({ orderKey: -1, _id: -1 })
      .limit(1)
      .next();
    return last?.orderKey ?? null;
  }

  async function liveFolder(folderId: string) {
    const folder = await c.folders.findOne({ _id: folderId, deletedAt: null });
    if (!folder) throw new InvalidRequestError("not_found", "Folder not found");
    return folder;
  }

  /** Ids of the folder and every folder under it. */
  async function subtree(folder: FolderRecord): Promise<string[]> {
    const ids = [folder._id];
    let level = [folder._id];
    while (level.length > 0) {
      const children = await c.folders
        .find(
          { workspaceId: folder.workspaceId, parentId: { $in: level }, deletedAt: null },
          { projection: { _id: 1 } },
        )
        .toArray();
      level = children.map((f) => f._id);
      ids.push(...level);
    }
    return ids;
  }

  return {
    async create(
      ctx: AccessContext,
      input: { workspaceId: string; parentId?: string | null; name: string; color?: string | null },
    ): Promise<FolderRecord> {
      const user = requireUser(ctx);
      await authorize(
        r,
        ctx,
        { type: "workspace", workspaceId: input.workspaceId },
        "createContent",
      );
      const parentId = input.parentId ?? null;
      if (parentId) {
        const parent = await liveFolder(parentId);
        if (parent.workspaceId !== input.workspaceId) {
          throw new InvalidRequestError(
            "wrong_workspace",
            "The parent folder is in another workspace",
          );
        }
      }
      const now = r.now();
      const folder = folderRecordSchema.parse({
        _id: newId(),
        workspaceId: input.workspaceId,
        parentId,
        name: input.name,
        color: input.color ?? null,
        icon: null,
        orderKey: keyBetween(await lastKey(input.workspaceId, parentId), null),
        createdBy: user.userId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      await c.folders.insertOne(folder);
      return folder;
    },

    async list(
      ctx: AccessContext,
      workspaceId: string,
      parentId: string | null = null,
    ): Promise<FolderRecord[]> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      return c.folders
        .find({ workspaceId, parentId, deletedAt: null })
        .sort({ orderKey: 1, _id: 1 })
        .toArray();
    },

    async rename(ctx: AccessContext, folderId: string, name: string): Promise<void> {
      await authorize(r, ctx, { type: "folder", folderId }, "edit");
      const parsed = folderRecordSchema.shape.name.parse(name);
      await c.folders.updateOne({ _id: folderId }, { $set: { name: parsed, updatedAt: r.now() } });
    },

    /** Moves a folder under another folder (or to the top level), refusing cycles. */
    async move(ctx: AccessContext, folderId: string, parentId: string | null): Promise<void> {
      await authorize(r, ctx, { type: "folder", folderId }, "edit");
      const folder = await liveFolder(folderId);
      if (parentId) {
        const target = await liveFolder(parentId);
        if (target.workspaceId !== folder.workspaceId) {
          throw new InvalidRequestError("wrong_workspace", "Folders can't move between workspaces");
        }
        // Walk up from the target: reaching the moving folder means a cycle.
        let cursor: string | null = target._id;
        while (cursor) {
          if (cursor === folder._id) {
            throw new InvalidRequestError("folder_cycle", "A folder can't move into itself");
          }
          const next: FolderRecord | null = await c.folders.findOne({ _id: cursor });
          cursor = next?.parentId ?? null;
        }
      }
      await c.folders.updateOne(
        { _id: folderId },
        {
          $set: {
            parentId,
            orderKey: keyBetween(await lastKey(folder.workspaceId, parentId), null),
            updatedAt: r.now(),
          },
        },
      );
    },

    /** Moves the folder, its subfolders and their documents to the trash, together. */
    async trash(
      ctx: AccessContext,
      folderId: string,
    ): Promise<{ folders: number; documents: number }> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "folder", folderId }, "delete");
      const ids = await subtree(await liveFolder(folderId));
      const now = r.now();
      return withTransaction(r.conn.client, async (session) => {
        const folders = await c.folders.updateMany(
          { _id: { $in: ids } },
          { $set: { deletedAt: now, updatedAt: now } },
          { session },
        );
        const documents = await c.documents.updateMany(
          { folderId: { $in: ids }, deletedAt: null },
          { $set: { deletedAt: now, deletedBy: user.userId, updatedAt: now } },
          { session },
        );
        return { folders: folders.modifiedCount, documents: documents.modifiedCount };
      });
    },
  };
}
