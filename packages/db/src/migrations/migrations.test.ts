import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pingDb, type MongoConnection } from "../client";
import { collections, typedCollections } from "../collections";
import { closeTestDb, openTestDb } from "../testing";
import { coreCollectionNames, coreCollections } from "./0002_core_collections";
import { library } from "./0004_library";
import { migrations, runMigrations } from "./index";

describe("migrations", () => {
  let conn: MongoConnection;
  const names = async (name: string) =>
    (await conn.db.collection(name).indexes()).map((i) => i.name);

  beforeAll(async () => {
    conn = await openTestDb("migrations", { migrate: false });
  });

  afterAll(async () => {
    await closeTestDb(conn);
  });

  it("connects", async () => {
    await expect(pingDb(conn.db)).resolves.toBeUndefined();
  });

  it("applies every migration once and records it", async () => {
    expect(await runMigrations(conn.db)).toEqual(migrations.map((m) => m.id));
    expect(await runMigrations(conn.db)).toEqual([]);
    const log = await conn.db.collection(collections.migrations).find().toArray();
    expect(log.map((m) => m._id)).toEqual([
      "0001_auth_indexes",
      "0002_core_collections",
      "0003_uploads",
      "0004_library",
    ]);
  });

  it("creates the auth indexes", async () => {
    expect(await names(collections.user)).toContain("email_unique");
    expect(await names(collections.session)).toEqual(
      expect.arrayContaining(["token_unique", "userId", "expiresAt_ttl"]),
    );
    expect(await names(collections.account)).toContain("provider_account_unique");
    expect(await names(collections.verification)).toContain("expiresAt_ttl");
  });

  it("enforces unique emails", async () => {
    const users = conn.db.collection(collections.user);
    await users.insertOne({ email: "a@example.com" });
    await expect(users.insertOne({ email: "a@example.com" })).rejects.toThrow(/duplicate key/);
  });

  it("creates every core collection with a validator", async () => {
    const infos = await conn.db.listCollections({}, { nameOnly: false }).toArray();
    const byName = new Map(infos.map((i) => [i.name, i]));
    for (const name of coreCollectionNames) {
      const info = byName.get(name);
      expect(info, name).toBeDefined();
      expect(info && "options" in info ? info.options?.validator : undefined, name).toBeDefined();
    }
  });

  it("creates the lookup and search indexes", async () => {
    expect(await names(collections.workspaces)).toContain("one_personal_per_owner");
    expect(await names(collections.workspaceMembers)).toContain("workspace_user_unique");
    expect(await names(collections.documents)).toEqual(
      expect.arrayContaining([
        "workspace_folder_updated",
        "workspace_title_trigrams",
        "tagIds",
        "library_updated",
        "library_created",
        "library_bytes",
        "library_title",
        "folder_updated",
        "trash_purge",
      ]),
    );
    expect(await names(collections.documents)).not.toContain("workspace_trash_updated");
    expect(await names(collections.documentUserStates)).toEqual(
      expect.arrayContaining(["user_document_unique", "user_recent", "user_favourites"]),
    );
    expect(await names(collections.smartFolders)).toContain("workspace_user_order");
    expect(await names(collections.folders)).toContain("trash_purge");
    expect(await names(collections.pages)).toEqual(
      expect.arrayContaining(["document_order", "search_text"]),
    );
    expect(await names(collections.shareLinks)).toContain("token_unique");
    expect(await names(collections.tags)).toContain("workspace_name_unique");
    expect(await names(collections.yjsUpdates)).toContain("doc_seq_unique");
  });

  it("rejects documents missing required fields", async () => {
    await expect(conn.db.collection(collections.documents).insertOne({})).rejects.toThrow(
      /Document failed validation/,
    );
  });

  it("allows one personal workspace per owner, any number of team ones", async () => {
    const { workspaces } = typedCollections(conn.db);
    const base = {
      name: "W",
      ownerId: "u1",
      plan: "free" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    await workspaces.insertOne({ ...base, _id: "p1", personal: true });
    await expect(workspaces.insertOne({ ...base, _id: "p2", personal: true })).rejects.toThrow(
      /duplicate key/,
    );
    await workspaces.insertOne({ ...base, _id: "t1", personal: false });
    await workspaces.insertOne({ ...base, _id: "t2", personal: false });
  });

  it("keeps one live copy of a file per workspace, but lets a rejected one be replaced", async () => {
    expect(await names(collections.assets)).toContain("workspace_sha256_live");
    expect(await names(collections.assets)).not.toContain("workspace_sha256");
    expect(await names(collections.uploads)).toEqual(
      expect.arrayContaining(["resume", "expiresAt_ttl"]),
    );
    const assets = conn.db.collection<{ _id: string } & Record<string, unknown>>(
      collections.assets,
    );
    const asset = (id: string, status: string) => ({
      _id: id,
      workspaceId: "w1",
      documentId: null,
      kind: "image",
      bucket: "assets",
      key: `ws/w1/${id}`,
      fileName: "a.png",
      bytes: 10,
      mime: "image/png",
      sha256: "f".repeat(64),
      sha256Verified: true,
      status,
      createdBy: "u1",
      chargedTo: "u1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await assets.insertOne(asset("a1", "rejected"));
    await assets.insertOne(asset("a2", "ready"));
    await expect(assets.insertOne(asset("a3", "verifying"))).rejects.toThrow(/duplicate key/);
  });

  it("re-running the core and library migrations updates existing collections", async () => {
    await expect(coreCollections.up(conn.db)).resolves.toBeUndefined();
    await expect(library.up(conn.db)).resolves.toBeUndefined();
  });
});

describe("0004_library on existing data", () => {
  let conn: MongoConnection;

  beforeAll(async () => {
    conn = await openTestDb("migrations_backfill", { migrate: false });
    for (const migration of migrations.slice(0, 3)) await migration.up(conn.db);
  });

  afterAll(async () => {
    await closeTestDb(conn);
  });

  it("gives older documents a size and works out which are shared", async () => {
    const documents = conn.db.collection<{ _id: string } & Record<string, unknown>>(
      collections.documents,
    );
    const doc = (id: string) => ({
      _id: id,
      workspaceId: "w1",
      folderId: null,
      type: "canvas",
      title: id,
      titleTrigrams: [],
      pageCount: 0,
      tagIds: [],
      editorsCanShare: false,
      createdBy: "owner",
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await documents.insertMany([doc("private"), doc("granted"), doc("linked"), doc("revoked")]);
    const grant = (documentId: string, userId: string, role: string) => ({
      _id: `${documentId}-${userId}`,
      documentId,
      principal: { kind: "user", userId },
      role,
      expiresAt: null,
      grantedBy: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await conn.db
      .collection<{ _id: string }>(collections.documentPermissions)
      .insertMany([
        grant("private", "owner", "owner"),
        grant("granted", "owner", "owner"),
        grant("granted", "friend", "viewer"),
      ]);
    const link = (documentId: string, revokedAt: Date | null) => ({
      _id: `${documentId}-link`,
      documentId,
      token: `${documentId}-token`,
      role: "viewer",
      expiresAt: null,
      passwordHash: null,
      allowDownload: true,
      requireSignIn: false,
      revokedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await conn.db
      .collection<{ _id: string }>(collections.shareLinks)
      .insertMany([link("linked", null), link("revoked", new Date())]);

    await library.up(conn.db);

    const after = await documents.find({}, { sort: { _id: 1 } }).toArray();
    expect(after.map((d) => [d._id, d.bytes, d.isShared, d.titleKey])).toEqual([
      ["granted", 0, true, "granted"],
      ["linked", 0, true, "linked"],
      ["private", 0, false, "private"],
      ["revoked", 0, false, "revoked"],
    ]);
    // The new validator now requires both fields.
    await expect(documents.insertOne(doc("late"))).rejects.toThrow(/Document failed validation/);
  });
});
