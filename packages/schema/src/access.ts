/**
 * Roles and actions (SPEC.md section 4). The permission engine in packages/db decides every
 * question in these terms.
 */
import { z } from "zod";

export const ROLES = ["viewer", "commenter", "editor", "owner"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Roles a share link can grant. Links never make anyone an owner. */
export const shareLinkRoleSchema = z.enum(["viewer", "commenter", "editor"]);
export type ShareLinkRole = z.infer<typeof shareLinkRoleSchema>;

const RANK: Record<Role, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

export function roleRank(role: Role): number {
  return RANK[role];
}

export function atLeast(role: Role | null, required: Role): boolean {
  return role !== null && RANK[role] >= RANK[required];
}

export function highestRole(roles: readonly (Role | null)[]): Role | null {
  let best: Role | null = null;
  for (const role of roles) {
    if (role && (!best || RANK[role] > RANK[best])) best = role;
  }
  return best;
}

export const WORKSPACE_ACTIONS = [
  "view",
  "createContent",
  "rename",
  "manageMembers",
  "delete",
] as const;
export type WorkspaceAction = (typeof WORKSPACE_ACTIONS)[number];

export const FOLDER_ACTIONS = ["view", "edit", "delete"] as const;
export type FolderAction = (typeof FOLDER_ACTIONS)[number];

/** Columns of the section 4 roles table, plus trash and download. */
export const DOCUMENT_ACTIONS = [
  "view",
  "comment",
  "edit",
  "managePages",
  "share",
  "delete",
  "restore",
  "purge",
  "download",
] as const;
export type DocumentAction = (typeof DOCUMENT_ACTIONS)[number];

export const PAGE_ACTIONS = ["view", "edit", "managePages", "lock"] as const;
export type PageAction = (typeof PAGE_ACTIONS)[number];

export const LAYER_ACTIONS = ["view", "edit"] as const;
export type LayerAction = (typeof LAYER_ACTIONS)[number];

/** Smart folders are private saved views: the same rule for looking and changing. */
export const SMART_FOLDER_ACTIONS = ["view", "edit"] as const;
export type SmartFolderAction = (typeof SMART_FOLDER_ACTIONS)[number];
