/**
 * The permission rules of SPEC.md section 4, as pure functions over facts. `can()` (can.ts) loads
 * the facts from MongoDB; everything that decides lives here so it can be tested exhaustively.
 *
 * Effective role on a document = the highest of: the workspace member role, the user's unexpired
 * direct/email grants, and (only when the request comes through one) a valid share link.
 * Workspace owners are owners of every document in the workspace.
 */
import {
  atLeast,
  highestRole,
  type DocumentAction,
  type FolderAction,
  type LayerAction,
  type PageAction,
  type Role,
  type ShareLinkRole,
  type WorkspaceAction,
} from "@pc/schema";

export type DenyReason =
  | "not_found"
  | "no_access"
  | "grant_expired"
  | "sign_in_required"
  | "link_revoked"
  | "link_expired"
  | "link_password_required"
  | "role_too_low"
  | "sharing_not_allowed"
  | "guests_not_allowed"
  | "download_not_allowed"
  | "document_deleted"
  | "not_in_trash"
  | "page_locked"
  | "layer_locked"
  | "personal_workspace";

export type Decision =
  | { allowed: true; role: Role }
  | { allowed: false; reason: DenyReason; role: Role | null; message: string };

export type Denied = Extract<Decision, { allowed: false }>;

const MESSAGES: Record<DenyReason, string> = {
  not_found: "That doesn't exist, or it isn't shared with you.",
  no_access: "You don't have access to this.",
  grant_expired: "Your access to this has expired.",
  sign_in_required: "Sign in to open this link.",
  link_revoked: "This link has been turned off.",
  link_expired: "This link has expired.",
  link_password_required: "This link needs a password.",
  role_too_low: "Your role doesn't allow this.",
  sharing_not_allowed: "Only the owner can share this document.",
  guests_not_allowed: "Guests can't do this. Sign in first.",
  download_not_allowed: "Downloads are turned off for this link.",
  document_deleted: "This document is in the trash.",
  not_in_trash: "Move the document to the trash first.",
  page_locked: "This page is locked by the owner.",
  layer_locked: "This layer is locked by the owner.",
  personal_workspace: "Personal workspaces can't be shared or deleted.",
};

export const allow = (role: Role): Decision => ({ allowed: true, role });
export const deny = (reason: DenyReason, role: Role | null = null): Denied => ({
  allowed: false,
  reason,
  role,
  message: MESSAGES[reason],
});

// ---------------------------------------------------------------------------------------------
// facts

export interface GrantFacts {
  role: Role;
  expiresAt: Date | null;
}

export interface LinkFacts {
  role: ShareLinkRole;
  expiresAt: Date | null;
  revoked: boolean;
  requireSignIn: boolean;
  allowDownload: boolean;
  passwordRequired: boolean;
  /** The caller checked the supplied password against the stored hash. */
  passwordVerified: boolean;
}

export interface DocumentFacts {
  now: Date;
  isGuest: boolean;
  workspaceRole: Role | null;
  grants: readonly GrantFacts[];
  /** The share link the request came through, if any. */
  link: LinkFacts | null;
  deleted: boolean;
  editorsCanShare: boolean;
}

export interface PageFacts extends DocumentFacts {
  pageLocked: boolean;
}

export interface LayerFacts extends PageFacts {
  /** Section 4 layer permissions: a "teacher" layer only the owner can edit. */
  layerOwnerOnly: boolean;
}

// ---------------------------------------------------------------------------------------------
// resolving the role

const isActive = (expiresAt: Date | null, now: Date) =>
  expiresAt === null || expiresAt.getTime() > now.getTime();

interface Resolved {
  role: Role | null;
  /** Role without the share link, i.e. the user's own access. */
  directRole: Role | null;
  /** Why there is no role, when there is none. */
  problem: DenyReason;
}

function resolveRole(f: DocumentFacts): Resolved {
  const activeGrants = f.isGuest ? [] : f.grants.filter((g) => isActive(g.expiresAt, f.now));
  const directRole = f.isGuest
    ? null
    : highestRole([f.workspaceRole, ...activeGrants.map((g) => g.role)]);

  let linkRole: Role | null = null;
  let linkProblem: DenyReason | null = null;
  if (f.link) {
    if (f.link.revoked) linkProblem = "link_revoked";
    else if (!isActive(f.link.expiresAt, f.now)) linkProblem = "link_expired";
    else if (f.link.requireSignIn && f.isGuest) linkProblem = "sign_in_required";
    else if (f.link.passwordRequired && !f.link.passwordVerified) {
      linkProblem = "link_password_required";
    } else linkRole = f.link.role;
  }

  const hadExpiredGrant = !f.isGuest && f.grants.some((g) => !isActive(g.expiresAt, f.now));
  return {
    role: highestRole([directRole, linkRole]),
    directRole,
    problem: linkProblem ?? (hadExpiredGrant ? "grant_expired" : "no_access"),
  };
}

// ---------------------------------------------------------------------------------------------
// documents

const REQUIRED: Record<Exclude<DocumentAction, "share">, Role> = {
  view: "viewer",
  comment: "commenter",
  edit: "editor",
  managePages: "editor",
  delete: "owner",
  restore: "owner",
  purge: "owner",
  download: "viewer",
};

export function decideDocument(f: DocumentFacts, action: DocumentAction): Decision {
  const { role, directRole, problem } = resolveRole(f);
  if (!role) return deny(problem);

  const trashActions: DocumentAction[] = ["restore", "purge"];
  if (f.deleted) {
    // A trashed document is only visible to, and recoverable by, its owners.
    if (!["view", ...trashActions].includes(action)) return deny("document_deleted", role);
    return directRole === "owner" ? allow("owner") : deny("document_deleted", role);
  }
  if (trashActions.includes(action)) return deny("not_in_trash", role);

  if (f.isGuest && action === "delete") return deny("guests_not_allowed", role);

  if (action === "share") {
    if (f.isGuest) return deny("guests_not_allowed", role);
    if (role === "owner") return allow(role);
    if (role === "editor")
      return f.editorsCanShare ? allow(role) : deny("sharing_not_allowed", role);
    return deny("role_too_low", role);
  }

  if (!atLeast(role, REQUIRED[action])) return deny("role_too_low", role);

  // Downloads through a share link follow the link's download switch.
  if (action === "download" && f.link && !atLeast(directRole, "viewer") && !f.link.allowDownload) {
    return deny("download_not_allowed", role);
  }
  return allow(role);
}

// ---------------------------------------------------------------------------------------------
// pages and layers

export function decidePage(f: PageFacts, action: PageAction): Decision {
  if (action === "view") return decideDocument(f, "view");
  if (action === "lock") {
    const base = decideDocument(f, "managePages");
    if (!base.allowed) return base;
    return base.role === "owner" ? base : deny("role_too_low", base.role);
  }
  const base = decideDocument(f, action === "edit" ? "edit" : "managePages");
  if (!base.allowed) return base;
  if (f.pageLocked && base.role !== "owner") return deny("page_locked", base.role);
  return base;
}

export function decideLayer(f: LayerFacts, action: LayerAction): Decision {
  if (action === "view") return decideDocument(f, "view");
  const base = decidePage(f, "edit");
  if (!base.allowed) return base;
  if (f.layerOwnerOnly && base.role !== "owner") return deny("layer_locked", base.role);
  return base;
}

// ---------------------------------------------------------------------------------------------
// workspaces and folders

export interface WorkspaceFacts {
  isGuest: boolean;
  memberRole: Role | null;
  personal: boolean;
  deleted: boolean;
}

export function decideWorkspace(f: WorkspaceFacts, action: WorkspaceAction): Decision {
  if (f.isGuest) return deny("guests_not_allowed");
  if (f.deleted) return deny("not_found");
  const role = f.memberRole;
  if (!role) return deny("no_access");
  switch (action) {
    case "view":
      return allow(role);
    case "createContent":
      return atLeast(role, "editor") ? allow(role) : deny("role_too_low", role);
    case "rename":
      return role === "owner" ? allow(role) : deny("role_too_low", role);
    case "manageMembers":
    case "delete":
      if (role !== "owner") return deny("role_too_low", role);
      return f.personal ? deny("personal_workspace", role) : allow(role);
  }
}

export function decideFolder(f: WorkspaceFacts, action: FolderAction): Decision {
  const base = decideWorkspace(f, "view");
  if (!base.allowed) return base;
  if (action === "view") return base;
  return atLeast(base.role, "editor") ? base : deny("role_too_low", base.role);
}

// ---------------------------------------------------------------------------------------------
// smart folders

export interface SmartFolderFacts extends WorkspaceFacts {
  /** The acting user saved this smart folder. */
  isOwner: boolean;
}

/**
 * Smart folders are private saved views: only the user who saved one may see or change it, and
 * only while they can still see its workspace. To anyone else it does not exist.
 */
export function decideSmartFolder(f: SmartFolderFacts): Decision {
  const base = decideWorkspace(f, "view");
  if (!base.allowed) return base;
  return f.isOwner ? base : deny("not_found");
}
