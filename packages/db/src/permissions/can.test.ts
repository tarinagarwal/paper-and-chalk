import type { DocumentRecord, PageRecord, WorkspaceRecord } from "@pc/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MongoConnection } from "../client";
import { typedCollections, type TypedCollections } from "../collections";
import { newId } from "../ids";
import { createRepositories, type Repositories } from "../repositories";
import { closeTestDb, openTestDb } from "../testing";
import { can, effectiveRole, type AccessContext } from "./can";

const as = (userId: string, email = `${userId}@example.com`): AccessContext => ({
  actor: { kind: "user", userId, email },
});
const owner = as("olga");
const editor = as("ed");

/** The loader half of `can()`: which facts it reads. The rules themselves are in decide.test.ts. */
describe("can()", () => {
  let conn: MongoConnection;
  let c: TypedCollections;
  let repos: Repositories;
  let workspace: WorkspaceRecord;
  let doc: DocumentRecord;
  let page: PageRecord;

  const reason = async (...args: Parameters<typeof can>) => {
    const decision = await can(...args);
    return decision.allowed ? `allowed:${decision.role}` : decision.reason;
  };

  beforeAll(async () => {
    conn = await openTestDb("can");
    c = typedCollections(conn.db);
    repos = createRepositories(conn);
    workspace = await repos.workspaces.create(owner, { name: "Physics" });
    await repos.workspaces.addMember(owner, workspace._id, { userId: "ed", role: "editor" });
    doc = await repos.documents.create(owner, {
      workspaceId: workspace._id,
      type: "notebook",
      title: "Optics",
      pageCount: 1,
    });
    const [first] = await repos.pages.list(owner, doc._id);
    if (!first) throw new Error("missing page");
    page = first;
  });

  afterAll(async () => {
    await closeTestDb(conn);
  });

  it("reports not_found for things that don't exist", async () => {
    expect(await reason(c, owner, { type: "workspace", workspaceId: newId() }, "view")).toBe(
      "not_found",
    );
    expect(await reason(c, owner, { type: "folder", folderId: newId() }, "view")).toBe("not_found");
    expect(await reason(c, owner, { type: "document", documentId: newId() }, "view")).toBe(
      "not_found",
    );
    expect(
      await reason(c, owner, { type: "page", documentId: doc._id, pageId: newId() }, "view"),
    ).toBe("not_found");
  });

  it("doesn't let a page id borrow access from another document", async () => {
    const other = await repos.documents.create(editor, {
      workspaceId: workspace._id,
      type: "canvas",
      title: "Other",
    });
    expect(
      await reason(c, owner, { type: "page", documentId: other._id, pageId: page._id }, "view"),
    ).toBe("not_found");
  });

  it("treats trashed folders, removed pages and deleted workspaces as gone", async () => {
    const folder = await repos.folders.create(owner, { workspaceId: workspace._id, name: "Old" });
    await repos.folders.trash(owner, folder._id);
    expect(await reason(c, owner, { type: "folder", folderId: folder._id }, "view")).toBe(
      "not_found",
    );

    const extra = await repos.pages.insert(owner, doc._id, { afterPageId: page._id });
    await repos.pages.remove(owner, doc._id, extra._id);
    expect(
      await reason(c, owner, { type: "page", documentId: doc._id, pageId: extra._id }, "view"),
    ).toBe("not_found");

    const gone = await repos.workspaces.create(owner, { name: "Gone" });
    await c.workspaces.updateOne({ _id: gone._id }, { $set: { deletedAt: new Date() } });
    expect(await reason(c, owner, { type: "workspace", workspaceId: gone._id }, "view")).toBe(
      "not_found",
    );
  });

  it("matches email invites whatever the case of the signed-in address", async () => {
    await repos.documents.grant(owner, doc._id, {
      principal: { kind: "email", email: "zoe@example.com" },
      role: "commenter",
    });
    const zoe = as("zoe-id", "Zoe@Example.COM");
    expect(await reason(c, zoe, { type: "document", documentId: doc._id }, "comment")).toBe(
      "allowed:commenter",
    );
    expect(await effectiveRole(c, zoe, doc._id)).toBe("commenter");
    expect(await effectiveRole(c, as("nobody"), doc._id)).toBeNull();
  });

  it("keeps owner-only layers to owners", async () => {
    const layer = { type: "layer", documentId: doc._id, pageId: page._id } as const;
    expect(await reason(c, editor, { ...layer, layerOwnerOnly: true }, "edit")).toBe(
      "layer_locked",
    );
    expect(await reason(c, editor, { ...layer, layerOwnerOnly: true }, "view")).toBe(
      "allowed:editor",
    );
    expect(await reason(c, editor, { ...layer, layerOwnerOnly: false }, "edit")).toBe(
      "allowed:editor",
    );
    expect(await reason(c, owner, { ...layer, layerOwnerOnly: true }, "edit")).toBe(
      "allowed:owner",
    );
  });

  it("applies a link's download switch only to people who came through the link", async () => {
    const link = await repos.documents.createShareLink(owner, doc._id, {
      role: "viewer",
      allowDownload: false,
    });
    const resource = { type: "document", documentId: doc._id } as const;
    const guest: AccessContext = {
      actor: { kind: "guest", guestId: "g" },
      shareLink: { token: link.token },
    };
    expect(await reason(c, guest, resource, "view")).toBe("allowed:viewer");
    expect(await reason(c, guest, resource, "download")).toBe("download_not_allowed");
    expect(
      await reason(c, { ...editor, shareLink: { token: link.token } }, resource, "download"),
    ).toBe("allowed:editor");
  });

  it("ignores a link token that doesn't exist", async () => {
    const guest: AccessContext = {
      actor: { kind: "guest", guestId: "g" },
      shareLink: { token: "A".repeat(22) },
    };
    expect(await reason(c, guest, { type: "document", documentId: doc._id }, "view")).toBe(
      "no_access",
    );
  });
});
