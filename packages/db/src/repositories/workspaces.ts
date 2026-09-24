import {
  roleSchema,
  workspaceMemberRecordSchema,
  workspaceRecordSchema,
  type Role,
  type WorkspaceMemberRecord,
  type WorkspaceRecord,
} from "@pc/schema";

import { InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { withTransaction } from "../transaction";
import { authorize, requireUser, type RepoContext } from "./context";

export interface WorkspaceWithRole extends WorkspaceRecord {
  role: Role;
}

/** Roles that can be given to members; ownership stays with `ownerId`. */
const assignableRole = roleSchema.exclude(["owner"]);

export function workspacesRepository(r: RepoContext) {
  const { c } = r;

  async function member(workspaceId: string, userId: string) {
    return c.workspaceMembers.findOne({ workspaceId, userId });
  }

  return {
    /** A shared (team) workspace owned by the acting user. */
    async create(ctx: AccessContext, input: { name: string }): Promise<WorkspaceRecord> {
      const user = requireUser(ctx);
      const now = r.now();
      const workspace = workspaceRecordSchema.parse({
        _id: newId(),
        name: input.name,
        ownerId: user.userId,
        plan: "free",
        personal: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      const owner = workspaceMemberRecordSchema.parse({
        _id: newId(),
        workspaceId: workspace._id,
        userId: user.userId,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
      await withTransaction(r.conn.client, async (session) => {
        await c.workspaces.insertOne(workspace, { session });
        await c.workspaceMembers.insertOne(owner, { session });
      });
      return workspace;
    },

    async get(ctx: AccessContext, workspaceId: string): Promise<WorkspaceWithRole> {
      const role = await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      const workspace = await c.workspaces.findOne({ _id: workspaceId });
      if (!workspace) throw new InvalidRequestError("not_found", "Workspace not found");
      return { ...workspace, role };
    },

    /** Every workspace the user belongs to, personal first. */
    async listForActor(ctx: AccessContext): Promise<WorkspaceWithRole[]> {
      const user = requireUser(ctx);
      const memberships = await c.workspaceMembers.find({ userId: user.userId }).toArray();
      const roles = new Map(memberships.map((m) => [m.workspaceId, m.role]));
      const workspaces = await c.workspaces
        .find({ _id: { $in: [...roles.keys()] }, deletedAt: null })
        .toArray();
      return workspaces
        .map((w) => ({ ...w, role: roles.get(w._id) ?? "viewer" }))
        .sort((a, b) => Number(b.personal) - Number(a.personal) || a.name.localeCompare(b.name));
    },

    async rename(ctx: AccessContext, workspaceId: string, name: string): Promise<void> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "rename");
      const parsed = workspaceRecordSchema.shape.name.parse(name);
      await c.workspaces.updateOne(
        { _id: workspaceId },
        { $set: { name: parsed, updatedAt: r.now() } },
      );
    },

    async listMembers(ctx: AccessContext, workspaceId: string): Promise<WorkspaceMemberRecord[]> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "view");
      return c.workspaceMembers.find({ workspaceId }).sort({ createdAt: 1 }).toArray();
    },

    async addMember(
      ctx: AccessContext,
      workspaceId: string,
      input: { userId: string; role: Exclude<Role, "owner"> },
    ): Promise<WorkspaceMemberRecord> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "manageMembers");
      const role = assignableRole.parse(input.role);
      if (await member(workspaceId, input.userId)) {
        throw new InvalidRequestError("already_member", "That person is already a member");
      }
      const now = r.now();
      const record = workspaceMemberRecordSchema.parse({
        _id: newId(),
        workspaceId,
        userId: input.userId,
        role,
        createdAt: now,
        updatedAt: now,
      });
      await c.workspaceMembers.insertOne(record);
      return record;
    },

    async updateMemberRole(
      ctx: AccessContext,
      workspaceId: string,
      userId: string,
      role: Exclude<Role, "owner">,
    ): Promise<void> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "manageMembers");
      const existing = await member(workspaceId, userId);
      if (!existing) throw new InvalidRequestError("not_member", "That person is not a member");
      if (existing.role === "owner") {
        throw new InvalidRequestError("owner_role", "The owner's role can't be changed");
      }
      await c.workspaceMembers.updateOne(
        { _id: existing._id },
        { $set: { role: assignableRole.parse(role), updatedAt: r.now() } },
      );
    },

    async removeMember(ctx: AccessContext, workspaceId: string, userId: string): Promise<void> {
      await authorize(r, ctx, { type: "workspace", workspaceId }, "manageMembers");
      const existing = await member(workspaceId, userId);
      if (!existing) return;
      if (existing.role === "owner") {
        throw new InvalidRequestError("owner_role", "The owner can't be removed");
      }
      await c.workspaceMembers.deleteOne({ _id: existing._id });
    },
  };
}

/**
 * Creates the user's personal workspace and owner membership if they don't exist yet. Safe to call
 * on every sign-in and from several processes at once (a unique index guards the workspace).
 */
export async function ensurePersonalWorkspace(
  r: RepoContext,
  userId: string,
): Promise<WorkspaceRecord> {
  const { c } = r;
  const now = r.now();
  let workspace = await c.workspaces.findOne({ ownerId: userId, personal: true });
  if (!workspace) {
    const candidate = workspaceRecordSchema.parse({
      _id: newId(),
      name: "Personal",
      ownerId: userId,
      plan: "free",
      personal: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    try {
      await c.workspaces.insertOne(candidate);
      workspace = candidate;
    } catch (error) {
      // Lost a race with another sign-in: use the winner's workspace.
      workspace = await c.workspaces.findOne({ ownerId: userId, personal: true });
      if (!workspace) throw error;
    }
  }
  await c.workspaceMembers.updateOne(
    { workspaceId: workspace._id, userId },
    {
      $setOnInsert: workspaceMemberRecordSchema.parse({
        _id: newId(),
        workspaceId: workspace._id,
        userId,
        role: "owner",
        createdAt: now,
        updatedAt: now,
      }),
    },
    { upsert: true },
  );
  return workspace;
}
