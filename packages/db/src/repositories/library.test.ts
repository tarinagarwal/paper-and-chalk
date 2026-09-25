import { createHash, randomBytes } from "node:crypto";

import {
  EMPTY_FILTERS,
  type DocumentRecord,
  type LibraryFilters,
  type LibraryQuery,
  type LibraryScope,
  type LibrarySort,
  type SortDir,
  type WorkspaceRecord,
} from "@pc/schema";
import type { Storage } from "@pc/storage";
import { testStorage } from "@pc/storage/testing";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MongoConnection } from "../client";
import { typedCollections, type TypedCollections } from "../collections";
import { AccessDeniedError, InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { closeTestDb, openTestDb } from "../testing";
import { copyTitle } from "./documents";
import { createFileRepositories, createRepositories, type Repositories } from "./index";

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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("library", () => {
  let conn: MongoConnection;
  let c: TypedCollections;
  let repos: Repositories;
  let files: ReturnType<typeof createFileRepositories>;
  let storage: Storage;
  let clock = new Date("2026-09-25T10:00:00.000Z");
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };

  /** Real Better Auth-style users (ObjectId ids) so owner names resolve. */
  const people = {
    olga: { name: "Olga", id: new ObjectId().toHexString() },
    ed: { name: "Ed", id: new ObjectId().toHexString() },
    vi: { name: "Vi", id: new ObjectId().toHexString() },
    out: { name: "Otto", id: new ObjectId().toHexString() },
  };
  const as = (person: keyof typeof people): AccessContext => ({
    actor: { kind: "user", userId: people[person].id, email: `${person}@example.com` },
  });
  const olga = as("olga");
  const ed = as("ed");
  const vi = as("vi");
  const out = as("out");

  let team: WorkspaceRecord;

  async function query(
    ctx: AccessContext,
    scope: LibraryScope,
    options: {
      sort?: LibrarySort;
      dir?: SortDir;
      filters?: Partial<LibraryFilters>;
      cursor?: string | null;
      limit?: number;
    } = {},
  ) {
    const input: LibraryQuery = {
      scope,
      sort: options.sort ?? "modified",
      dir: options.dir ?? "desc",
      filters: { ...EMPTY_FILTERS, ...options.filters },
      cursor: options.cursor ?? null,
      limit: options.limit ?? 60,
    };
    return repos.library.query(ctx, input);
  }

  const titles = async (ctx: AccessContext, scope: LibraryScope, options = {}) =>
    (await query(ctx, scope, options)).items.map((i) => i.document.title);

  /** Walks every page and returns the titles in order. */
  async function walk(
    ctx: AccessContext,
    scope: LibraryScope,
    options: { sort?: LibrarySort; dir?: SortDir; limit?: number } = {},
  ) {
    const seen: string[] = [];
    let cursor: string | null = null;
    let first = true;
    for (let guard = 0; guard < 100; guard++) {
      const page = await query(ctx, scope, { ...options, cursor });
      if (first) expect(page.total).not.toBeNull();
      else expect(page.total).toBeNull();
      first = false;
      seen.push(...page.items.map((i) => i.document.title));
      if (!page.nextCursor) return seen;
      cursor = page.nextCursor;
    }
    throw new Error("paging did not end");
  }

  async function doc(
    ctx: AccessContext,
    title: string,
    options: {
      workspace?: WorkspaceRecord;
      folderId?: string | null;
      type?: DocumentRecord["type"];
      bytes?: number;
    } = {},
  ) {
    advance(60_000);
    const created = await repos.documents.create(ctx, {
      workspaceId: (options.workspace ?? team)._id,
      folderId: options.folderId ?? null,
      type: options.type ?? "canvas",
      title,
    });
    if (options.bytes !== undefined) {
      await c.documents.updateOne({ _id: created._id }, { $set: { bytes: options.bytes } });
    }
    return created;
  }

  beforeAll(async () => {
    conn = await openTestDb("library");
    c = typedCollections(conn.db);
    repos = createRepositories(conn, () => clock);
    storage = testStorage();
    files = createFileRepositories(conn, storage, () => clock);
    for (const person of Object.values(people)) {
      await c.users.insertOne({
        _id: ObjectId.createFromHexString(person.id),
        name: person.name,
        email: `${person.name.toLowerCase()}@example.com`,
        emailVerified: true,
        createdAt: clock,
        updatedAt: clock,
        plan: "free",
        storageUsedBytes: 0,
        settings: "{}",
      });
      await repos.ensurePersonalWorkspace(person.id);
    }
    team = await repos.workspaces.create(olga, { name: "Team" });
    await repos.workspaces.addMember(olga, team._id, { userId: people.ed.id, role: "editor" });
    await repos.workspaces.addMember(olga, team._id, { userId: people.vi.id, role: "viewer" });
  });

  afterAll(async () => {
    await closeTestDb(conn);
  });

  describe("sorting and paging a big view", () => {
    let ws: WorkspaceRecord;
    const home = () => ({ kind: "home", workspaceId: ws._id }) as const;

    beforeAll(async () => {
      ws = await repos.workspaces.create(olga, { name: "Sorting" });
      await doc(olga, "Lecture 10", { workspace: ws, bytes: 500 });
      await doc(olga, "lecture 9", { workspace: ws, bytes: 20 });
      await doc(olga, "Apple", { workspace: ws, bytes: 500 });
      await doc(olga, "Émile", { workspace: ws, bytes: 7 });
      await doc(olga, "zebra", { workspace: ws, bytes: 0 });
    });

    it("sorts by modified, created, name and size, both ways", async () => {
      expect(await titles(olga, home())).toEqual([
        "zebra",
        "Émile",
        "Apple",
        "lecture 9",
        "Lecture 10",
      ]);
      expect(await titles(olga, home(), { sort: "created", dir: "asc" })).toEqual([
        "Lecture 10",
        "lecture 9",
        "Apple",
        "Émile",
        "zebra",
      ]);
      expect(await titles(olga, home(), { sort: "name", dir: "asc" })).toEqual([
        "Apple",
        "Émile",
        "lecture 9",
        "Lecture 10",
        "zebra",
      ]);
      // Equal sizes fall back to id order (newest first when descending).
      expect(await titles(olga, home(), { sort: "size" })).toEqual([
        "Apple",
        "Lecture 10",
        "lecture 9",
        "Émile",
        "zebra",
      ]);
    });

    it("pages through every sort without gaps or repeats", async () => {
      for (const sort of ["modified", "created", "name", "size"] as const) {
        for (const dir of ["asc", "desc"] as const) {
          const all = await titles(olga, home(), { sort, dir, limit: 100 });
          expect(await walk(olga, home(), { sort, dir, limit: 2 }), `${sort} ${dir}`).toEqual(all);
        }
      }
    });

    it("reports the total on the first page", async () => {
      const page = await query(olga, home(), { limit: 2 });
      expect(page.total).toBe(5);
      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });

    it("refuses a cursor it did not make", async () => {
      expect(await outcome(query(olga, home(), { cursor: "not-a-cursor" }))).toBe("bad_cursor");
    });

    it("puts opened documents first for 'last opened', then the rest by modified", async () => {
      const all = await query(olga, home(), { limit: 100 });
      const byTitle = new Map(all.items.map((i) => [i.document.title, i.document._id]));
      for (const title of ["Apple", "lecture 9", "Émile"]) {
        advance(HOUR);
        await repos.documents.recordOpen(olga, byTitle.get(title) ?? "");
      }
      const expected = ["Émile", "lecture 9", "Apple", "zebra", "Lecture 10"];
      expect(await titles(olga, home(), { sort: "lastOpened" })).toEqual(expected);
      for (const limit of [1, 2, 3, 4]) {
        expect(
          await walk(olga, home(), { sort: "lastOpened", limit }),
          `limit ${String(limit)}`,
        ).toEqual(expected);
      }
      // Someone else's opens do not change Olga's order.
      await repos.workspaces.addMember(olga, ws._id, { userId: people.ed.id, role: "viewer" });
      await repos.documents.recordOpen(ed, byTitle.get("zebra") ?? "");
      expect(await titles(olga, home(), { sort: "lastOpened" })).toEqual(expected);
    });
  });

  describe("scopes and filters", () => {
    it("scopes to a folder or a tag, and filters by type, owner, tags and sharing", async () => {
      const folder = await repos.folders.create(olga, { workspaceId: team._id, name: "Biology" });
      const cells = await doc(olga, "Cells", { folderId: folder._id, type: "notebook" });
      const plants = await doc(ed, "Plants", { folderId: folder._id, type: "pdf" });
      const loose = await doc(ed, "Loose notes", { type: "notebook" });
      const exam = await repos.tags.create(olga, {
        workspaceId: team._id,
        name: "Exam",
        color: "#c43e18",
      });
      const review = await repos.tags.create(ed, {
        workspaceId: team._id,
        name: "Review",
        color: "#2f5d8a",
      });
      await repos.documents.changeTags(olga, cells._id, { add: [exam._id, review._id] });
      await repos.documents.changeTags(ed, plants._id, { add: [exam._id] });
      await repos.documents.changeTags(ed, loose._id, { add: [exam._id] });
      await repos.documents.grant(ed, plants._id, {
        principal: { kind: "email", email: "friend@example.com" },
        role: "viewer",
      });

      const inFolder = { kind: "folder", folderId: folder._id } as const;
      expect(await titles(vi, inFolder)).toEqual(["Plants", "Cells"]);
      expect(await titles(vi, { kind: "tag", tagId: exam._id })).toEqual([
        "Loose notes",
        "Plants",
        "Cells",
      ]);
      const home = { kind: "home", workspaceId: team._id } as const;
      expect(await titles(vi, home, { filters: { types: ["notebook"] } })).toEqual([
        "Loose notes",
        "Cells",
      ]);
      expect(await titles(ed, inFolder, { filters: { owner: "me" } })).toEqual(["Plants"]);
      expect(await titles(ed, inFolder, { filters: { owner: "others" } })).toEqual(["Cells"]);
      expect(await titles(vi, home, { filters: { tagIds: [exam._id, review._id] } })).toEqual([
        "Cells",
      ]);
      expect(await titles(vi, inFolder, { filters: { shared: "shared" } })).toEqual(["Plants"]);
      expect(await titles(vi, inFolder, { filters: { shared: "private" } })).toEqual(["Cells"]);

      expect(await outcome(query(out, inFolder))).toBe("no_access");
      expect(await outcome(query(out, home))).toBe("no_access");
      expect(await outcome(query(out, { kind: "tag", tagId: exam._id }))).toBe("no_access");
    });

    it("finds titles by fuzzy search, best match first, with filters", async () => {
      const ws = await repos.workspaces.create(olga, { name: "Search" });
      for (const title of ["Photosynthesis lab", "Cell division", "Photography club", "Physics"]) {
        await doc(olga, title, { workspace: ws });
      }
      const search = (q: string) => ({ kind: "search", workspaceId: ws._id, q }) as const;
      const hits = await titles(olga, search("fotosynthesis"), { sort: "relevance" });
      expect(hits[0]).toBe("Photosynthesis lab");
      expect(hits).not.toContain("Cell division");
      expect(await titles(olga, search("photo"), { filters: { owner: "others" } })).toEqual([]);
      expect(await titles(olga, search("  !! "), { sort: "relevance" })).toEqual([]);
      expect(await outcome(query(out, search("photo")))).toBe("no_access");
    });

    it("says what the user may do and who owns each document", async () => {
      const mine = await doc(ed, "Ed's draft");
      const [asEd] = (await query(ed, { kind: "search", workspaceId: team._id, q: "draft" })).items;
      expect(asEd?.owner).toEqual({ id: people.ed.id, name: "Ed" });
      // Ed created it, so Ed owns it; Vi only views.
      expect(asEd?.role).toBe("owner");
      expect(asEd?.can).toEqual({
        edit: true,
        delete: true,
        restore: false,
        purge: false,
        duplicate: true,
      });
      const [asVi] = (await query(vi, { kind: "search", workspaceId: team._id, q: "draft" })).items;
      expect(asVi?.document._id).toBe(mine._id);
      expect(asVi?.role).toBe("viewer");
      expect(asVi?.can).toEqual({
        edit: false,
        delete: false,
        restore: false,
        purge: false,
        duplicate: true,
      });
    });
  });

  describe("per-user views", () => {
    it("keeps favourites and recents per user, across workspaces", async () => {
      const personal = await c.workspaces.findOne({ ownerId: people.ed.id, personal: true });
      if (!personal) throw new Error("no personal workspace");
      const a = await doc(ed, "Team doc");
      const b = await doc(ed, "Private doc", { workspace: personal });
      await repos.documents.setFavourite(ed, a._id, true);
      advance(1000);
      await repos.documents.setFavourite(ed, b._id, true);
      await repos.documents.recordOpen(ed, b._id);
      advance(1000);
      await repos.documents.recordOpen(ed, a._id);

      const favourites = await query(ed, { kind: "favourites" });
      expect(favourites.items.map((i) => i.document.title).sort()).toEqual([
        "Private doc",
        "Team doc",
      ]);
      expect(favourites.items.every((i) => i.favourite)).toBe(true);
      expect(await titles(vi, { kind: "favourites" })).toEqual([]);
      const recents = await query(ed, { kind: "recents" }, { sort: "lastOpened" });
      // Ed opened "zebra" in the sorting tests, before these two.
      expect(recents.items.map((i) => i.document.title)).toEqual([
        "Team doc",
        "Private doc",
        "zebra",
      ]);
      expect(recents.items[0]?.lastOpenedAt).toEqual(clock);

      await repos.documents.setFavourite(ed, a._id, false);
      expect(await titles(ed, { kind: "favourites" })).toEqual(["Private doc"]);
      // Trashed documents drop out; so does anything the user can no longer see.
      await repos.documents.trash(ed, b._id);
      expect(await titles(ed, { kind: "recents" }, { sort: "lastOpened" })).toEqual([
        "Team doc",
        "zebra",
      ]);
      await repos.documents.recordOpen(vi, a._id);
      await repos.workspaces.removeMember(olga, team._id, people.vi.id);
      expect(await titles(vi, { kind: "recents" }, { sort: "lastOpened" })).toEqual([]);
      await repos.workspaces.addMember(olga, team._id, { userId: people.vi.id, role: "viewer" });
      expect(await outcome(repos.documents.setFavourite(ed, b._id, true))).toBe("document_deleted");
    });

    it("lists documents shared with the user outside their workspaces", async () => {
      const olgaHome = await c.workspaces.findOne({ ownerId: people.olga.id, personal: true });
      if (!olgaHome) throw new Error("no personal workspace");
      const lent = await doc(olga, "Lent to Otto", { workspace: olgaHome });
      expect(lent.isShared).toBe(false);
      const grant = await repos.documents.grant(olga, lent._id, {
        principal: { kind: "user", userId: people.out.id },
        role: "commenter",
      });
      expect((await c.documents.findOne({ _id: lent._id }))?.isShared).toBe(true);
      const shared = await query(out, { kind: "shared" });
      expect(shared.items.map((i) => [i.document.title, i.role])).toEqual([
        ["Lent to Otto", "commenter"],
      ]);
      // Ed shares a team document with Vi, who is already a team member: not "shared with me".
      const teamDoc = await doc(ed, "Team only");
      await repos.documents.grant(ed, teamDoc._id, {
        principal: { kind: "user", userId: people.vi.id },
        role: "editor",
      });
      expect(await titles(vi, { kind: "shared" })).not.toContain("Team only");

      await repos.documents.revokeGrant(olga, lent._id, grant._id);
      expect((await c.documents.findOne({ _id: lent._id }))?.isShared).toBe(false);
      expect(await titles(out, { kind: "shared" })).toEqual([]);
      const link = await repos.documents.createShareLink(olga, lent._id, { role: "viewer" });
      expect((await c.documents.findOne({ _id: lent._id }))?.isShared).toBe(true);
      await repos.documents.revokeShareLink(olga, lent._id, link._id);
      expect((await c.documents.findOne({ _id: lent._id }))?.isShared).toBe(false);
    });

    it("shows the trash only to people who may restore", async () => {
      const ws = await repos.workspaces.create(olga, { name: "Trash view" });
      await repos.workspaces.addMember(olga, ws._id, { userId: people.ed.id, role: "editor" });
      const byOlga = await doc(olga, "By Olga", { workspace: ws });
      const byEd = await doc(ed, "By Ed", { workspace: ws });
      await repos.documents.trash(olga, byOlga._id);
      await repos.documents.trash(ed, byEd._id);
      const trash = { kind: "trash", workspaceId: ws._id } as const;
      // The workspace owner owns everything in it; Ed owns only what he made.
      expect((await titles(olga, trash)).sort()).toEqual(["By Ed", "By Olga"]);
      expect(await titles(ed, trash)).toEqual(["By Ed"]);
      const [item] = (await query(ed, trash)).items;
      expect(item?.can).toMatchObject({ restore: true, purge: true, edit: false });
      expect(await titles(olga, { kind: "home", workspaceId: ws._id })).toEqual([]);
    });
  });

  describe("documents", () => {
    it("duplicates into the same folder with its tags and pages, but not its sharing", async () => {
      const folder = await repos.folders.create(olga, { workspaceId: team._id, name: "Copies" });
      const source = await repos.documents.create(olga, {
        workspaceId: team._id,
        folderId: folder._id,
        type: "notebook",
        title: "Original",
        pageCount: 3,
      });
      const tag = await repos.tags.create(olga, {
        workspaceId: team._id,
        name: "Kept",
        color: "#5b7a3a",
      });
      await repos.documents.changeTags(olga, source._id, { add: [tag._id] });
      await repos.documents.createShareLink(olga, source._id, { role: "viewer" });

      const copy = await repos.documents.duplicate(ed, source._id);
      expect(copy).toMatchObject({
        title: "Original (copy)",
        workspaceId: team._id,
        folderId: folder._id,
        tagIds: [tag._id],
        pageCount: 3,
        isShared: false,
        createdBy: people.ed.id,
      });
      const [sourcePages, copyPages] = await Promise.all([
        repos.pages.list(olga, source._id),
        repos.pages.list(ed, copy._id),
      ]);
      expect(copyPages).toHaveLength(3);
      expect(copyPages.map((p) => p.orderKey)).toEqual(sourcePages.map((p) => p.orderKey));
      expect(copyPages.map((p) => p._id)).not.toEqual(sourcePages.map((p) => p._id));
      expect(copyPages[0]?.ydocName).toBe(`page:${copyPages[0]?._id ?? ""}`);
      expect(await c.shareLinks.countDocuments({ documentId: copy._id })).toBe(0);

      // A viewer cannot add to the team, so their copy goes to their own workspace.
      const viCopy = await repos.documents.duplicate(vi, source._id);
      const viHome = await c.workspaces.findOne({ ownerId: people.vi.id, personal: true });
      expect(viCopy).toMatchObject({ workspaceId: viHome?._id, folderId: null, tagIds: [] });

      await repos.documents.trash(olga, source._id);
      expect(await outcome(repos.documents.duplicate(olga, source._id))).toBe("document_deleted");
      expect(copyTitle("x".repeat(200))).toHaveLength(200);
    });

    it("adds and removes tags without touching the others", async () => {
      const d = await doc(ed, "Tagged");
      const [a, b] = await Promise.all(
        ["Alpha", "Beta"].map((name) =>
          repos.tags.create(ed, { workspaceId: team._id, name, color: "#6b4fa0" }),
        ),
      );
      if (!a || !b) throw new Error("tags");
      await Promise.all([
        repos.documents.changeTags(ed, d._id, { add: [a._id] }),
        repos.documents.changeTags(ed, d._id, { add: [b._id] }),
      ]);
      expect((await c.documents.findOne({ _id: d._id }))?.tagIds.sort()).toEqual(
        [a._id, b._id].sort(),
      );
      await repos.documents.changeTags(ed, d._id, { remove: [a._id] });
      expect((await c.documents.findOne({ _id: d._id }))?.tagIds).toEqual([b._id]);
      expect(await outcome(repos.documents.changeTags(vi, d._id, { add: [a._id] }))).toBe(
        "role_too_low",
      );
      expect(await outcome(repos.documents.changeTags(ed, d._id, { add: [newId()] }))).toBe(
        "unknown_tag",
      );
    });
  });

  describe("tags", () => {
    it("creates, renames and deletes tags, cleaning up documents and smart folders", async () => {
      const ws = await repos.workspaces.create(olga, { name: "Tags" });
      await repos.workspaces.addMember(olga, ws._id, { userId: people.vi.id, role: "viewer" });
      const tag = await repos.tags.create(olga, {
        workspaceId: ws._id,
        name: "Urgent",
        color: "#c43e18",
      });
      expect(
        await outcome(
          repos.tags.create(olga, { workspaceId: ws._id, name: " urgent ", color: "#000" }),
        ),
      ).toBe("tag_exists");
      expect(
        await outcome(repos.tags.create(vi, { workspaceId: ws._id, name: "Mine", color: "#000" })),
      ).toBe("role_too_low");
      const renamed = await repos.tags.update(olga, tag._id, { name: "Soon", color: "#2f5d8a" });
      expect(renamed).toMatchObject({ name: "Soon", nameKey: "soon", color: "#2f5d8a" });
      expect((await repos.tags.list(vi, ws._id)).map((t) => t.name)).toEqual(["Soon"]);

      const d = await doc(olga, "Uses tag", { workspace: ws });
      await repos.documents.changeTags(olga, d._id, { add: [tag._id] });
      const smart = await repos.smartFolders.create(olga, {
        workspaceId: ws._id,
        name: "Soon",
        filters: { ...EMPTY_FILTERS, tagIds: [tag._id] },
        sort: "modified",
        dir: "desc",
      });
      await repos.tags.delete(olga, tag._id);
      expect((await c.documents.findOne({ _id: d._id }))?.tagIds).toEqual([]);
      expect((await repos.smartFolders.get(olga, smart._id)).filters.tagIds).toEqual([]);
      expect(await repos.tags.list(olga, ws._id)).toEqual([]);
    });
  });

  describe("smart folders", () => {
    it("are private to the user who saved them", async () => {
      const smart = await repos.smartFolders.create(ed, {
        workspaceId: team._id,
        name: "My PDFs",
        filters: { ...EMPTY_FILTERS, types: ["pdf"], owner: "me" },
        sort: "name",
        dir: "asc",
      });
      await repos.smartFolders.create(ed, {
        workspaceId: team._id,
        name: "Second",
        filters: EMPTY_FILTERS,
        sort: "modified",
        dir: "desc",
      });
      expect((await repos.smartFolders.list(ed, team._id)).map((s) => s.name)).toEqual([
        "My PDFs",
        "Second",
      ]);
      expect(await repos.smartFolders.list(olga, team._id)).toEqual([]);
      expect(await outcome(repos.smartFolders.get(olga, smart._id))).toBe("not_found");
      expect(await outcome(repos.smartFolders.delete(vi, smart._id))).toBe("not_found");
      expect(await outcome(repos.smartFolders.list(out, team._id))).toBe("no_access");

      const updated = await repos.smartFolders.update(ed, smart._id, {
        name: "PDFs",
        filters: { ...EMPTY_FILTERS, types: ["pdf"] },
      });
      expect(updated).toMatchObject({ name: "PDFs", sort: "name", filters: { owner: "anyone" } });
      await repos.smartFolders.delete(ed, smart._id);
      expect((await repos.smartFolders.list(ed, team._id)).map((s) => s.name)).toEqual(["Second"]);
    });
  });

  describe("folders", () => {
    it("lists the whole tree, updates appearance and reorders or nests by position", async () => {
      const ws = await repos.workspaces.create(olga, { name: "Tree" });
      const a = await repos.folders.create(olga, { workspaceId: ws._id, name: "A" });
      const b = await repos.folders.create(olga, { workspaceId: ws._id, name: "B" });
      const cFolder = await repos.folders.create(olga, { workspaceId: ws._id, name: "C" });
      const names = async () =>
        (await repos.folders.listAll(olga, ws._id))
          .filter((f) => f.parentId === null)
          .map((f) => f.name);
      expect(await names()).toEqual(["A", "B", "C"]);

      await repos.folders.move(olga, cFolder._id, null, a._id);
      expect(await names()).toEqual(["C", "A", "B"]);
      await repos.folders.move(olga, cFolder._id, null, b._id);
      expect(await names()).toEqual(["A", "C", "B"]);
      await repos.folders.move(olga, a._id, null, null);
      expect(await names()).toEqual(["C", "B", "A"]);

      await repos.folders.move(olga, b._id, a._id);
      const all = await repos.folders.listAll(olga, ws._id);
      expect(all.find((f) => f.name === "B")?.parentId).toBe(a._id);
      expect(await outcome(repos.folders.move(olga, a._id, b._id))).toBe("folder_cycle");
      expect(await outcome(repos.folders.move(olga, cFolder._id, null, b._id))).toBe(
        "wrong_folder",
      );

      const updated = await repos.folders.update(olga, a._id, { color: "#2f7d74", icon: "flask" });
      expect(updated).toMatchObject({ name: "A", color: "#2f7d74", icon: "flask" });
      await repos.folders.update(olga, a._id, { icon: null });
      expect((await repos.folders.get(olga, a._id)).icon).toBeNull();
    });
  });

  describe("trash purge", () => {
    /** A real object on S3 (under test/) with an asset record charged to Olga. */
    async function storedFile(documentId: string, workspaceId: string) {
      const bytes = new Uint8Array(randomBytes(256));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const key = storage.key("ws", workspaceId, newId());
      const request = await storage.presignUpload({
        bucket: "assets",
        key,
        contentType: "image/png",
        size: bytes.length,
        sha256Hex: sha256,
      });
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: bytes,
      });
      expect(response.ok).toBe(true);
      await c.assets.insertOne({
        _id: newId(),
        workspaceId,
        documentId,
        kind: "image",
        bucket: "assets",
        key,
        fileName: "a.png",
        bytes: bytes.length,
        mime: "image/png",
        sha256,
        sha256Verified: true,
        status: "ready",
        rejectedReason: null,
        createdBy: people.olga.id,
        chargedTo: people.olga.id,
        createdAt: clock,
        updatedAt: clock,
      });
      await c.users.updateOne(
        { _id: ObjectId.createFromHexString(people.olga.id) },
        { $inc: { storageUsedBytes: bytes.length } },
      );
      return { key, bytes: bytes.length };
    }

    const used = async () =>
      (await c.users.findOne({ _id: ObjectId.createFromHexString(people.olga.id) }))
        ?.storageUsedBytes ?? 0;

    it("deletes for good with the files, and refunds the storage", async () => {
      const d = await doc(olga, "With a file");
      const file = await storedFile(d._id, team._id);
      const before = await used();
      await repos.documents.trash(olga, d._id);
      const result = await files.trash.purge(olga, [d._id, newId()]);
      expect(result.done).toEqual([d._id]);
      expect(result.failed.map((f) => f.error)).toEqual(["not_found"]);
      expect(await storage.head("assets", file.key)).toBeNull();
      expect(await used()).toBe(before - file.bytes);
      expect(await c.documents.countDocuments({ _id: d._id })).toBe(0);
    });

    it("purges what has been in the trash for 30 days, and nothing newer", async () => {
      const ws = await repos.workspaces.create(olga, { name: "Retention" });
      const oldFolder = await repos.folders.create(olga, { workspaceId: ws._id, name: "Old" });
      const old = await doc(olga, "Old", { workspace: ws, folderId: oldFolder._id });
      const file = await storedFile(old._id, ws._id);
      const recent = await doc(olga, "Recent", { workspace: ws });
      const kept = await doc(olga, "Kept", { workspace: ws });
      await repos.folders.trash(olga, oldFolder._id);
      advance(20 * DAY);
      await repos.documents.trash(olga, recent._id);
      advance(10 * DAY + HOUR);

      // Earlier tests left documents in the trash too; they are older still, so they go as well.
      const result = await files.trash.purgeExpired();
      expect(result).toMatchObject({ objectsRemoved: 1, objectsFailed: 0 });
      expect(result.documents).toBeGreaterThanOrEqual(1);
      expect(result.folders).toBeGreaterThanOrEqual(1);
      expect(await c.documents.countDocuments({ _id: old._id })).toBe(0);
      expect(await c.folders.countDocuments({ _id: oldFolder._id })).toBe(0);
      expect(await storage.head("assets", file.key)).toBeNull();
      expect(await c.documents.countDocuments({ _id: { $in: [recent._id, kept._id] } })).toBe(2);
      // Running again finds nothing.
      expect(await files.trash.purgeExpired()).toMatchObject({ documents: 0, folders: 0 });
    });
  });
});
