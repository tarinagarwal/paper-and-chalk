export { createDb, pingDb, type ConnectOptions, type Database, type DbConnection } from "./client";
export * as schema from "./schema";
// Migrations live at "@pc/db/migrations" so app bundles never pull in the migrations folder.
