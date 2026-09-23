import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const bucket = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/, "invalid GCS bucket name");

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url().startsWith("postgres"),
    REDIS_URL: z.url().startsWith("redis"),
    GCS_PROJECT_ID: z.string().min(1),
    /** Set only for the local emulator; unset in staging/production to use real GCS. */
    GCS_API_ENDPOINT: z.url().optional(),
    GCS_BUCKET_ORIGINALS: bucket,
    GCS_BUCKET_YJS_SNAPSHOTS: bucket,
    GCS_BUCKET_ASSETS: bucket,
    GCS_BUCKET_EXPORTS: bucket,
    GCS_BUCKET_THUMBNAILS: bucket,
  },
  client: {
    /** Public origin of the site, used for canonical URLs, sitemap and Open Graph. */
    NEXT_PUBLIC_SITE_URL: z.url(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  emptyStringAsUndefined: true,
  // Docker image builds have no runtime secrets; the container validates at startup instead.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});
