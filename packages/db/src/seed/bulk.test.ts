import { EMPTY_FILTERS } from "@pc/schema";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MongoConnection } from "../client";
import { typedCollections, type TypedCollections } from "../collections";
import type { AccessContext } from "../permissions/can";
import { createRepositories } from "../repositories";
import { closeTestDb, openTestDb } from "../testing";
import { seedBulkWorkspace } from "./bulk";
import { removeSeed, seedDemo } from "./demo";

describe("bulk seed", () => {
  let conn: MongoConnection;
  let c: TypedCollections;
  const ownerId = new ObjectId().toHexString();
  const ctx: AccessContext = {
    actor: { kind: "user", userId: ownerId, email: "bulk@example.com" },
  };

  beforeAll(async () => {
    conn = await openTestDb("bulk_seed");
    c = typedCollections(conn.db);
  });

  afterAll(async () => {
    await closeTestDb(conn);
  });

  it("writes a big, browsable workspace", async () => {
    const result = await seedBulkWorkspace(conn, {
      ownerId,
      ownerEmail: "bulk@example.com",
      count: 1500,
    });
    expect(result.documents).toBe(1500);
    expect(await c.documents.countDocuments({ workspaceId: result.workspaceId })).toBe(1500);
    expect(await c.documentPermissions.countDocuments({ role: "owner" })).toBe(1500);

    const repos = createRepositories(conn);
    const first = await repos.library.query(ctx, {
      scope: { kind: "home", workspaceId: result.workspaceId },
      sort: "name",
      dir: "asc",
      filters: EMPTY_FILTERS,
      cursor: null,
      limit: 60,
    });
    expect(first.total).toBe(1500);
    expect(first.items).toHaveLength(60);
    expect(first.items.every((i) => i.can.edit && i.role === "owner")).toBe(true);
    const keys = first.items.map((i) => i.document.titleKey);
    expect(keys).toEqual([...keys].sort());
  });

  it("is part of the demo seed with --bulk and goes away with it", async () => {
    const summary = await seedDemo(conn, { bulk: 200 });
    expect(summary?.bulkDocuments).toBe(200);
    expect(summary?.workspaces).toBe(4);
    const bulk = await c.workspaces.findOne({ name: "Bulk library (200)" });
    expect(bulk).not.toBeNull();
    expect(await removeSeed(conn)).toBe(true);
    expect(await c.documents.countDocuments({ workspaceId: bulk?._id ?? "" })).toBe(0);
    expect(await c.folders.countDocuments({ workspaceId: bulk?._id ?? "" })).toBe(0);
  });
});
