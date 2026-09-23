import { port } from "./env";
import { createWorkerServer } from "./server";

const server = createWorkerServer();
server.listen(port, () => {
  console.info(`workers listening on http://localhost:${port} (POST /jobs/:kind, GET /health)`);
});

function shutdown(signal: string) {
  console.info(`workers received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  // Cloud Run allows 10 s after SIGTERM.
  setTimeout(() => process.exit(1), 9_000).unref();
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
