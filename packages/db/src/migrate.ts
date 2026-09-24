import { createMongo } from "./client";
import { runMigrations } from "./migrations";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Copy .env.example to .env.");
  process.exit(1);
}

const conn = createMongo(uri, { appName: "paper-chalk-migrate", maxPoolSize: 1 });
try {
  const ran = await runMigrations(conn.db);
  console.info(ran.length ? `Applied: ${ran.join(", ")}` : "Database is up to date.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await conn.close();
}
