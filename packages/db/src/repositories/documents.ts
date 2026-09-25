import { hash } from "@node-rs/argon2";
import {
  documentPermissionRecordSchema,
  documentRecordSchema,
  documentTitleSchema,
  documentUserStateRecordSchema,
  highestRole,
  keysBetween,
  PAGE_SIZE_PRESETS,
  pageRecordSchema,
  pageSpecSchema,
  principalSchema,
  roleSchema,
  shareLinkRecordSchema,
  titleSortKey,
  trigrams,
  type DocumentPermissionRecord,
  type DocumentRecord,
  type DocumentType,
  type DocumentUserStateRecord,
  type PageSpec,
  type Principal,
  type Role,
  type ShareLinkRecord,
  type ShareLinkRole,
} from "@pc/schema";
import { InvalidRequestError } from "../errors";
import { newId, newToken } from "../ids";
import { can, type AccessContext } from "../permissions/can";
import { withTransaction } from "../transaction";
import { authorize, requireUser, type RepoContext } from "./context";
import { ensurePersonalWorkspace } from "./workspaces";

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

/** A document keeps at most this many tags. */
const MAX_TAGS = 50;

/** "Notes" -> "Notes (copy)", trimmed so the result still fits the title limit. */
export function copyTitle(title: string): string {
  const suffix = " (copy)";
  const max = documentTitleSchema.maxLength ?? 200;
  return `${title.slice(0, max - suffix.length).trimEnd()}${suffix}`;
}

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

  async function checkTags(workspaceId: string, tagIds: readonly string[]) {
    const unique = [...new Set(tagIds)];
    const found = await c.tags.countDocuments({ _id: { $in: unique }, workspaceId });
    if (found !== unique.length) {
      throw new InvalidRequestError("unknown_tag", "Some tags are not in this workspace");
    }
    return unique;
  }

  /**
   * Keeps `isShared` true while anyone besides the creator has a grant or a share link is live.
   * Expiry is not tracked: an expired grant still counts until it is removed.
   */
  async function refreshShared(documentId: string) {
    const document = await load(documentId);
    const [grants, links] = await Promise.all([
      c.documentPermissions.countDocuments(
        { documentId, "principal.userId": { $ne: document.createdBy } },
        { limit: 1 },
      ),
      c.shareLinks.countDocuments({ documentId, revokedAt: null }, { limit: 1 }),
    ]);
    const isShared = grants + links > 0;
    if (isShared !== document.isShared) {
      await c.documents.updateOne({ _id: documentId }, { $set: { isShared } });
    }
  }

  /** Creates or updates the user's favourite / last-opened record for a document. */
  async function setUserState(
    userId: string,
    document: DocumentRecord,
    fields: Partial<Pick<DocumentUserStateRecord, "favoritedAt" | "lastOpenedAt">>,
  ) {
    const now = r.now();
    const fresh = documentUserStateRecordSchema.parse({
      _id: newId(),
      userId,
      documentId: document._id,
      workspaceId: document.workspaceId,
      favoritedAt: null,
      lastOpenedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const onInsert = Object.fromEntries(
      Object.entries(fresh).filter(([key]) => !(key in fields) && key !== "updatedAt"),
    );
    // The unique (userId, documentId) index lets MongoDB retry a racing upsert as an update.
    await c.documentUserStates.updateOne(
      { userId, documentId: document._id },
      { $set: { ...fields, updatedAt: now }, $setOnInsert: onInsert },
      { upsert: true },
    );
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
        titleKey: titleSortKey(input.title),
        cover: null,
        defaultPageSpec: spec,
        sourcePdfPath: null,
        pageCount,
        bytes: 0,
        thumbnailPath: null,
        tagIds: [],
        isShared: false,
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

    async rename(ctx: AccessContext, documentId: string, title: string): Promise<void> {
      await authorize(r, ctx, { type: "document", documentId }, "edit");
      const parsed = documentRecordSchema.shape.title.parse(title);
      await c.documents.updateOne(
        { _id: documentId },
        {
          $set: {
            title: parsed,
            titleTrigrams: trigrams(parsed),
            titleKey: titleSortKey(parsed),
            updatedAt: r.now(),
          },
        },
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
      const unique = await checkTags(document.workspaceId, tagIds);
      if (unique.length > MAX_TAGS) {
        throw new InvalidRequestError("too_many_tags", "A document can have up to 50 tags");
      }
      await c.documents.updateOne(
        { _id: documentId },
        { $set: { tagIds: unique, updatedAt: r.now() } },
      );
    },

    /** Adds and removes tags without touching the others (safe for bulk and parallel edits). */
    async changeTags(
      ctx: AccessContext,
      documentId: string,
      change: { add?: readonly string[]; remove?: readonly string[] },
    ): Promise<void> {
      await authorize(r, ctx, { type: "document", documentId }, "edit");
      const document = await load(documentId);
      const add = await checkTags(document.workspaceId, change.add ?? []);
      const remove = [...new Set(change.remove ?? [])];
      if (new Set([...document.tagIds, ...add]).size > MAX_TAGS) {
        throw new InvalidRequestError("too_many_tags", "A document can have up to 50 tags");
      }
      const now = r.now();
      if (add.length > 0) {
        await c.documents.updateOne(
          { _id: documentId },
          { $addToSet: { tagIds: { $each: add } }, $set: { updatedAt: now } },
        );
      }
      if (remove.length > 0) {
        await c.documents.updateOne(
          { _id: documentId },
          { $pull: { tagIds: { $in: remove } }, $set: { updatedAt: now } },
        );
      }
    },

    /** Marks the document as opened by the user now (Recents and the "last opened" sort). */
    async recordOpen(ctx: AccessContext, documentId: string): Promise<void> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "document", documentId }, "view");
      const document = await load(documentId);
      if (document.deletedAt) {
        throw new InvalidRequestError("document_deleted", "This document is in the trash");
      }
      await setUserState(user.userId, document, { lastOpenedAt: r.now() });
    },

    async setFavourite(ctx: AccessContext, documentId: string, on: boolean): Promise<void> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "document", documentId }, "view");
      const document = await load(documentId);
      if (document.deletedAt && on) {
        throw new InvalidRequestError("document_deleted", "This document is in the trash");
      }
      await setUserState(user.userId, document, { favoritedAt: on ? r.now() : null });
    },

    /**
     * Copies a document's details and pages. The copy stays in the same workspace and folder when
     * the user may add documents there; otherwise it goes to the top of their personal workspace.
     * Sharing is not copied: the user owns the copy alone. Page content and files are copied by
     * the steps that store them (see the deferred items in PROGRESS.md).
     */
    async duplicate(ctx: AccessContext, documentId: string): Promise<DocumentRecord> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "document", documentId }, "download");
      const source = await load(documentId);
      if (source.deletedAt) {
        throw new InvalidRequestError("document_deleted", "This document is in the trash");
      }
      const now = r.now();
      const canAddHere = (
        await can(
          c,
          { ...ctx, now },
          { type: "workspace", workspaceId: source.workspaceId },
          "createContent",
        )
      ).allowed;
      const workspaceId = canAddHere
        ? source.workspaceId
        : (await ensurePersonalWorkspace(r, user.userId))._id;
      const folderAlive =
        canAddHere &&
        source.folderId !== null &&
        (await c.folders.countDocuments({ _id: source.folderId, deletedAt: null })) > 0;

      const title = copyTitle(source.title);
      const copy = documentRecordSchema.parse({
        ...source,
        _id: newId(),
        workspaceId,
        folderId: folderAlive ? source.folderId : null,
        title,
        titleTrigrams: trigrams(title),
        titleKey: titleSortKey(title),
        bytes: 0,
        thumbnailPath: null,
        tagIds: canAddHere ? source.tagIds : [],
        isShared: false,
        editorsCanShare: false,
        createdBy: user.userId,
        deletedBy: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      const owner = documentPermissionRecordSchema.parse({
        _id: newId(),
        documentId: copy._id,
        principal: { kind: "user", userId: user.userId },
        role: "owner",
        expiresAt: null,
        grantedBy: user.userId,
        createdAt: now,
        updatedAt: now,
      });
      const pages = (
        await c.pages.find({ documentId, deletedAt: null }).sort({ orderKey: 1, _id: 1 }).toArray()
      ).map((page) => {
        const id = newId();
        return pageRecordSchema.parse({
          ...page,
          _id: id,
          documentId: copy._id,
          ydocName: `page:${id}`,
          thumbnailPath: null,
          locked: false,
          lockedBy: null,
          createdAt: now,
          updatedAt: now,
        });
      });
      await withTransaction(r.conn.client, async (session) => {
        await c.documents.insertOne(copy, { session });
        await c.documentPermissions.insertOne(owner, { session });
        if (pages.length > 0) await c.pages.insertMany(pages, { session });
      });
      return copy;
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
      await refreshShared(documentId);
      return record;
    },

    async revokeGrant(ctx: AccessContext, documentId: string, permissionId: string): Promise<void> {
      const actorRole = await authorize(r, ctx, { type: "document", documentId }, "share");
      const grant = await c.documentPermissions.findOne({ _id: permissionId, documentId });
      if (!grant) return;
      await guardOwnerGrant(documentId, actorRole, grant.role, null);
      await c.documentPermissions.deleteOne({ _id: permissionId });
      await refreshShared(documentId);
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
      await refreshShared(documentId);
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
      await refreshShared(documentId);
    },
  };
}
