import { port } from "./env";
import { createSyncServer } from "./server";

const server = createSyncServer({ port });
await server.listen();
console.info(`sync listening on ws://localhost:${server.address.port} (health: /health)`);
