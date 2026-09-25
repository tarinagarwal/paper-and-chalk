/**
 * pnpm db:seed                seeds the demo data into MONGODB_URI (skips if it is already there)
 * pnpm db:seed --reset        removes the previous demo data, then seeds it again
 * pnpm db:seed --remove       removes the demo data only
 * pnpm db:seed --bulk 10000   also adds a workspace with that many documents (performance checks)
 */
import { createMongo } from "./client";
import { runMigrations } from "./migrations";
import { removeSeed, seedDemo } from "./seed/demo";

const argv = process.argv.slice(2);
const args = new Set(argv);
const bulkArg =
  argv.find((a) => a.startsWith("--bulk="))?.slice("--bulk=".length) ??
  (argv.includes("--bulk") ? argv[argv.indexOf("--bulk") + 1] : undefined);
const bulk = bulkArg === undefined ? 0 : Number(bulkArg);
if (!Number.isInteger(bulk) || bulk < 0 || bulk > 100_000) {
  console.error("--bulk needs a whole number of documents up to 100000.");
  process.exit(1);
}
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set. Copy .env.example to .env.");
  process.exit(1);
}
if (process.env.APP_ENV === "production") {
  console.error("Refusing to seed a production database.");
  process.exit(1);
}

const conn = createMongo(uri, { appName: "paper-chalk-seed", maxPoolSize: 2 });
try {
  // Seeding needs the collections, validators and indexes.
  await runMigrations(conn.db);
  if (args.has("--reset") || args.has("--remove")) {
    console.info((await removeSeed(conn)) ? "Removed the demo data." : "No demo data to remove.");
  }
  if (!args.has("--remove")) {
    const summary = await seedDemo(conn, { bulk });
    if (!summary) {
      console.info("The demo data is already there. Run with --reset to recreate it.");
    } else {
      for (const user of summary.users) {
        console.info(
          `${user.created ? "Created" : "Using existing"} user ${user.email} (${user.id})`,
        );
      }
      console.info(
        `Seeded ${String(summary.workspaces)} workspaces, ${String(summary.folders)} folders, ${String(summary.documents)} documents.`,
      );
      if (summary.bulkDocuments > 0) {
        console.info(`Bulk workspace: ${String(summary.bulkDocuments)} documents.`);
      }
      console.info("Share link tokens on “Q4 roadmap”:");
      for (const link of summary.links) console.info(`  ${link.token}  ${link.label}`);
    }
  }
} catch (error) {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
} finally {
  await conn.close();
}
