import { hash } from "@node-rs/argon2";
import {
  documentPermissionRecordSchema,
  documentRecordSchema,
  highestRole,
  keysBetween,
  PAGE_SIZE_PRESETS,
  pageRecordSchema,
  pageSpecSchema,
  principalSchema,
  roleSchema,
  shareLinkRecordSchema,
  trigrams,
  trigramSimilarity,
  type DocumentPermissionRecord,
  type DocumentRecord,
  type DocumentType,
  type PageSpec,
  type Principal,
  type Role,
  type ShareLinkRecord,
  type ShareLinkRole,
} from "@pc/schema";
import type { Sort } from "mongodb";

import { InvalidRequestError } from "../errors";
import { newId, newToken } from "../ids";
import type { AccessContext } from "../permissions/can";
import { withTransaction } from "../transaction";
import { deleteDocumentsCascade } from "./cascade";
import { authorize, requireUser, type RepoContext } from "./context";

/** New notebooks: A4 portrait, college ruled (SPEC.md section 6 defaults). */
export const DEFAULT_NOTEBOOK_PAGE: PageSpec = {
  sizePreset: "a4",
  widthPt: PAGE_SIZE_PRESETS.a4.widthPt,
  heightPt: PAGE_SIZE_PRESETS.a4.heightPt,
  rotation: 0,
  background: {
    kind: "paper",
    template: "ruledCollege",
    paperColor: "#ffffff",
    lineColor: "#cadcf1",
    spacingPt: 20,
    marginPt: 36,
  },
};

export interface DocumentWithRole extends DocumentRecord {
  role: Role;
}

export type ShareLinkView = Omit<ShareLinkRecord, "passwordHash"> & { hasPassword: boolean };

const toLinkView = ({ passwordHash, ...rest }: ShareLinkRecord): ShareLinkView => ({
  ...rest,
  hasPassword: passwordHash !== null,
});

export function documentsRepository(r: RepoContext) {
  const { c } = r;

  async function load(documentId: string) {
    const document = await c.documents.findOne({ _id: documentId });
    if (!document) throw new InvalidRequestError("not_found", "Document not found");
    return document;
  }

  /** Only owners may add, change or remove an owner, and the last owner grant must stay. */
  async function guardOwnerGrant(
    documentId: string,
    actorRole: Role,
    before: Role | null,
    after: Role | null,
  ) {
    if ((before === "owner" || after === "owner") && actorRole !== "owner") {
      throw new InvalidRequestError("owner_only", "Only owners can add or change owners");
    }
    if (before === "owner" && after !== "owner") {
      const owners = await c.documentPermissions.countDocuments({ documentId, role: "owner" });
      if (owners <= 1) {
        throw new InvalidRequestError("last_owner", "A document needs at least one owner");
      }
    }
  }

  async function checkFolder(workspaceId: string, folderId: string | null) {
    if (!folderId) return;
    const folder = await c.folders.findOne({ _id: folderId, deletedAt: null });
    if (folder?.workspaceId !== workspaceId) {
      throw new InvalidRequestError("wrong_folder", "That folder is not in this workspace");
    }
  }

  return {
    /**
     * Creates a document with its owner permission and first pages, in one transaction.
     * Notebooks get `pageCount` pages (default 1); canvases and PDFs start with none (PDF pages are
     * added by the import worker, canvases are chunked Y.Docs).
     */
    async create(
      ctx: AccessContext,
      input: {
        workspaceId: string;
        folderId?: string | null;
        type: DocumentType;
        title: string;
        pageSpec?: PageSpec;
        pageCount?: number;
      },
    ): Promise<DocumentRecord> {
      const user = requireUser(ctx);
      await authorize(
        r,
        ctx,
        { type: "workspace", workspaceId: input.workspaceId },
        "createContent",
      );
      const folderId = input.folderId ?? null;
      await checkFolder(input.workspaceId, folderId);

      const now = r.now();
      const spec =
        input.type === "notebook"
          ? pageSpecSchema.parse(input.pageSpec ?? DEFAULT_NOTEBOOK_PAGE)
          : null;
      const pageCount =
        input.type === "notebook" ? Math.max(1, Math.min(input.pageCount ?? 1, 500)) : 0;
      const document = documentRecordSchema.parse({
        _id: newId(),
        workspaceId: input.workspaceId,
        folderId,
        type: input.type,
        title: input.title,
        titleTrigrams: trigrams(input.title),
        cover: null,
        defaultPageSpec: spec,
        sourcePdfPath: null,
        pageCount,
        thumbnailPath: null,
        tagIds: [],
        editorsCanShare: false,
        createdBy: user.userId,
        deletedBy: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      const owner = documentPermissionRecordSchema.parse({
        _id: newId(),
        documentId: document._id,
        principal: { kind: "user", userId: user.userId },
        role: "owner",
        expiresAt: null,
        grantedBy: user.userId,
        createdAt: now,
        updatedAt: now,
      });
      const pages = spec
        ? keysBetween(null, null, pageCount).map((orderKey) => {
            const id = newId();
            return pageRecordSchema.parse({
              _id: id,
              documentId: document._id,
              orderKey,
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
          })
        : [];

      await withTransaction(r.conn.client, async (session) => {
        await c.documents.insertOne(document, { session });
        await c.documentPermissions.insertOne(owner, { session });
        if (pages.length > 0) await c.pages.insertMany(pages, { session });
      });
      return document;
    },

    async get(ctx: AccessContext, documentId: string): Promise<DocumentWithRole> {
      const role = await authorize(r, ctx, { type: "document", documentId }, "view");
      return { ...(await load(documentId)), role };
    },

    /** Documents in a workspace folder (or the whole workspace), newest first. */
    async list(
      ctx: AccessContext,
      workspaceId: string,
      options: {
        folderId?: string | null;
        sort?: "updated" | "created" | "title";
        limit?: number;
      } = {},
    ): Promise<DocumentRecord[]> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      const filter: Record<string, unknown> = { workspaceId, deletedAt: null };
      if (options.folderId !== undefined) filter.folderId = options.folderId;
      // UUIDv7 ids are time-ordered, so `_id: -1` breaks same-millisecond ties newest first too.
      const sort: Sort =
        options.sort === "title"
          ? { title: 1, _id: 1 }
          : options.sort === "created"
            ? { createdAt: -1, _id: -1 }
            : { updatedAt: -1, _id: -1 };
      return c.documents
        .find(filter)
        .sort(sort)
        .limit(Math.min(options.limit ?? 100, 500))
        .toArray();
    },

    /** Documents shared with the user directly (by user id or email), outside their workspaces. */
    async listSharedWithMe(ctx: AccessContext): Promise<DocumentWithRole[]> {
      const user = requireUser(ctx);
      const now = r.now();
      const grants = await c.documentPermissions
        .find({
          $and: [
            {
              $or: [
                { "principal.kind": "user", "principal.userId": user.userId },
                { "principal.kind": "email", "principal.email": user.email.toLowerCase() },
              ],
            },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
            { role: { $ne: "owner" } },
          ],
        })
        .toArray();
      const memberOf = new Set(
        (await c.workspaceMembers.find({ userId: user.userId }).toArray()).map(
          (m) => m.workspaceId,
        ),
      );
      const docs = await c.documents
        .find({ _id: { $in: [...new Set(grants.map((g) => g.documentId))] }, deletedAt: null })
        .sort({ updatedAt: -1 })
        .toArray();
      const roleOf = new Map<string, Role>();
      for (const g of grants) {
        roleOf.set(g.documentId, highestRole([roleOf.get(g.documentId) ?? null, g.role]) ?? g.role);
      }
      return docs
        .filter((d) => !memberOf.has(d.workspaceId))
        .map((d) => ({ ...d, role: roleOf.get(d._id) ?? "viewer" }));
    },

    /** The trash: documents deleted in the workspace that the user can restore. */
    async listTrash(ctx: AccessContext, workspaceId: string): Promise<DocumentRecord[]> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      const deleted = await c.documents
        .find({ workspaceId, deletedAt: { $ne: null } })
        .sort({ deletedAt: -1 })
        .limit(500)
        .toArray();
      const allowed = await Promise.all(
        deleted.map(async (d) => {
          const role = await authorize(
            r,
            ctx,
            { type: "document", documentId: d._id },
            "restore",
          ).catch(() => null);
          return role ? d : null;
        }),
      );
      return allowed.filter((d): d is DocumentRecord => d !== null);
    },

    async rename(ctx: AccessContext, documentId: string, title: string): Promise<void> {
      await authorize(r, ctx, { type: "document", documentId }, "edit");
      const parsed = documentRecordSchema.shape.title.parse(title);
      await c.documents.updateOne(
        { _id: documentId },
        { $set: { title: parsed, titleTrigrams: trigrams(parsed), updatedAt: r.now() } },
      );
    },

    async move(ctx: AccessContext, documentId: string, folderId: string | null): Promise<void> {
      await authorize(r, ctx, { type: "document", documentId }, "edit");
      const document = await load(documentId);
      await checkFolder(document.workspaceId, folderId);
      await c.documents.updateOne({ _id: documentId }, { $set: { folderId, updatedAt: r.now() } });
    },

    async setTags(ctx: AccessContext, documentId: string, tagIds: string[]): Promise<void> {
      await authorize(r, ctx, { type: "document", documentId }, "edit");
      const document = await load(documentId);
      const unique = [...new Set(tagIds)];
      const found = await c.tags.countDocuments({
        _id: { $in: unique },
        workspaceId: document.workspaceId,
      });
      if (found !== unique.length) {
        throw new InvalidRequestError("unknown_tag", "Some tags are not in this workspace");
      }
      await c.documents.updateOne(
        { _id: documentId },
        { $set: { tagIds: unique, updatedAt: r.now() } },
      );
    },

    async setEditorsCanShare(
      ctx: AccessContext,
      documentId: string,
      allowed: boolean,
    ): Promise<void> {
      const role = await authorize(r, ctx, { type: "document", documentId }, "share");
      if (role !== "owner") {
        throw new InvalidRequestError("owner_only", "Only owners can change who may share");
      }
      await c.documents.updateOne(
        { _id: documentId },
        { $set: { editorsCanShare: allowed, updatedAt: r.now() } },
      );
    },

    async trash(ctx: AccessContext, documentId: string): Promise<void> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "document", documentId }, "delete");
      const now = r.now();
      await c.documents.updateOne(
        { _id: documentId },
        { $set: { deletedAt: now, deletedBy: user.userId, updatedAt: now } },
      );
    },

    async restore(ctx: AccessContext, documentId: string): Promise<void> {
      await authorize(r, ctx, { type: "document", documentId }, "restore");
      const document = await load(documentId);
      // If its folder is gone, restore to the top level of the workspace.
      const folderAlive =
        document.folderId !== null &&
        (await c.folders.countDocuments({ _id: document.folderId, deletedAt: null })) > 0;
      await c.documents.updateOne(
        { _id: documentId },
        {
          $set: {
            deletedAt: null,
            deletedBy: null,
            folderId: folderAlive ? document.folderId : null,
            updatedAt: r.now(),
          },
        },
      );
    },

    /** Permanently deletes a trashed document and everything that belongs to it. */
    async purge(ctx: AccessContext, documentId: string): Promise<void> {
      await authorize(r, ctx, { type: "document", documentId }, "purge");
      await withTransaction(r.conn.client, (session) =>
        deleteDocumentsCascade(c, [documentId], session),
      );
    },

    // -------------------------------------------------------------------------------------------
    // sharing

    async listGrants(ctx: AccessContext, documentId: string): Promise<DocumentPermissionRecord[]> {
      await authorize(r, ctx, { type: "document", documentId }, "view");
      return c.documentPermissions.find({ documentId }).sort({ createdAt: 1 }).toArray();
    },

    /** Gives a user or an email address a role. Only owners can grant ownership. */
    async grant(
      ctx: AccessContext,
      documentId: string,
      input: { principal: Principal; role: Role; expiresAt?: Date | null },
    ): Promise<DocumentPermissionRecord> {
      const user = requireUser(ctx);
      const actorRole = await authorize(r, ctx, { type: "document", documentId }, "share");
      const role = roleSchema.parse(input.role);
      const principal = principalSchema.parse(input.principal);
      const match =
        principal.kind === "user"
          ? { documentId, "principal.kind": "user", "principal.userId": principal.userId }
          : { documentId, "principal.kind": "email", "principal.email": principal.email };
      const now = r.now();
      const existing = await c.documentPermissions.findOne(match);
      await guardOwnerGrant(documentId, actorRole, existing?.role ?? null, role);
      const record = documentPermissionRecordSchema.parse({
        _id: existing?._id ?? newId(),
        documentId,
        principal,
        role,
        expiresAt: input.expiresAt ?? null,
        grantedBy: user.userId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      await c.documentPermissions.replaceOne({ _id: record._id }, record, { upsert: true });
      return record;
    },

    async revokeGrant(ctx: AccessContext, documentId: string, permissionId: string): Promise<void> {
      const actorRole = await authorize(r, ctx, { type: "document", documentId }, "share");
      const grant = await c.documentPermissions.findOne({ _id: permissionId, documentId });
      if (!grant) return;
      await guardOwnerGrant(documentId, actorRole, grant.role, null);
      await c.documentPermissions.deleteOne({ _id: permissionId });
    },

    async createShareLink(
      ctx: AccessContext,
      documentId: string,
      input: {
        role: ShareLinkRole;
        expiresAt?: Date | null;
        password?: string | null;
        allowDownload?: boolean;
        requireSignIn?: boolean;
      },
    ): Promise<ShareLinkView> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "document", documentId }, "share");
      if (input.password !== undefined && input.password !== null && input.password.length < 4) {
        throw new InvalidRequestError("weak_password", "Use a password of at least 4 characters");
      }
      const now = r.now();
      const link = shareLinkRecordSchema.parse({
        _id: newId(),
        documentId,
        token: newToken(),
        role: input.role,
        expiresAt: input.expiresAt ?? null,
        passwordHash: input.password ? await hash(input.password) : null,
        allowDownload: input.allowDownload ?? true,
        requireSignIn: input.requireSignIn ?? false,
        createdBy: user.userId,
        revokedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await c.shareLinks.insertOne(link);
      return toLinkView(link);
    },

    async listShareLinks(ctx: AccessContext, documentId: string): Promise<ShareLinkView[]> {
      await authorize(r, ctx, { type: "document", documentId }, "share");
      return (await c.shareLinks.find({ documentId }).sort({ createdAt: -1 }).toArray()).map(
        toLinkView,
      );
    },

    async revokeShareLink(ctx: AccessContext, documentId: string, linkId: string): Promise<void> {
      await authorize(r, ctx, { type: "document", documentId }, "share");
      await c.shareLinks.updateOne(
        { _id: linkId, documentId, revokedAt: null },
        { $set: { revokedAt: r.now(), updatedAt: r.now() } },
      );
    },

    /** Fuzzy title search in one workspace, best matches first (trigram similarity). */
    async searchTitles(
      ctx: AccessContext,
      workspaceId: string,
      query: string,
      limit = 20,
    ): Promise<{ document: DocumentRecord; score: number }[]> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      const grams = trigrams(query);
      if (grams.length === 0) return [];
      const candidates = await c.documents
        .find({ workspaceId, deletedAt: null, titleTrigrams: { $in: grams } })
        .limit(500)
        .toArray();
      return candidates
        .map((document) => ({ document, score: trigramSimilarity(grams, document.titleTrigrams) }))
        .filter((hit) => hit.score >= 0.15)
        .sort(
          (a, b) =>
            b.score - a.score || b.document.updatedAt.getTime() - a.document.updatedAt.getTime(),
        )
        .slice(0, limit);
    },
  };
}
