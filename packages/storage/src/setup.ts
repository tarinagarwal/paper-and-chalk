/**
 * pnpm storage:setup   creates the buckets named in S3_BUCKET_* and applies privacy, encryption,
 *                      CORS (origins from S3_CORS_ORIGINS, comma separated) and lifecycle rules.
 *
 * Uses the AWS CLI profile (admin), not the app's S3_ACCESS_KEY_ID, which cannot change buckets.
 */
import { S3Client } from "@aws-sdk/client-s3";

import { configureBuckets } from "./buckets";
import { storageConfigFromEnv } from "./config";

const config = storageConfigFromEnv(process.env);
const corsOrigins = (process.env.S3_CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
if (corsOrigins.length === 0) {
  console.error("S3_CORS_ORIGINS is empty: set the site origins that may upload and read.");
  process.exit(1);
}

const admin = new S3Client({ region: config.region });
try {
  await configureBuckets(admin, config, {
    corsOrigins,
    log: (line) => {
      console.info(line);
    },
  });
  console.info(`Done. CORS origins: ${corsOrigins.join(", ")}`);
} catch (error) {
  console.error("Storage setup failed:", error);
  process.exitCode = 1;
}
