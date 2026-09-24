/**
 * Test helpers. Tests run against a throwaway MongoDB started by Vitest (test-server.ts), never
 * the dev database in MONGODB_URI. Each test file gets its own database so files can't disturb
 * each other.
 */
import { createMongo, type MongoConnection } from "./client";
import { runMigrations } from "./migrations";

/** Set by the Vitest global setup (test-server.ts), or by hand to use another server. */
function testMongoUri(): string {
  const uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    throw new Error("MONGODB_TEST_URI is not set: run tests through Vitest (it starts a MongoDB)");
  }
  return uri;
}

/** A fresh, dropped database on the test server. Pass `migrate: false` to get it empty. */
export async function openTestDb(
  name: string,
  options: { migrate?: boolean } = {},
): Promise<MongoConnection> {
  const base = createMongo(testMongoUri(), { maxPoolSize: 4, appName: `test-${name}` });
  const conn: MongoConnection = { ...base, db: base.client.db(`paper_chalk_test_${name}`) };
  await conn.db.dropDatabase();
  if (options.migrate !== false) await runMigrations(conn.db);
  return conn;
}

export async function closeTestDb(conn: MongoConnection): Promise<void> {
  await conn.db.dropDatabase();
  await conn.close();
}
