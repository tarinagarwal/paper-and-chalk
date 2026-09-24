import { createFileRepositories, createMongo, createRepositories } from "@pc/db";
import { createStorage, storageConfigFromEnv } from "@pc/storage";

import { env, port } from "./env";
import { createWorkerServer } from "./server";

const mongo = createMongo(env.MONGODB_URI, { appName: "paper-chalk-workers", maxPoolSize: 5 });
const storage = createStorage(storageConfigFromEnv(env));
const server = createWorkerServer({
  services: {
    files: createFileRepositories(mongo, storage),
    jobs: createRepositories(mongo).jobs,
  },
});

server.listen(port, () => {
  console.info(`workers listening on http://localhost:${port} (POST /jobs/:kind, GET /health)`);
});

function shutdown(signal: string) {
  console.info(`workers received ${signal}, shutting down`);
  server.close(() => {
    void mongo.close().finally(() => process.exit(0));
  });
  // Cloud Run allows 10 s after SIGTERM.
  setTimeout(() => process.exit(1), 9_000).unref();
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
