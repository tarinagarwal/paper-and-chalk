import "server-only";

import {
  createFileRepositories,
  createMongo,
  createRepositories,
  type FileRepositories,
  type MongoConnection,
  type Repositories,
} from "@pc/db";
import { createStorage, storageConfigFromEnv, type Storage } from "@pc/storage";
import { Redis } from "@upstash/redis";

import { env } from "@/env";

/**
 * Process-wide clients. Cached on globalThis so dev hot reloads reuse connections instead of
 * opening new ones on every edit.
 */
const cache = globalThis as typeof globalThis & {
  __pcMongo?: MongoConnection;
  __pcRepositories?: Repositories;
  __pcFiles?: FileRepositories;
  __pcUpstash?: Redis;
  __pcStorage?: Storage;
};

export function getMongo(): MongoConnection {
  cache.__pcMongo ??= createMongo(env.MONGODB_URI, { appName: "paper-chalk-web" });
  return cache.__pcMongo;
}

/** The permission-checked data layer. Route handlers use this, never raw queries. */
export function getRepositories(): Repositories {
  cache.__pcRepositories ??= createRepositories(getMongo());
  return cache.__pcRepositories;
}

/** Upstash over REST: works from any runtime and needs no connection pool. */
export function getUpstash(): Redis {
  cache.__pcUpstash ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return cache.__pcUpstash;
}

/** S3 (SPEC.md section 2 buckets, on AWS). */
export function getStorage(): Storage {
  cache.__pcStorage ??= createStorage(storageConfigFromEnv(env));
  return cache.__pcStorage;
}

/** Uploads and asset reads: the permission-checked repositories that also talk to S3. */
export function getFiles(): FileRepositories {
  cache.__pcFiles ??= createFileRepositories(getMongo(), getStorage());
  return cache.__pcFiles;
}
