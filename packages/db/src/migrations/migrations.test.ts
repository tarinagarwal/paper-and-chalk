import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pingDb, type MongoConnection } from "../client";
import { collections, typedCollections } from "../collections";
import { closeTestDb, openTestDb } from "../testing";
import { coreCollectionNames, coreCollections } from "./0002_core_collections";
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
    expect(log.map((m) => m._id)).toEqual(["0001_auth_indexes", "0002_core_collections"]);
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
        "workspace_trash_updated",
        "workspace_title_trigrams",
        "tagIds",
      ]),
    );
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

  it("re-running the core migration updates existing collections", async () => {
    await expect(coreCollections.up(conn.db)).resolves.toBeUndefined();
  });
});
