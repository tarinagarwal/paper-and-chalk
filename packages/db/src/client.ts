import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

export interface MongoConnection {
  client: MongoClient;
  /** The database named in the connection string (e.g. `PaperDB`). */
  db: Db;
  close: () => Promise<void>;
}

export interface ConnectOptions {
  /** Shows up in MongoDB logs and Atlas metrics. */
  appName?: string;
  /** Max pool size. Cloud Run instances should keep this small. */
  maxPoolSize?: number;
}

/**
 * Creates a client for the database in `uri`. The driver connects lazily on the first operation,
 * so this is cheap to call at module load.
 */
export function createMongo(uri: string, options: ConnectOptions = {}): MongoConnection {
  const clientOptions: MongoClientOptions = {
    appName: options.appName ?? "paper-chalk",
    maxPoolSize: options.maxPoolSize ?? 10,
    serverSelectionTimeoutMS: 5_000,
  };
  const client = new MongoClient(uri, clientOptions);
  const db = client.db();
  return { client, db, close: () => client.close() };
}

/** Round-trips a ping. Throws if the database is unreachable. */
export async function pingDb(db: Db): Promise<void> {
  await db.command({ ping: 1 });
}
