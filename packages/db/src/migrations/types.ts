import type { Db } from "mongodb";

export interface Migration {
  /** Sortable, unique id, e.g. "0001_auth_indexes". Never rename an applied migration. */
  id: string;
  description: string;
  up: (db: Db) => Promise<void>;
}
