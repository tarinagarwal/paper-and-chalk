/**
 * The end-to-end run's MongoDB: a throwaway single-node replica set, no Docker. Playwright starts
 * this first (see playwright.config.ts) and stops it when the run ends.
 */
import { startTestMongo } from "@pc/db/test-server";

const port = Number(process.env.E2E_MONGODB_PORT ?? "27027");
const mongo = await startTestMongo({ port });
console.info(`test MongoDB ready at ${mongo.uri}`);

const stop = () => {
  void mongo.stop().finally(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
