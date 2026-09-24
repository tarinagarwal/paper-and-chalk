import type { Db } from "mongodb";

import { collections } from "../collections";
import { authIndexes } from "./0001_auth_indexes";
import { coreCollections } from "./0002_core_collections";
import type { Migration } from "./types";

/** Every migration, in order. Append new ones; never reorder or edit applied ones. */
export const migrations: readonly Migration[] = [authIndexes, coreCollections];

interface AppliedMigration {
  _id: string;
  description: string;
  appliedAt: Date;
}

/**
 * Applies pending migrations in order and records each in `_migrations`. Safe to run repeatedly
 * and from several processes: index creation is idempotent and the record upsert is keyed by id.
 */
export async function runMigrations(db: Db): Promise<string[]> {
  const log = db.collection<AppliedMigration>(collections.migrations);
  const applied = new Set(
    (await log.find({}, { projection: { _id: 1 } }).toArray()).map((m) => m._id),
  );
  const ran: string[] = [];

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    await migration.up(db);
    await log.updateOne(
      { _id: migration.id },
      { $setOnInsert: { description: migration.description, appliedAt: new Date() } },
      { upsert: true },
    );
    ran.push(migration.id);
  }
  return ran;
}

export type { Migration } from "./types";
