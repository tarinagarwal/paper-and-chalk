/**
 * A real MongoDB for tests, without Docker. mongodb-memory-server downloads the MongoDB binary
 * once (into node_modules/.cache/mongodb-binaries at the repo root) and runs it only while tests
 * run, as a single-node replica set so transactions work. Nothing stays running afterwards.
 */
import { fileURLToPath } from "node:url";

import { MongoMemoryReplSet } from "mongodb-memory-server-core";

/** Same major line as Atlas. Bump deliberately: the binary is downloaded once per version. */
export const TEST_MONGODB_VERSION = "8.0.32";

/** Shared by every package and cached in CI. */
export const MONGODB_BINARY_DIR = fileURLToPath(
  new URL("../../../node_modules/.cache/mongodb-binaries", import.meta.url),
);

export interface TestMongo {
  /** Connection string without a database name; add `/<db>?directConnection=true`-style parts. */
  uri: string;
  stop: () => Promise<void>;
}

/** Starts a throwaway single-node replica set. `port` fixes the port (default: a free one). */
export async function startTestMongo(options: { port?: number } = {}): Promise<TestMongo> {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: TEST_MONGODB_VERSION, downloadDir: MONGODB_BINARY_DIR },
    replSet: { count: 1, name: "rs0", storageEngine: "wiredTiger" },
    ...(options.port ? { instanceOpts: [{ port: options.port }] } : {}),
  });
  await replSet.waitUntilRunning();
  const port = replSet.servers[0]?.instanceInfo?.port;
  if (!port) throw new Error("Test MongoDB did not report a port");
  return {
    uri: `mongodb://127.0.0.1:${String(port)}`,
    stop: async () => {
      await replSet.stop({ doCleanup: true, force: true });
    },
  };
}

/**
 * Vitest global setup: starts a test MongoDB unless MONGODB_TEST_URI points at one already, and
 * hands the URI to the test workers through the environment.
 */
export async function vitestMongoSetup(): Promise<() => Promise<void>> {
  if (process.env.MONGODB_TEST_URI) return () => Promise.resolve();
  const mongo = await startTestMongo();
  process.env.MONGODB_TEST_URI = `${mongo.uri}/paper_chalk_test?directConnection=true`;
  return mongo.stop;
}
