import { runMigrations } from "./migrations";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.");
  process.exit(1);
}

try {
  await runMigrations(url);
  console.info("Migrations applied.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
