import type { ClientSession, MongoClient } from "mongodb";

/**
 * Runs `fn` in a MongoDB transaction and returns its result. Requires a replica set (Atlas, or
 * the local single-node replica set in docker-compose). Transient errors are retried by the driver.
 */
export async function withTransaction<T>(
  client: MongoClient,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = client.startSession();
  try {
    return await session.withTransaction(fn, {
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
    });
  } finally {
    await session.endSession();
  }
}
