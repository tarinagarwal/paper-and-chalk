import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDb, pingDb, type DbConnection } from "./client";
import { runMigrations } from "./migrations";

const url = process.env.DATABASE_URL;
if (!url)
  throw new Error("DATABASE_URL must be set for db tests (start docker compose, copy .env).");

describe("migrations", () => {
  let conn: DbConnection;

  beforeAll(async () => {
    await runMigrations(url);
    conn = createDb(url, { max: 1 });
  });

  afterAll(async () => {
    await conn.close();
  });

  it("connects", async () => {
    await expect(pingDb(conn.sql)).resolves.toBeUndefined();
  });

  it("enables the vector and pg_trgm extensions", async () => {
    const rows = await conn.sql<{ extname: string }[]>`
      select extname from pg_extension where extname in ('vector', 'pg_trgm') order by extname
    `;
    expect(rows.map((r) => r.extname)).toEqual(["pg_trgm", "vector"]);
  });

  it("records the migration and is idempotent", async () => {
    await runMigrations(url);
    const [row] = await conn.sql<{ count: number }[]>`
      select count(*)::int as count from drizzle.__drizzle_migrations
    `;
    expect(row?.count).toBeGreaterThanOrEqual(1);
  });
});
