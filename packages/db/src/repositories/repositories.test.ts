import type { WorkspaceRecord } from "@pc/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MongoConnection } from "../client";
import { typedCollections, type TypedCollections } from "../collections";
import { AccessDeniedError, InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { closeTestDb, openTestDb } from "../testing";
import { createRepositories, type Repositories } from "./index";

/** ada owns the "Biology 101" team workspace; ben is an editor there, cy a viewer; dee is outside. */
const as = (userId: string): AccessContext => ({
  actor: { kind: "user", userId, email: `${userId}@example.com` },
});
const guest = (shareLink?: { token: string; password?: string }): AccessContext => ({
  actor: { kind: "guest", guestId: "guest-1" },
  ...(shareLink ? { shareLink } : {}),
});
const ada = as("ada");
const ben = as("ben");
const cy = as("cy");
const dee = as("dee");

/** "allowed", or the denial reason / invalid-request code the call failed with. */
async function outcome(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "allowed";
  } catch (error) {
    if (error instanceof AccessDeniedError) return error.reason;
    if (error instanceof InvalidRequestError) return error.code;
    throw error;
  }
}

describe("repositories", () => {
  let conn: MongoConnection;
  let c: TypedCollections;
  let repos: Repositories;
  let clock = new Date("2026-09-24T10:00:00.000Z");
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  let adaPersonal: WorkspaceRecord;
  let team: WorkspaceRecord;

  beforeAll(async () => {
    conn = await openTestDb("repositories");
    c = typedCollections(conn.db);
    repos = createRepositories(conn, () => clock);
    adaPersonal = await repos.ensurePersonalWorkspace("ada");
    for (const id of ["ben", "cy", "dee"]) await repos.ensurePersonalWorkspace(id);
    team = await repos.workspaces.create(ada, { name: "Biology 101" });
    await repos.workspaces.addMember(ada, team._id, { userId: "ben", role: "editor" });
    await repos.workspaces.addMember(ada, team._id, { userId: "cy", role: "viewer" });
  });

  afterAll(async () => {
    await closeTestDb(conn);
  });

  describe("personal workspaces", () => {
    it("creates exactly one per user, even when sign-ins race", async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, () => repos.ensurePersonalWorkspace("eve")),
      );
      expect(new Set(results.map((w) => w._id)).size).toBe(1);
      expect(await c.workspaces.countDocuments({ ownerId: "eve", personal: true })).toBe(1);
      const members = await c.workspaceMembers.find({ userId: "eve" }).toArray();
      expect(members.map((m) => m.role)).toEqual(["owner"]);
    });

    it("lists the personal workspace first, then team workspaces", async () => {
      const list = await repos.workspaces.listForActor(ada);
      expect(list.map((w) => [w.name, w.personal, w.role])).toEqual([
        ["Personal", true, "owner"],
        ["Biology 101", false, "owner"],
      ]);
    });

    it("can't take members or be deleted", async () => {
      expect(
        await outcome(
          repos.workspaces.addMember(ada, adaPersonal._id, { userId: "ben", role: "editor" }),
        ),
      ).toBe("personal_workspace");
    });
  });

  describe("workspaces", () => {
    it("lets only the owner manage members and rename", async () => {
      expect(
        await outcome(repos.workspaces.addMember(ben, team._id, { userId: "dee", role: "viewer" })),
      ).toBe("role_too_low");
      expect(await outcome(repos.workspaces.rename(ben, team._id, "Mine now"))).toBe(
        "role_too_low",
      );
      await repos.workspaces.rename(ada, team._id, "Biology 101");
    });

    it("hides the workspace from outsiders and guests", async () => {
      expect(await outcome(repos.workspaces.get(dee, team._id))).toBe("no_access");
      expect(await outcome(repos.workspaces.get(guest(), team._id))).toBe("guests_not_allowed");
      expect((await repos.workspaces.get(cy, team._id)).role).toBe("viewer");
    });

    it("protects the owner's membership", async () => {
      expect(await outcome(repos.workspaces.removeMember(ada, team._id, "ada"))).toBe("owner_role");
      expect(await outcome(repos.workspaces.updateMemberRole(ada, team._id, "ada", "viewer"))).toBe(
        "owner_role",
      );
    });

    it("adds, changes and removes members", async () => {
      await repos.workspaces.addMember(ada, team._id, { userId: "gus", role: "commenter" });
      expect(
        await outcome(repos.workspaces.addMember(ada, team._id, { userId: "gus", role: "viewer" })),
      ).toBe("already_member");
      await repos.workspaces.updateMemberRole(ada, team._id, "gus", "editor");
      expect((await repos.workspaces.get(as("gus"), team._id)).role).toBe("editor");
      await repos.workspaces.removeMember(ada, team._id, "gus");
      expect(await outcome(repos.workspaces.get(as("gus"), team._id))).toBe("no_access");
    });
  });

  describe("folders", () => {
    it("creates folders in order and nests them", async () => {
      const a = await repos.folders.create(ben, { workspaceId: team._id, name: "Lectures" });
      const b = await repos.folders.create(ben, { workspaceId: team._id, name: "Labs" });
      const inner = await repos.folders.create(ben, {
        workspaceId: team._id,
        parentId: a._id,
        name: "Week 1",
      });
      const top = await repos.folders.list(cy, team._id);
      expect(top.map((f) => f.name)).toEqual(["Lectures", "Labs"]);
      expect(a.orderKey < b.orderKey).toBe(true);
      expect((await repos.folders.list(cy, team._id, a._id)).map((f) => f._id)).toEqual([
        inner._id,
      ]);
    });

    it("needs an editor to create or change folders", async () => {
      expect(await outcome(repos.folders.create(cy, { workspaceId: team._id, name: "No" }))).toBe(
        "role_too_low",
      );
      const folder = await repos.folders.create(ben, { workspaceId: team._id, name: "Rename me" });
      expect(await outcome(repos.folders.rename(cy, folder._id, "Nope"))).toBe("role_too_low");
      expect(await outcome(repos.folders.rename(dee, folder._id, "Nope"))).toBe("no_access");
      await repos.folders.rename(ben, folder._id, "Renamed");
    });

    it("refuses to move a folder into itself or its own subfolder", async () => {
      const root = await repos.folders.create(ada, { workspaceId: team._id, name: "Root" });
      const child = await repos.folders.create(ada, {
        workspaceId: team._id,
        parentId: root._id,
        name: "Child",
      });
      const grandchild = await repos.folders.create(ada, {
        workspaceId: team._id,
        parentId: child._id,
        name: "Grandchild",
      });
      expect(await outcome(repos.folders.move(ada, root._id, grandchild._id))).toBe("folder_cycle");
      expect(await outcome(repos.folders.move(ada, root._id, root._id))).toBe("folder_cycle");
      await repos.folders.move(ada, grandchild._id, null);
      expect((await c.folders.findOne({ _id: grandchild._id }))?.parentId).toBeNull();
    });

    it("keeps folders inside their workspace", async () => {
      const mine = await repos.folders.create(ada, { workspaceId: adaPersonal._id, name: "Mine" });
      const theirs = await repos.folders.create(ada, { workspaceId: team._id, name: "Team" });
      expect(await outcome(repos.folders.move(ada, theirs._id, mine._id))).toBe("wrong_workspace");
      expect(
        await outcome(
          repos.folders.create(ada, { workspaceId: team._id, parentId: mine._id, name: "X" }),
        ),
      ).toBe("wrong_workspace");
    });

    it("trashes a folder with its subfolders and their documents", async () => {
      const outer = await repos.folders.create(ada, { workspaceId: team._id, name: "Old term" });
      const inner = await repos.folders.create(ada, {
        workspaceId: team._id,
        parentId: outer._id,
        name: "Old week",
      });
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        folderId: inner._id,
        type: "canvas",
        title: "Old board",
      });
      expect(await outcome(repos.folders.trash(cy, outer._id))).toBe("role_too_low");
      expect(await repos.folders.trash(ben, outer._id)).toEqual({ folders: 2, documents: 1 });
      expect((await repos.folders.list(ada, team._id)).map((f) => f._id)).not.toContain(outer._id);
      expect(await outcome(repos.documents.get(ben, doc._id))).toBe("document_deleted");
      expect((await repos.documents.get(ada, doc._id)).deletedBy).toBe("ben");
    });
  });

  describe("documents", () => {
    it("creates a notebook with its pages and an owner grant", async () => {
      const doc = await repos.documents.create(ben, {
        workspaceId: team._id,
        type: "notebook",
        title: "Cell biology notes",
        pageCount: 3,
      });
      expect(doc.pageCount).toBe(3);
      expect(doc.defaultPageSpec?.sizePreset).toBe("a4");
      const pages = await repos.pages.list(cy, doc._id);
      expect(pages).toHaveLength(3);
      expect(pages.map((p) => p.ydocName)).toEqual(pages.map((p) => `page:${p._id}`));
      const keys = pages.map((p) => p.orderKey);
      expect([...keys].sort()).toEqual(keys);
      const grants = await repos.documents.listGrants(ben, doc._id);
      expect(grants.map((g) => [g.principal, g.role])).toEqual([
        [{ kind: "user", userId: "ben" }, "owner"],
      ]);
    });

    it("starts canvases and PDFs with no pages", async () => {
      const board = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "Brainstorm",
      });
      expect(board.pageCount).toBe(0);
      expect(board.defaultPageSpec).toBeNull();
      expect(await c.pages.countDocuments({ documentId: board._id })).toBe(0);
    });

    it("gives members their workspace role on every document", async () => {
      const doc = await repos.documents.create(ben, {
        workspaceId: team._id,
        type: "canvas",
        title: "Roles",
      });
      expect((await repos.documents.get(ada, doc._id)).role).toBe("owner");
      expect((await repos.documents.get(ben, doc._id)).role).toBe("owner");
      expect((await repos.documents.get(cy, doc._id)).role).toBe("viewer");
      expect(await outcome(repos.documents.get(dee, doc._id))).toBe("no_access");
      expect(await outcome(repos.documents.get(ada, newId()))).toBe("not_found");
    });

    it("needs an editor, a signed-in user and a folder in the same workspace", async () => {
      const input = { workspaceId: team._id, type: "canvas", title: "X" } as const;
      expect(await outcome(repos.documents.create(cy, input))).toBe("role_too_low");
      expect(await outcome(repos.documents.create(guest(), input))).toBe("guests_not_allowed");
      const elsewhere = await repos.folders.create(ada, {
        workspaceId: adaPersonal._id,
        name: "Elsewhere",
      });
      expect(
        await outcome(repos.documents.create(ada, { ...input, folderId: elsewhere._id })),
      ).toBe("wrong_folder");
    });

    it("lists by folder and sorts", async () => {
      const ws = await repos.workspaces.create(ada, { name: "Sorting" });
      const folder = await repos.folders.create(ada, { workspaceId: ws._id, name: "F" });
      for (const title of ["Banana", "apple", "Cherry"]) {
        advance(1000);
        await repos.documents.create(ada, { workspaceId: ws._id, type: "canvas", title });
      }
      await repos.documents.create(ada, {
        workspaceId: ws._id,
        folderId: folder._id,
        type: "canvas",
        title: "In folder",
      });
      const top = await repos.documents.list(ada, ws._id, { folderId: null });
      expect(top.map((d) => d.title)).toEqual(["Cherry", "apple", "Banana"]);
      const byCreated = await repos.documents.list(ada, ws._id, { sort: "created", limit: 2 });
      expect(byCreated.map((d) => d.title)).toEqual(["In folder", "Cherry"]);
      const inFolder = await repos.documents.list(ada, ws._id, { folderId: folder._id });
      expect(inFolder.map((d) => d.title)).toEqual(["In folder"]);
      expect(await outcome(repos.documents.list(ben, ws._id))).toBe("no_access");
    });

    it("renames, moves and tags", async () => {
      const doc = await repos.documents.create(ben, {
        workspaceId: team._id,
        type: "canvas",
        title: "Draft",
      });
      await repos.documents.rename(ben, doc._id, "Mitosis diagram");
      const renamed = await repos.documents.get(ben, doc._id);
      expect(renamed.title).toBe("Mitosis diagram");
      expect(renamed.titleTrigrams).toContain("mit");
      expect(await outcome(repos.documents.rename(cy, doc._id, "Nope"))).toBe("role_too_low");

      const folder = await repos.folders.create(ben, { workspaceId: team._id, name: "Diagrams" });
      await repos.documents.move(ben, doc._id, folder._id);
      expect((await repos.documents.get(ben, doc._id)).folderId).toBe(folder._id);

      const tagId = newId();
      await c.tags.insertOne({
        _id: tagId,
        workspaceId: team._id,
        name: "Exam",
        nameKey: "exam",
        color: "#c2410c",
        createdAt: clock,
        updatedAt: clock,
      });
      expect(await outcome(repos.documents.setTags(ben, doc._id, [newId()]))).toBe("unknown_tag");
      await repos.documents.setTags(ben, doc._id, [tagId, tagId]);
      expect((await repos.documents.get(cy, doc._id)).tagIds).toEqual([tagId]);
    });

    it("finds titles by fuzzy search, best match first", async () => {
      const ws = await repos.workspaces.create(ada, { name: "Search" });
      for (const title of ["Photosynthesis lab", "Cell division", "Photography club", "Physics"]) {
        await repos.documents.create(ada, { workspaceId: ws._id, type: "canvas", title });
      }
      const hits = await repos.documents.searchTitles(ada, ws._id, "fotosynthesis");
      expect(hits[0]?.document.title).toBe("Photosynthesis lab");
      expect(hits.map((h) => h.document.title)).not.toContain("Cell division");
      expect(await repos.documents.searchTitles(ada, ws._id, "  ")).toEqual([]);
      expect(await outcome(repos.documents.searchTitles(dee, ws._id, "photo"))).toBe("no_access");
    });
  });

  describe("sharing", () => {
    it("invites by email before the person has an account", async () => {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "Invite",
      });
      await repos.documents.grant(ada, doc._id, {
        principal: { kind: "email", email: "Dee@Example.com" },
        role: "commenter",
      });
      expect((await repos.documents.get(dee, doc._id)).role).toBe("commenter");
      const shared = await repos.documents.listSharedWithMe(dee);
      expect(shared.map((d) => [d.title, d.role])).toEqual([["Invite", "commenter"]]);
      // Members see team documents in the workspace, not under "Shared with me".
      expect(await repos.documents.listSharedWithMe(ben)).toEqual([]);
    });

    it("updates an existing grant instead of adding another", async () => {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "Regrant",
      });
      const first = await repos.documents.grant(ada, doc._id, {
        principal: { kind: "user", userId: "dee" },
        role: "viewer",
      });
      const second = await repos.documents.grant(ada, doc._id, {
        principal: { kind: "user", userId: "dee" },
        role: "editor",
      });
      expect(second._id).toBe(first._id);
      expect(await c.documentPermissions.countDocuments({ documentId: doc._id })).toBe(2);
      expect((await repos.documents.get(dee, doc._id)).role).toBe("editor");
    });

    it("expires timed grants", async () => {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "Timed",
      });
      await repos.documents.grant(ada, doc._id, {
        principal: { kind: "user", userId: "fay" },
        role: "viewer",
        expiresAt: new Date(clock.getTime() + 3_600_000),
      });
      expect((await repos.documents.get(as("fay"), doc._id)).role).toBe("viewer");
      advance(2 * 3_600_000);
      expect(await outcome(repos.documents.get(as("fay"), doc._id))).toBe("grant_expired");
      expect(await repos.documents.listSharedWithMe(as("fay"))).toEqual([]);
    });

    it("lets editors share only when the owner allows it, and never touch owners", async () => {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "Delegated",
      });
      const invite = { principal: { kind: "user", userId: "dee" }, role: "viewer" } as const;
      expect(await outcome(repos.documents.grant(ben, doc._id, invite))).toBe(
        "sharing_not_allowed",
      );
      expect(await outcome(repos.documents.grant(cy, doc._id, invite))).toBe("role_too_low");
      expect(await outcome(repos.documents.setEditorsCanShare(ben, doc._id, true))).toBe(
        "sharing_not_allowed",
      );

      await repos.documents.setEditorsCanShare(ada, doc._id, true);
      await repos.documents.grant(ben, doc._id, invite);
      expect(await outcome(repos.documents.grant(ben, doc._id, { ...invite, role: "owner" }))).toBe(
        "owner_only",
      );
      expect(await outcome(repos.documents.setEditorsCanShare(ben, doc._id, false))).toBe(
        "owner_only",
      );
      const adaGrant = (await repos.documents.listGrants(ben, doc._id)).find(
        (g) => g.role === "owner",
      );
      expect(adaGrant).toBeDefined();
      if (!adaGrant) return;
      expect(await outcome(repos.documents.revokeGrant(ben, doc._id, adaGrant._id))).toBe(
        "owner_only",
      );
      expect(
        await outcome(
          repos.documents.grant(ben, doc._id, { principal: adaGrant.principal, role: "viewer" }),
        ),
      ).toBe("owner_only");
    });

    it("keeps at least one owner grant", async () => {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "Owners",
      });
      const [own] = await repos.documents.listGrants(ada, doc._id);
      if (!own) throw new Error("missing owner grant");
      expect(await outcome(repos.documents.revokeGrant(ada, doc._id, own._id))).toBe("last_owner");
      await repos.documents.grant(ada, doc._id, {
        principal: { kind: "user", userId: "ben" },
        role: "owner",
      });
      await repos.documents.revokeGrant(ada, doc._id, own._id);
      expect(await c.documentPermissions.countDocuments({ documentId: doc._id })).toBe(1);
    });
  });

  describe("share links", () => {
    it("guards a password link and never returns the hash", async () => {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "Secret",
      });
      const link = await repos.documents.createShareLink(ada, doc._id, {
        role: "editor",
        password: "hunter22",
      });
      expect(link.hasPassword).toBe(true);
      expect(link).not.toHaveProperty("passwordHash");
      expect(link.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      const [listed] = await repos.documents.listShareLinks(ada, doc._id);
      expect(listed).not.toHaveProperty("passwordHash");

      const { token } = link;
      expect(await outcome(repos.documents.get(guest({ token }), doc._id))).toBe(
        "link_password_required",
      );
      expect(await outcome(repos.documents.get(guest({ token, password: "wrong" }), doc._id))).toBe(
        "link_password_required",
      );
      const viaLink = guest({ token, password: "hunter22" });
      expect((await repos.documents.get(viaLink, doc._id)).role).toBe("editor");
      await repos.documents.rename(viaLink, doc._id, "Edited by a guest");
      expect(await outcome(repos.documents.trash(viaLink, doc._id))).toBe("guests_not_allowed");
      expect(
        await outcome(repos.documents.createShareLink(viaLink, doc._id, { role: "viewer" })),
      ).toBe("guests_not_allowed");
      expect(
        await outcome(
          repos.documents.createShareLink(ada, doc._id, { role: "viewer", password: "x" }),
        ),
      ).toBe("weak_password");
    });

    it("can require sign-in, expire and be revoked", async () => {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "Linked",
      });
      const signIn = await repos.documents.createShareLink(ada, doc._id, {
        role: "commenter",
        requireSignIn: true,
      });
      expect(await outcome(repos.documents.get(guest({ token: signIn.token }), doc._id))).toBe(
        "sign_in_required",
      );
      expect(
        (await repos.documents.get({ ...dee, shareLink: { token: signIn.token } }, doc._id)).role,
      ).toBe("commenter");

      const timed = await repos.documents.createShareLink(ada, doc._id, {
        role: "viewer",
        expiresAt: new Date(clock.getTime() + 60_000),
      });
      expect(await outcome(repos.documents.get(guest({ token: timed.token }), doc._id))).toBe(
        "allowed",
      );
      advance(120_000);
      expect(await outcome(repos.documents.get(guest({ token: timed.token }), doc._id))).toBe(
        "link_expired",
      );

      const open = await repos.documents.createShareLink(ada, doc._id, { role: "viewer" });
      expect(await outcome(repos.documents.revokeShareLink(ben, doc._id, open._id))).toBe(
        "sharing_not_allowed",
      );
      await repos.documents.revokeShareLink(ada, doc._id, open._id);
      expect(await outcome(repos.documents.get(guest({ token: open.token }), doc._id))).toBe(
        "link_revoked",
      );
    });

    it("only opens the document it was made for", async () => {
      const a = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "A",
      });
      const b = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "canvas",
        title: "B",
      });
      const link = await repos.documents.createShareLink(ada, a._id, { role: "viewer" });
      expect(await outcome(repos.documents.get(guest({ token: link.token }), b._id))).toBe(
        "no_access",
      );
    });
  });

  describe("trash", () => {
    it("lets owners trash, list, restore and purge", async () => {
      const doc = await repos.documents.create(ben, {
        workspaceId: team._id,
        type: "canvas",
        title: "Scratch",
      });
      expect(await outcome(repos.documents.purge(ben, doc._id))).toBe("not_in_trash");
      expect(await outcome(repos.documents.trash(cy, doc._id))).toBe("role_too_low");
      await repos.documents.trash(ben, doc._id);

      expect(await outcome(repos.documents.get(cy, doc._id))).toBe("document_deleted");
      expect(await outcome(repos.documents.rename(ben, doc._id, "x"))).toBe("document_deleted");
      expect((await repos.documents.listTrash(ben, team._id)).map((d) => d._id)).toContain(doc._id);
      expect(await repos.documents.listTrash(cy, team._id)).toEqual([]);
      expect((await repos.documents.list(ada, team._id)).map((d) => d._id)).not.toContain(doc._id);

      await repos.documents.restore(ben, doc._id);
      expect((await repos.documents.get(cy, doc._id)).deletedAt).toBeNull();
    });

    it("restores to the top level when the folder is gone", async () => {
      const folder = await repos.folders.create(ada, { workspaceId: team._id, name: "Temporary" });
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        folderId: folder._id,
        type: "canvas",
        title: "Survivor",
      });
      await repos.folders.trash(ada, folder._id);
      await repos.documents.restore(ada, doc._id);
      const restored = await repos.documents.get(ada, doc._id);
      expect(restored.folderId).toBeNull();
      expect(restored.deletedAt).toBeNull();
    });

    it("purges the document and everything that belongs to it", async () => {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "notebook",
        title: "Doomed",
        pageCount: 2,
      });
      const [page] = await repos.pages.list(ada, doc._id);
      if (!page) throw new Error("missing page");
      await repos.documents.grant(ada, doc._id, {
        principal: { kind: "email", email: "x@example.com" },
        role: "viewer",
      });
      await repos.documents.createShareLink(ada, doc._id, { role: "viewer" });
      await c.comments.insertOne({
        _id: newId(),
        documentId: doc._id,
        pageId: page._id,
        anchor: { kind: "point", x: 10, y: 10 },
        threadId: newId(),
        authorId: "ada",
        body: "Hi",
        resolvedAt: null,
        resolvedBy: null,
        createdAt: clock,
        updatedAt: clock,
        deletedAt: null,
      });
      await c.yjsUpdates.insertOne({
        _id: newId(),
        docName: page.ydocName,
        documentId: doc._id,
        seq: 0,
        update: new Uint8Array([1, 2, 3]),
        createdAt: clock,
      });
      await c.activity.insertOne({
        _id: newId(),
        documentId: doc._id,
        actorId: "ada",
        verb: "created",
        payload: {},
        createdAt: clock,
      });

      await repos.documents.trash(ada, doc._id);
      expect(await outcome(repos.documents.purge(ben, doc._id))).toBe("document_deleted");
      await repos.documents.purge(ada, doc._id);

      const byDoc = { documentId: doc._id };
      const left = await Promise.all([
        c.documents.countDocuments({ _id: doc._id }),
        c.pages.countDocuments(byDoc),
        c.documentPermissions.countDocuments(byDoc),
        c.shareLinks.countDocuments(byDoc),
        c.comments.countDocuments(byDoc),
        c.yjsUpdates.countDocuments(byDoc),
        c.activity.countDocuments(byDoc),
      ]);
      expect(left).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });
  });

  describe("pages", () => {
    async function notebook(pages: number) {
      const doc = await repos.documents.create(ada, {
        workspaceId: team._id,
        type: "notebook",
        title: "Pages",
        pageCount: pages,
      });
      return { doc, ids: (await repos.pages.list(ada, doc._id)).map((p) => p._id) };
    }
    const order = async (documentId: string) =>
      (await repos.pages.list(ada, documentId)).map((p) => p._id);

    it("inserts after a page or at the start and counts pages", async () => {
      const { doc, ids } = await notebook(3);
      const [p1, p2, p3] = ids;
      const middle = await repos.pages.insert(ben, doc._id, { afterPageId: p1 ?? null });
      const first = await repos.pages.insert(ben, doc._id, { afterPageId: null });
      expect(await order(doc._id)).toEqual([first._id, p1, middle._id, p2, p3]);
      expect((await repos.documents.get(ada, doc._id)).pageCount).toBe(5);
      expect(middle.widthPt).toBe(doc.defaultPageSpec?.widthPt);
      expect(await outcome(repos.pages.insert(cy, doc._id, { afterPageId: null }))).toBe(
        "role_too_low",
      );
      expect(await outcome(repos.pages.insert(ben, doc._id, { afterPageId: newId() }))).toBe(
        "not_found",
      );
    });

    it("moves pages", async () => {
      const { doc, ids } = await notebook(3);
      const [p1, p2, p3] = ids;
      if (!p1 || !p2 || !p3) throw new Error("missing pages");
      await repos.pages.move(ben, doc._id, p3, null);
      expect(await order(doc._id)).toEqual([p3, p1, p2]);
      await repos.pages.move(ben, doc._id, p3, p2);
      expect(await order(doc._id)).toEqual([p1, p2, p3]);
      await repos.pages.move(ben, doc._id, p1, p2);
      expect(await order(doc._id)).toEqual([p2, p1, p3]);
      expect(await outcome(repos.pages.move(ben, doc._id, p1, p1))).toBe("invalid_move");
    });

    it("places a page after tied keys from concurrent inserts", async () => {
      const { doc, ids } = await notebook(3);
      const [p1, p2, p3] = ids;
      if (!p1 || !p2 || !p3) throw new Error("missing pages");
      const k1 = (await c.pages.findOne({ _id: p1 }))?.orderKey ?? "";
      await c.pages.updateOne({ _id: p2 }, { $set: { orderKey: k1 } });
      const added = await repos.pages.insert(ada, doc._id, { afterPageId: p1 });
      const k3 = (await c.pages.findOne({ _id: p3 }))?.orderKey ?? "";
      expect(added.orderKey > k1 && added.orderKey < k3).toBe(true);
      expect((await order(doc._id)).slice(2)).toEqual([added._id, p3]);
    });

    it("removes pages once", async () => {
      const { doc, ids } = await notebook(2);
      const [p1, p2] = ids;
      if (!p1 || !p2) throw new Error("missing pages");
      await repos.pages.remove(ben, doc._id, p1);
      await repos.pages.remove(ben, doc._id, p1).catch(() => undefined);
      expect(await order(doc._id)).toEqual([p2]);
      expect((await repos.documents.get(ada, doc._id)).pageCount).toBe(1);
    });

    it("lets only owners lock, and keeps editors off locked pages", async () => {
      const { doc, ids } = await notebook(2);
      const [p1, p2] = ids;
      if (!p1 || !p2) throw new Error("missing pages");
      expect(await outcome(repos.pages.setLocked(ben, doc._id, p1, true))).toBe("role_too_low");
      await repos.pages.setLocked(ada, doc._id, p1, true);
      expect((await c.pages.findOne({ _id: p1 }))?.lockedBy).toBe("ada");
      expect(await outcome(repos.pages.move(ben, doc._id, p1, p2))).toBe("page_locked");
      expect(await outcome(repos.pages.remove(ben, doc._id, p1))).toBe("page_locked");
      await repos.pages.move(ada, doc._id, p1, p2);
      await repos.pages.setLocked(ada, doc._id, p1, false);
      await repos.pages.move(ben, doc._id, p1, null);
      expect(await order(doc._id)).toEqual([p1, p2]);
    });
  });
});
