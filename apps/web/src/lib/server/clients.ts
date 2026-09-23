import "server-only";

import { Storage } from "@google-cloud/storage";
import { createDb, type DbConnection } from "@pc/db";
import { Redis } from "ioredis";

import { env } from "@/env";

/**
 * Process-wide clients. Cached on globalThis so dev hot reloads reuse connections instead of
 * opening new ones on every edit.
 */
const cache = globalThis as typeof globalThis & {
  __pcDb?: DbConnection;
  __pcRedis?: Redis;
  __pcStorage?: Storage;
};

export function getDb(): DbConnection {
  cache.__pcDb ??= createDb(env.DATABASE_URL, { appName: "paper-chalk-web" });
  return cache.__pcDb;
}

export function getRedis(): Redis {
  cache.__pcRedis ??= new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
  });
  return cache.__pcRedis;
}

export function getStorage(): Storage {
  cache.__pcStorage ??= new Storage({
    projectId: env.GCS_PROJECT_ID,
    ...(env.GCS_API_ENDPOINT
      ? { apiEndpoint: env.GCS_API_ENDPOINT, useAuthWithCustomEndpoint: false }
      : {}),
  });
  return cache.__pcStorage;
}

/** The five buckets from SPEC.md section 2. */
export const buckets = {
  originals: env.GCS_BUCKET_ORIGINALS,
  yjsSnapshots: env.GCS_BUCKET_YJS_SNAPSHOTS,
  assets: env.GCS_BUCKET_ASSETS,
  exports: env.GCS_BUCKET_EXPORTS,
  thumbnails: env.GCS_BUCKET_THUMBNAILS,
} as const;
