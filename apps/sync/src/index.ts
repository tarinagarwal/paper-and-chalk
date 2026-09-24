import { env, port } from "./env";
import { createSyncServer } from "./server";

const server = createSyncServer({ port, syncJwtSecret: env.SYNC_JWT_SECRET });
await server.listen();
console.info(`sync listening on ws://localhost:${server.address.port} (health: /health)`);
