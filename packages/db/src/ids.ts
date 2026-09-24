import { randomBytes } from "node:crypto";

import { v7 as uuidv7 } from "uuid";

/** Time-ordered UUIDv7: sortable by creation time and friendly to index locality. */
export function newId(): string {
  return uuidv7();
}

/** 128 random bits, base64url (22 characters). Used for share-link tokens. */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}
