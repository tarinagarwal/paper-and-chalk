export { createMongo, pingDb, type ConnectOptions, type MongoConnection } from "./client";
export { collections, type CollectionName } from "./collections";
// Migrations live at "@pc/db/migrations" so app bundles never pull them in.
