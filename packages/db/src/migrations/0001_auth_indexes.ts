import { collections } from "../collections";
import type { Migration } from "./types";

/** Indexes for the Better Auth collections (SPEC.md section 4). */
export const authIndexes: Migration = {
  id: "0001_auth_indexes",
  description: "Unique and lookup indexes for user, session, account and verification",
  async up(db) {
    await db
      .collection(collections.user)
      .createIndexes([{ key: { email: 1 }, name: "email_unique", unique: true }]);
    await db.collection(collections.session).createIndexes([
      { key: { token: 1 }, name: "token_unique", unique: true },
      { key: { userId: 1 }, name: "userId" },
      // Mongo deletes sessions once they pass expiresAt.
      { key: { expiresAt: 1 }, name: "expiresAt_ttl", expireAfterSeconds: 0 },
    ]);
    await db.collection(collections.account).createIndexes([
      { key: { providerId: 1, accountId: 1 }, name: "provider_account_unique", unique: true },
      { key: { userId: 1 }, name: "userId" },
    ]);
    await db.collection(collections.verification).createIndexes([
      { key: { identifier: 1 }, name: "identifier" },
      { key: { expiresAt: 1 }, name: "expiresAt_ttl", expireAfterSeconds: 0 },
    ]);
  },
};
