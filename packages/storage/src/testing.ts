import { randomUUID } from "node:crypto";

import { TEST_KEY_PREFIX } from "./buckets";
import { createStorage, type Storage } from "./client";
import { storageConfigFromEnv } from "./config";

/**
 * A storage client for tests: the dev buckets from the environment, but every key under
 * `test/<run>/`, which the buckets' lifecycle rule deletes after a day. S3_KEY_PREFIX is ignored so
 * a test can never write outside `test/`.
 */
export function testStorage(env: Record<string, string | undefined> = process.env): Storage {
  const config = storageConfigFromEnv(env);
  return createStorage({ ...config, keyPrefix: `${TEST_KEY_PREFIX}${randomUUID()}/` });
}
