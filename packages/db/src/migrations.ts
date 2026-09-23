import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDb } from "./client";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Applies every pending migration in ./drizzle. Safe to run repeatedly. */
export async function runMigrations(url: string): Promise<void> {
  const conn = createDb(url, { max: 1, appName: "paper-chalk-migrate" });
  try {
    await migrate(conn.db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await conn.close();
  }
}
