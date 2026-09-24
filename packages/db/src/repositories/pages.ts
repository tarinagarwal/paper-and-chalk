import {
  keyBetween,
  pageRecordSchema,
  pageSpecSchema,
  sortByOrder,
  type PageRecord,
  type PageSpec,
} from "@pc/schema";

import { InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { withTransaction } from "../transaction";
import { authorize, requireUser, type RepoContext } from "./context";
import { DEFAULT_NOTEBOOK_PAGE } from "./documents";

const asOrdered = (p: PageRecord) => ({ ...p, id: p._id });

export function pagesRepository(r: RepoContext) {
  const { c } = r;

  async function livePages(documentId: string): Promise<PageRecord[]> {
    const pages = await c.pages.find({ documentId, deletedAt: null }).toArray();
    return sortByOrder(pages.map(asOrdered));
  }

  /**
   * An order key for a page placed right after `afterPageId` (or first when null). Neighbours that
   * share a key (concurrent inserts) are skipped so the new key is strictly between distinct keys.
   */
  function keyAfter(pages: PageRecord[], afterPageId: string | null, excludeId?: string): string {
    const others = pages.filter((p) => p._id !== excludeId);
    let index = -1;
    if (afterPageId !== null) {
      index = others.findIndex((p) => p._id === afterPageId);
      if (index === -1)
        throw new InvalidRequestError("not_found", "The anchor page is not in this document");
    }
    const before = index >= 0 ? (others[index]?.orderKey ?? null) : null;
    const next = others.slice(index + 1).find((p) => before === null || p.orderKey > before);
    return keyBetween(before, next?.orderKey ?? null);
  }

  return {
    async list(ctx: AccessContext, documentId: string): Promise<PageRecord[]> {
      await authorize(r, ctx, { type: "document", documentId }, "view");
      return livePages(documentId);
    },

    /** Inserts a page after `afterPageId` (null = at the start), matching the document's paper by default. */
    async insert(
      ctx: AccessContext,
      documentId: string,
      input: { afterPageId: string | null; spec?: PageSpec },
    ): Promise<PageRecord> {
      await authorize(r, ctx, { type: "document", documentId }, "managePages");
      const document = await c.documents.findOne({ _id: documentId });
      if (!document) throw new InvalidRequestError("not_found", "Document not found");
      const spec = pageSpecSchema.parse(
        input.spec ?? document.defaultPageSpec ?? DEFAULT_NOTEBOOK_PAGE,
      );
      const pages = await livePages(documentId);
      const now = r.now();
      const id = newId();
      const page = pageRecordSchema.parse({
        _id: id,
        documentId,
        orderKey: keyAfter(pages, input.afterPageId),
        widthPt: spec.widthPt,
        heightPt: spec.heightPt,
        rotation: spec.rotation,
        background: spec.background,
        ydocName: `page:${id}`,
        thumbnailPath: null,
        searchText: "",
        embedding: null,
        embeddingModel: null,
        locked: false,
        lockedBy: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      await withTransaction(r.conn.client, async (session) => {
        await c.pages.insertOne(page, { session });
        await c.documents.updateOne(
          { _id: documentId },
          { $inc: { pageCount: 1 }, $set: { updatedAt: now } },
          { session },
        );
      });
      return page;
    },

    /** Moves a page to right after `afterPageId` (null = first). Locked pages stay put for editors. */
    async move(
      ctx: AccessContext,
      documentId: string,
      pageId: string,
      afterPageId: string | null,
    ): Promise<string> {
      await authorize(r, ctx, { type: "page", documentId, pageId }, "managePages");
      if (afterPageId === pageId)
        throw new InvalidRequestError("invalid_move", "A page can't move after itself");
      const orderKey = keyAfter(await livePages(documentId), afterPageId, pageId);
      await c.pages.updateOne({ _id: pageId }, { $set: { orderKey, updatedAt: r.now() } });
      return orderKey;
    },

    async remove(ctx: AccessContext, documentId: string, pageId: string): Promise<void> {
      await authorize(r, ctx, { type: "page", documentId, pageId }, "managePages");
      const now = r.now();
      await withTransaction(r.conn.client, async (session) => {
        const result = await c.pages.updateOne(
          { _id: pageId, documentId, deletedAt: null },
          { $set: { deletedAt: now, updatedAt: now } },
          { session },
        );
        if (result.modifiedCount === 1) {
          await c.documents.updateOne(
            { _id: documentId },
            { $inc: { pageCount: -1 }, $set: { updatedAt: now } },
            { session },
          );
        }
      });
    },

    async setLocked(
      ctx: AccessContext,
      documentId: string,
      pageId: string,
      locked: boolean,
    ): Promise<void> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "page", documentId, pageId }, "lock");
      await c.pages.updateOne(
        { _id: pageId, documentId },
        { $set: { locked, lockedBy: locked ? user.userId : null, updatedAt: r.now() } },
      );
    },
  };
}
