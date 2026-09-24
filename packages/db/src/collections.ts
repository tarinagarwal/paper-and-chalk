/**
 * Collection names. The Better Auth MongoDB adapter owns the four auth collections and uses its
 * default (singular) model names.
 */
export const collections = {
  user: "user",
  session: "session",
  account: "account",
  verification: "verification",
  migrations: "_migrations",
} as const;

export type CollectionName = (typeof collections)[keyof typeof collections];
