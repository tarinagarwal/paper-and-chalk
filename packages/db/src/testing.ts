/**
 * Test helpers. Tests run against the local replica set from `pnpm services:up`, never the dev
 * database in MONGODB_URI. Each test file gets its own database so files can't disturb each other.
 */
import { createMongo, type MongoConnection } from "./client";
import { runMigrations } from "./migrations";

export const TEST_MONGODB_URI =
  process.env.MONGODB_TEST_URI ??
  "mongodb://localhost:27027/paper_chalk_test?directConnection=true";

/** A fresh, dropped database on the test server. Pass `migrate: false` to get it empty. */
export async function openTestDb(
  name: string,
  options: { migrate?: boolean } = {},
): Promise<MongoConnection> {
  const base = createMongo(TEST_MONGODB_URI, { maxPoolSize: 4, appName: `test-${name}` });
  const conn: MongoConnection = { ...base, db: base.client.db(`paper_chalk_test_${name}`) };
  await conn.db.dropDatabase();
  if (options.migrate !== false) await runMigrations(conn.db);
  return conn;
}

export async function closeTestDb(conn: MongoConnection): Promise<void> {
  await conn.db.dropDatabase();
  await conn.close();
}
