import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMongo, pingDb, type MongoConnection } from "../client";
import { collections } from "../collections";
import { migrations, runMigrations } from "./index";

/**
 * Runs against a throwaway local database, never the dev database in MONGODB_URI.
 * Start it with `pnpm services:up`.
 */
const uri = process.env.MONGODB_TEST_URI ?? "mongodb://localhost:27027/paper_chalk_test";

describe("migrations", () => {
  let conn: MongoConnection;

  beforeAll(async () => {
    conn = createMongo(uri, { maxPoolSize: 2 });
    await conn.db.dropDatabase();
  });

  afterAll(async () => {
    await conn.db.dropDatabase();
    await conn.close();
  });

  it("connects", async () => {
    await expect(pingDb(conn.db)).resolves.toBeUndefined();
  });

  it("applies every migration once and records it", async () => {
    expect(await runMigrations(conn.db)).toEqual(migrations.map((m) => m.id));
    expect(await runMigrations(conn.db)).toEqual([]);
    const log = await conn.db.collection(collections.migrations).find().toArray();
    expect(log.map((m) => m._id)).toEqual(migrations.map((m) => m.id));
  });

  it("creates the auth indexes", async () => {
    const names = async (name: string) =>
      (await conn.db.collection(name).indexes()).map((i) => i.name);
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
});
