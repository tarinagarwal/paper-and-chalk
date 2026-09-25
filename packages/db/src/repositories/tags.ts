import { tagRecordSchema, type TagRecord } from "@pc/schema";
import { MongoServerError } from "mongodb";

import { InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { withTransaction } from "../transaction";
import { authorize, type RepoContext } from "./context";

const nameKey = (name: string) => name.trim().toLowerCase();

/** 11000 = the unique (workspaceId, nameKey) index refused a second tag with this name. */
function duplicateName(error: unknown): never {
  if (error instanceof MongoServerError && error.code === 11000) {
    throw new InvalidRequestError("tag_exists", "There is already a tag with that name");
  }
  throw error;
}

/**
 * Workspace tags. Anyone who can see the workspace sees its tags; editors (who may add content)
 * create, change and delete them.
 */
export function tagsRepository(r: RepoContext) {
  const { c } = r;

  async function load(tagId: string) {
    const tag = await c.tags.findOne({ _id: tagId });
    if (!tag) throw new InvalidRequestError("not_found", "Tag not found");
    return tag;
  }

  return {
    async list(ctx: AccessContext, workspaceId: string): Promise<TagRecord[]> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      return c.tags.find({ workspaceId }).sort({ nameKey: 1, _id: 1 }).toArray();
    },

    async get(ctx: AccessContext, tagId: string): Promise<TagRecord> {
      const tag = await load(tagId);
      await authorize(r, ctx, { type: "workspace", workspaceId: tag.workspaceId }, "view");
      return tag;
    },

    async create(
      ctx: AccessContext,
      input: { workspaceId: string; name: string; color: string },
    ): Promise<TagRecord> {
      await authorize(
        r,
        ctx,
        { type: "workspace", workspaceId: input.workspaceId },
        "createContent",
      );
      const now = r.now();
      const tag = tagRecordSchema.parse({
        _id: newId(),
        workspaceId: input.workspaceId,
        name: input.name,
        nameKey: nameKey(input.name),
        color: input.color,
        createdAt: now,
        updatedAt: now,
      });
      await c.tags.insertOne(tag).catch(duplicateName);
      return tag;
    },

    async update(
      ctx: AccessContext,
      tagId: string,
      input: { name?: string; color?: string },
    ): Promise<TagRecord> {
      const tag = await load(tagId);
      await authorize(r, ctx, { type: "workspace", workspaceId: tag.workspaceId }, "createContent");
      const next = tagRecordSchema.parse({
        ...tag,
        ...(input.name !== undefined ? { name: input.name, nameKey: nameKey(input.name) } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        updatedAt: r.now(),
      });
      await c.tags.replaceOne({ _id: tagId }, next).catch(duplicateName);
      return next;
    },

    /** Deletes the tag and takes it off every document and smart folder that used it. */
    async delete(ctx: AccessContext, tagId: string): Promise<void> {
      const tag = await load(tagId);
      await authorize(r, ctx, { type: "workspace", workspaceId: tag.workspaceId }, "createContent");
      await withTransaction(r.conn.client, async (session) => {
        await c.documents.updateMany(
          { workspaceId: tag.workspaceId, tagIds: tagId },
          { $pull: { tagIds: tagId } },
          { session },
        );
        await c.smartFolders.updateMany(
          { workspaceId: tag.workspaceId, "filters.tagIds": tagId },
          { $pull: { "filters.tagIds": tagId } },
          { session },
        );
        await c.tags.deleteOne({ _id: tagId }, { session });
      });
    },
  };
}
