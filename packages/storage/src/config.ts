import { z } from "zod";

/** The five buckets from SPEC.md section 2, by role. Real names come from the environment. */
export const BUCKETS = ["originals", "yjsSnapshots", "assets", "exports", "thumbnails"] as const;
export type Bucket = (typeof BUCKETS)[number];

export interface StorageConfig {
  region: string;
  /** Real S3 bucket name for each role, e.g. `paper-chalk-dev-originals`. */
  buckets: Record<Bucket, string>;
  /**
   * Static keys (the app's IAM user). When unset, the AWS default chain is used: AWS_* variables,
   * a web-identity role (CI, AWS compute) or the shared CLI profile.
   */
  credentials?: { accessKeyId: string; secretAccessKey: string } | undefined;
  /**
   * Prepended to every object key. Tests and CI use `test/`, which a lifecycle rule deletes after
   * a day, so they can share the dev buckets without leaving anything behind.
   */
  keyPrefix?: string | undefined;
}

const bucketName = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, "invalid S3 bucket name");

/** The S3_* variables, for each app's `env.ts` (spread into its server schema). */
export const storageEnv = {
  S3_REGION: z.string().min(1),
  S3_BUCKET_ORIGINALS: bucketName,
  S3_BUCKET_YJS_SNAPSHOTS: bucketName,
  S3_BUCKET_ASSETS: bucketName,
  S3_BUCKET_EXPORTS: bucketName,
  S3_BUCKET_THUMBNAILS: bucketName,
  /** The app's IAM user. Unset: the AWS default chain (a role in CI and on AWS compute). */
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** `test/...` in tests, CI and e2e; empty in dev and production. */
  S3_KEY_PREFIX: z
    .string()
    .regex(/^([A-Za-z0-9._-]+\/)*$/, "must be empty or end with /")
    .default(""),
};

/** Reads the S3_* variables. Throws with the missing names so a misconfigured service stops early. */
export function storageConfigFromEnv(env: {
  [K in keyof typeof storageEnv]?: string | undefined;
}): StorageConfig {
  const required = {
    region: "S3_REGION",
    originals: "S3_BUCKET_ORIGINALS",
    yjsSnapshots: "S3_BUCKET_YJS_SNAPSHOTS",
    assets: "S3_BUCKET_ASSETS",
    exports: "S3_BUCKET_EXPORTS",
    thumbnails: "S3_BUCKET_THUMBNAILS",
  } as const;
  type Name = keyof typeof storageEnv;
  const missing = (Object.values(required) as Name[]).filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing storage settings: ${missing.join(", ")}`);
  const value = (name: Name) => env[name] ?? "";

  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither");
  }
  return {
    region: value(required.region),
    buckets: {
      originals: value(required.originals),
      yjsSnapshots: value(required.yjsSnapshots),
      assets: value(required.assets),
      exports: value(required.exports),
      thumbnails: value(required.thumbnails),
    },
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    keyPrefix: env.S3_KEY_PREFIX ?? "",
  };
}
