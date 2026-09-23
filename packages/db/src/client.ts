import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbConnection {
  db: Database;
  sql: Sql;
  close: () => Promise<void>;
}

export interface ConnectOptions {
  /** Max pool size. Cloud Run instances should keep this small. */
  max?: number;
  /** Used for Postgres `application_name`, which shows up in pg_stat_activity. */
  appName?: string;
}

export function createDb(url: string, options: ConnectOptions = {}): DbConnection {
  const sql = postgres(url, {
    max: options.max ?? 10,
    connect_timeout: 5,
    idle_timeout: 30,
    connection: { application_name: options.appName ?? "paper-chalk" },
    onnotice: () => undefined,
  });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

/** Round-trips a trivial query. Throws if the database is unreachable. */
export async function pingDb(sql: Sql): Promise<void> {
  await sql`select 1`;
}
