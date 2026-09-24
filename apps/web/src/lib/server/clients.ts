import "server-only";

import { Storage } from "@google-cloud/storage";
import { createMongo, type MongoConnection } from "@pc/db";
import { Redis } from "@upstash/redis";

import { env } from "@/env";

/**
 * Process-wide clients. Cached on globalThis so dev hot reloads reuse connections instead of
 * opening new ones on every edit.
 */
const cache = globalThis as typeof globalThis & {
  __pcMongo?: MongoConnection;
  __pcUpstash?: Redis;
  __pcStorage?: Storage;
};

export function getMongo(): MongoConnection {
  cache.__pcMongo ??= createMongo(env.MONGODB_URI, { appName: "paper-chalk-web" });
  return cache.__pcMongo;
}

/** Upstash over REST: works from any runtime and needs no connection pool. */
export function getUpstash(): Redis {
  cache.__pcUpstash ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return cache.__pcUpstash;
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
