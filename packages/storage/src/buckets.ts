/**
 * Bucket configuration: CORS and lifecycle rules per bucket role, as data, plus `configureBuckets`
 * which creates missing buckets and applies everything. Run it with `pnpm storage:setup` using
 * AWS admin credentials (the CLI profile); the app's own IAM user cannot change buckets.
 *
 * - Every bucket is private (public access blocked, owner-enforced) and encrypted (SSE-S3).
 * - Browsers upload to `originals` and `assets` with signed PUTs and read with signed GETs.
 *   `ETag` is exposed because multipart uploads need each part's ETag to finish.
 * - `yjs-snapshots` is server-only: no CORS.
 * - Lifecycle: exports expire after 7 days, thumbnails after 30 (regenerated on demand),
 *   unfinished multipart uploads are aborted after a day, and anything under `test/` (tests and
 *   CI) is deleted after a day.
 */
import {
  CreateBucketCommand,
  DeleteBucketCorsCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketEncryptionCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketOwnershipControlsCommand,
  PutPublicAccessBlockCommand,
  S3ServiceException,
  type BucketLocationConstraint,
  type CORSRule,
  type LifecycleRule,
  type S3Client,
} from "@aws-sdk/client-s3";

import { BUCKETS, type Bucket, type StorageConfig } from "./config";

/** Test and CI objects live under this prefix in every bucket and expire after a day. */
export const TEST_KEY_PREFIX = "test/";

const UPLOAD_BUCKETS: readonly Bucket[] = ["originals", "assets"];
const BROWSER_READ_BUCKETS: readonly Bucket[] = ["originals", "assets", "exports", "thumbnails"];

const EXPOSED = ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"];

export function corsRules(bucket: Bucket, origins: readonly string[]): CORSRule[] {
  if (!BROWSER_READ_BUCKETS.includes(bucket) || origins.length === 0) return [];
  const uploads = UPLOAD_BUCKETS.includes(bucket);
  return [
    {
      ID: uploads ? "browser-upload-and-read" : "browser-read",
      AllowedOrigins: [...origins],
      AllowedMethods: uploads ? ["GET", "HEAD", "PUT"] : ["GET", "HEAD"],
      AllowedHeaders: uploads ? ["content-type", "x-amz-checksum-sha256", "range"] : ["range"],
      ExposeHeaders: EXPOSED,
      MaxAgeSeconds: 3600,
    },
  ];
}

export function lifecycleRules(bucket: Bucket): LifecycleRule[] {
  const rules: LifecycleRule[] = [
    {
      ID: "delete-test-objects",
      Status: "Enabled",
      Filter: { Prefix: TEST_KEY_PREFIX },
      Expiration: { Days: 1 },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    },
    {
      ID: "abort-incomplete-uploads",
      Status: "Enabled",
      Filter: { Prefix: "" },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    },
  ];
  if (bucket === "exports") {
    rules.push({
      ID: "expire-exports",
      Status: "Enabled",
      Filter: { Prefix: "" },
      Expiration: { Days: 7 },
    });
  }
  if (bucket === "thumbnails") {
    rules.push({
      ID: "expire-thumbnails",
      Status: "Enabled",
      Filter: { Prefix: "" },
      Expiration: { Days: 30 },
    });
  }
  return rules;
}

async function bucketExists(s3: S3Client, name: string): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    return true;
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return false;
    throw error;
  }
}

/** Creates missing buckets and applies privacy, encryption, CORS and lifecycle. Idempotent. */
export async function configureBuckets(
  s3: S3Client,
  config: StorageConfig,
  options: { corsOrigins: readonly string[]; log?: (line: string) => void },
): Promise<void> {
  const log = options.log ?? (() => undefined);
  for (const bucket of BUCKETS) {
    const Bucket = config.buckets[bucket];
    if (await bucketExists(s3, Bucket)) {
      log(`${Bucket}: exists`);
    } else {
      await s3.send(
        new CreateBucketCommand({
          Bucket,
          CreateBucketConfiguration: {
            LocationConstraint: config.region as BucketLocationConstraint,
          },
        }),
      );
      log(`${Bucket}: created in ${config.region}`);
    }
    await s3.send(
      new PutPublicAccessBlockCommand({
        Bucket,
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          IgnorePublicAcls: true,
          BlockPublicPolicy: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
    await s3.send(
      new PutBucketOwnershipControlsCommand({
        Bucket,
        OwnershipControls: { Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }] },
      }),
    );
    await s3.send(
      new PutBucketEncryptionCommand({
        Bucket,
        ServerSideEncryptionConfiguration: {
          Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
        },
      }),
    );
    const cors = corsRules(bucket, options.corsOrigins);
    if (cors.length > 0) {
      await s3.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: cors } }));
    } else {
      await s3.send(new DeleteBucketCorsCommand({ Bucket }));
    }
    await s3.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket,
        LifecycleConfiguration: { Rules: lifecycleRules(bucket) },
      }),
    );
    log(`${Bucket}: private, encrypted, CORS ${cors.length > 0 ? "on" : "off"}, lifecycle set`);
  }
}
