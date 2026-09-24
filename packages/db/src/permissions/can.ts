/**
 * `can()`: loads the facts for one permission question from MongoDB and asks the pure rules in
 * decide.ts. Every repository call goes through here.
 */
import { verify } from "@node-rs/argon2";
import type {
  DocumentAction,
  DocumentRecord,
  FolderAction,
  LayerAction,
  PageAction,
  Role,
  WorkspaceAction,
} from "@pc/schema";

import type { TypedCollections } from "../collections";
import {
  decideDocument,
  decideFolder,
  decideLayer,
  decidePage,
  decideWorkspace,
  deny,
  type Decision,
  type DocumentFacts,
  type LinkFacts,
} from "./decide";

/** Who is asking. Guests exist only through share links and have a temporary id. */
export type Actor =
  { kind: "user"; userId: string; email: string } | { kind: "guest"; guestId: string };

/** How the request reached the resource. */
export interface AccessContext {
  actor: Actor;
  /** Set when the request came through a share link. */
  shareLink?: { token: string; password?: string };
  /** For tests. */
  now?: Date;
}

export type Resource =
  | { type: "workspace"; workspaceId: string }
  | { type: "folder"; folderId: string }
  | { type: "document"; documentId: string }
  | { type: "page"; documentId: string; pageId: string }
  /** Layers live in the document's Y.Doc; the caller supplies whether the layer is owner-only. */
  | { type: "layer"; documentId: string; pageId: string; layerOwnerOnly: boolean };

export type ActionFor<R extends Resource> = R extends { type: "workspace" }
  ? WorkspaceAction
  : R extends { type: "folder" }
    ? FolderAction
    : R extends { type: "document" }
      ? DocumentAction
      : R extends { type: "page" }
        ? PageAction
        : LayerAction;

export const actorId = (actor: Actor) => (actor.kind === "user" ? actor.userId : actor.guestId);

async function memberRole(c: TypedCollections, workspaceId: string, actor: Actor) {
  if (actor.kind !== "user") return null;
  const member = await c.workspaceMembers.findOne(
    { workspaceId, userId: actor.userId },
    { projection: { role: 1 } },
  );
  return member?.role ?? null;
}

async function workspaceFacts(c: TypedCollections, workspaceId: string, actor: Actor) {
  const workspace = await c.workspaces.findOne({ _id: workspaceId });
  if (!workspace) return null;
  return {
    isGuest: actor.kind === "guest",
    memberRole: await memberRole(c, workspaceId, actor),
    personal: workspace.personal,
    deleted: workspace.deletedAt !== null,
  };
}

async function linkFacts(
  c: TypedCollections,
  documentId: string,
  shareLink: AccessContext["shareLink"],
): Promise<LinkFacts | null> {
  if (!shareLink) return null;
  const link = await c.shareLinks.findOne({ token: shareLink.token, documentId });
  if (!link) return null;
  const passwordVerified =
    link.passwordHash !== null && shareLink.password !== undefined
      ? await verify(link.passwordHash, shareLink.password).catch(() => false)
      : false;
  return {
    role: link.role,
    expiresAt: link.expiresAt,
    revoked: link.revokedAt !== null,
    requireSignIn: link.requireSignIn,
    allowDownload: link.allowDownload,
    passwordRequired: link.passwordHash !== null,
    passwordVerified,
  };
}

/** Everything decide.ts needs about one document, or null if it does not exist. */
export async function loadDocumentFacts(
  c: TypedCollections,
  document: DocumentRecord,
  ctx: AccessContext,
): Promise<DocumentFacts> {
  const { actor } = ctx;
  const grants =
    actor.kind === "user"
      ? await c.documentPermissions
          .find(
            {
              documentId: document._id,
              $or: [
                { "principal.kind": "user", "principal.userId": actor.userId },
                { "principal.kind": "email", "principal.email": actor.email.toLowerCase() },
              ],
            },
            { projection: { role: 1, expiresAt: 1 } },
          )
          .toArray()
      : [];
  return {
    now: ctx.now ?? new Date(),
    isGuest: actor.kind === "guest",
    workspaceRole: await memberRole(c, document.workspaceId, actor),
    grants: grants.map((g) => ({ role: g.role, expiresAt: g.expiresAt })),
    link: await linkFacts(c, document._id, ctx.shareLink),
    deleted: document.deletedAt !== null,
    editorsCanShare: document.editorsCanShare,
  };
}

/** The permission question: may this actor do `action` to `resource`? Denials carry a reason. */
export async function can<R extends Resource>(
  c: TypedCollections,
  ctx: AccessContext,
  resource: R,
  action: ActionFor<R>,
): Promise<Decision> {
  switch (resource.type) {
    case "workspace": {
      const facts = await workspaceFacts(c, resource.workspaceId, ctx.actor);
      return facts ? decideWorkspace(facts, action as WorkspaceAction) : deny("not_found");
    }
    case "folder": {
      const folder = await c.folders.findOne({ _id: resource.folderId, deletedAt: null });
      if (!folder) return deny("not_found");
      const facts = await workspaceFacts(c, folder.workspaceId, ctx.actor);
      return facts ? decideFolder(facts, action as FolderAction) : deny("not_found");
    }
    case "document": {
      const document = await c.documents.findOne({ _id: resource.documentId });
      if (!document) return deny("not_found");
      return decideDocument(await loadDocumentFacts(c, document, ctx), action as DocumentAction);
    }
    case "page":
    case "layer": {
      const [document, page] = await Promise.all([
        c.documents.findOne({ _id: resource.documentId }),
        c.pages.findOne({ _id: resource.pageId, documentId: resource.documentId, deletedAt: null }),
      ]);
      if (!document || !page) return deny("not_found");
      const facts = { ...(await loadDocumentFacts(c, document, ctx)), pageLocked: page.locked };
      if (resource.type === "page") return decidePage(facts, action as PageAction);
      return decideLayer(
        { ...facts, layerOwnerOnly: resource.layerOwnerOnly },
        action as LayerAction,
      );
    }
  }
}

/** Convenience for callers that only need the role, e.g. to shape a response. */
export async function effectiveRole(
  c: TypedCollections,
  ctx: AccessContext,
  documentId: string,
): Promise<Role | null> {
  const decision = await can(c, ctx, { type: "document", documentId }, "view");
  return decision.allowed ? decision.role : null;
}
