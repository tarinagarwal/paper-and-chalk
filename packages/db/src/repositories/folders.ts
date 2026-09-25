import { folderRecordSchema, keyBetween, type FolderIcon, type FolderRecord } from "@pc/schema";

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

  /**
   * The order key that places a folder just before `beforeId` among `parentId`'s children, or
   * last when `beforeId` is null. `movingId` is ignored as a neighbour (it is the one moving).
   */
  async function keyBefore(
    workspaceId: string,
    parentId: string | null,
    beforeId: string | null,
    movingId?: string,
  ) {
    if (!beforeId) {
      const siblings = await c.folders
        .find(
          { workspaceId, parentId, deletedAt: null, _id: { $ne: movingId ?? "" } },
          { projection: { orderKey: 1 } },
        )
        .sort({ orderKey: -1, _id: -1 })
        .limit(1)
        .toArray();
      return keyBetween(siblings[0]?.orderKey ?? null, null);
    }
    const before = await c.folders.findOne({ _id: beforeId, deletedAt: null });
    if (before?.workspaceId !== workspaceId || before.parentId !== parentId) {
      throw new InvalidRequestError("wrong_folder", "That folder is not next to this one");
    }
    const previous = await c.folders
      .find(
        {
          workspaceId,
          parentId,
          deletedAt: null,
          _id: { $ne: movingId ?? "" },
          orderKey: { $lt: before.orderKey },
        },
        { projection: { orderKey: 1 } },
      )
      .sort({ orderKey: -1, _id: -1 })
      .limit(1)
      .toArray();
    return keyBetween(previous[0]?.orderKey ?? null, before.orderKey);
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
      input: {
        workspaceId: string;
        parentId?: string | null;
        name: string;
        color?: string | null;
        icon?: FolderIcon | null;
      },
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
        icon: input.icon ?? null,
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

    /** Every live folder in the workspace, in tree order within each parent (for the sidebar). */
    async listAll(ctx: AccessContext, workspaceId: string): Promise<FolderRecord[]> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      return c.folders
        .find({ workspaceId, deletedAt: null })
        .sort({ parentId: 1, orderKey: 1, _id: 1 })
        .toArray();
    },

    async get(ctx: AccessContext, folderId: string): Promise<FolderRecord> {
      await authorize(r, ctx, { type: "folder", folderId }, "view");
      return liveFolder(folderId);
    },

    async rename(ctx: AccessContext, folderId: string, name: string): Promise<void> {
      await authorize(r, ctx, { type: "folder", folderId }, "edit");
      const parsed = folderRecordSchema.shape.name.parse(name);
      await c.folders.updateOne({ _id: folderId }, { $set: { name: parsed, updatedAt: r.now() } });
    },

    /** Name, colour and icon, any of them. */
    async update(
      ctx: AccessContext,
      folderId: string,
      input: { name?: string; color?: string | null; icon?: FolderIcon | null },
    ): Promise<FolderRecord> {
      await authorize(r, ctx, { type: "folder", folderId }, "edit");
      const folder = await liveFolder(folderId);
      const next = folderRecordSchema.parse({
        ...folder,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        updatedAt: r.now(),
      });
      await c.folders.updateOne(
        { _id: folderId },
        {
          $set: { name: next.name, color: next.color, icon: next.icon, updatedAt: next.updatedAt },
        },
      );
      return next;
    },

    /**
     * Moves a folder under another folder (or to the top level), just before the sibling
     * `beforeId` or last. Refuses cycles and moves between workspaces.
     */
    async move(
      ctx: AccessContext,
      folderId: string,
      parentId: string | null,
      beforeId: string | null = null,
    ): Promise<FolderRecord> {
      await authorize(r, ctx, { type: "folder", folderId }, "edit");
      const folder = await liveFolder(folderId);
      if (beforeId === folderId) return folder;
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
      const orderKey = await keyBefore(folder.workspaceId, parentId, beforeId, folderId);
      const now = r.now();
      await c.folders.updateOne(
        { _id: folderId },
        { $set: { parentId, orderKey, updatedAt: now } },
      );
      return { ...folder, parentId, orderKey, updatedAt: now };
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
