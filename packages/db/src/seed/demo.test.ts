import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MongoConnection } from "../client";
import { typedCollections, type TypedCollections } from "../collections";
import { can, type AccessContext } from "../permissions/can";
import { createRepositories } from "../repositories";
import { closeTestDb, openTestDb } from "../testing";
import { DEMO_LINK_PASSWORD, DEMO_USERS, removeSeed, seedDemo, type SeedSummary } from "./demo";

describe("demo seed", () => {
  let conn: MongoConnection;
  let c: TypedCollections;
  let summary: SeedSummary;
  const existingId = new ObjectId();
  let realDocumentId: string;

  const token = (label: string) => {
    const link = summary.links.find((l) => l.label.startsWith(label));
    if (!link) throw new Error(`no ${label} link`);
    return link.token;
  };

  beforeAll(async () => {
    conn = await openTestDb("seed");
    c = typedCollections(conn.db);
    // The owner already signed up and has real work the seed must never touch.
    await c.users.insertOne({
      _id: existingId,
      name: "Tarin",
      email: DEMO_USERS.owner.email,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: "free",
      storageUsedBytes: 0,
      settings: "{}",
    });
    const repos = createRepositories(conn);
    const home = await repos.ensurePersonalWorkspace(existingId.toHexString());
    const real = await repos.documents.create(
      { actor: { kind: "user", userId: existingId.toHexString(), email: DEMO_USERS.owner.email } },
      { workspaceId: home._id, type: "canvas", title: "My real work" },
    );
    realDocumentId = real._id;

    const seeded = await seedDemo(conn);
    if (!seeded) throw new Error("seed skipped");
    summary = seeded;
  });

  afterAll(async () => {
    await closeTestDb(conn);
  });

  it("reuses the existing owner and creates the second user", async () => {
    expect(summary.users).toEqual([
      { email: DEMO_USERS.owner.email, id: existingId.toHexString(), created: false },
      { email: DEMO_USERS.second.email, id: expect.any(String) as string, created: true },
    ]);
    expect(await c.users.countDocuments()).toBe(2);
  });

  it("creates 20 documents across three workspaces, one of them trashed", async () => {
    expect(summary.documents).toBe(20);
    expect(await c.documents.countDocuments()).toBe(21);
    expect(await c.workspaces.countDocuments()).toBe(3);
    expect(await c.documents.countDocuments({ deletedAt: { $ne: null } })).toBe(1);
    expect(await c.folders.countDocuments({ parentId: { $ne: null } })).toBe(3);
  });

  it("shares a document with the owner", async () => {
    const repos = createRepositories(conn);
    const owner: AccessContext = {
      actor: { kind: "user", userId: existingId.toHexString(), email: DEMO_USERS.owner.email },
    };
    const shared = await repos.documents.listSharedWithMe(owner);
    expect(shared.map((d) => [d.title, d.role])).toEqual([["Reading list", "commenter"]]);
  });

  it("makes share links in every state", async () => {
    const roadmap = await c.documents.findOne({ title: "Q4 roadmap" });
    if (!roadmap) throw new Error("no roadmap");
    const resource = { type: "document", documentId: roadmap._id } as const;
    const asGuest = async (shareLink: { token: string; password?: string }) => {
      const d = await can(
        c,
        { actor: { kind: "guest", guestId: "g" }, shareLink },
        resource,
        "view",
      );
      return d.allowed ? d.role : d.reason;
    };
    expect(await asGuest({ token: token("viewer, downloads off") })).toBe("viewer");
    expect(await asGuest({ token: token("commenter, sign-in") })).toBe("sign_in_required");
    expect(await asGuest({ token: token("editor, password") })).toBe("link_password_required");
    expect(await asGuest({ token: token("editor, password"), password: DEMO_LINK_PASSWORD })).toBe(
      "editor",
    );
    expect(await asGuest({ token: token("viewer, expired") })).toBe("link_expired");
    expect(await asGuest({ token: token("viewer, revoked") })).toBe("link_revoked");
  });

  it("does not seed twice", async () => {
    expect(await seedDemo(conn)).toBeNull();
  });

  it("removes only what it created, and can seed again", async () => {
    expect(await removeSeed(conn)).toBe(true);
    expect(await removeSeed(conn)).toBe(false);

    expect(await c.users.countDocuments()).toBe(1);
    expect(
      await c.documents
        .find()
        .map((d) => d._id)
        .toArray(),
    ).toEqual([realDocumentId]);
    const workspaces = await c.workspaces.find().toArray();
    expect(workspaces.map((w) => [w.ownerId, w.personal])).toEqual([
      [existingId.toHexString(), true],
    ]);
    for (const left of [c.folders, c.tags, c.shareLinks, c.comments]) {
      expect(await left.countDocuments()).toBe(0);
    }
    expect(await c.pages.countDocuments()).toBe(0);
    expect(await c.workspaceMembers.countDocuments()).toBe(1);

    const again = await seedDemo(conn);
    expect(again?.documents).toBe(20);
  });
});
