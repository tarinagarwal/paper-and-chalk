import { rm } from "node:fs/promises";

import { createMongo } from "@pc/db";
import { runMigrations } from "@pc/db/migrations";

import { E2E_MONGODB_URI, E2E_OUTBOX_DIR } from "../playwright.config";

/** Fresh database and empty outbox for every run. */
export default async function globalSetup() {
  const conn = createMongo(E2E_MONGODB_URI, { appName: "paper-chalk-e2e", maxPoolSize: 2 });
  try {
    await conn.db.dropDatabase();
    await runMigrations(conn.db);
  } finally {
    await conn.close();
  }
  await rm(E2E_OUTBOX_DIR, { recursive: true, force: true });
}
