import { describe, expect, it } from "vitest";

import { corsRules, lifecycleRules, TEST_KEY_PREFIX } from "./buckets";
import { storageConfigFromEnv } from "./config";

const origins = ["http://localhost:3000"];

describe("corsRules", () => {
  it("lets browsers upload to originals and assets, and exposes ETag", () => {
    for (const bucket of ["originals", "assets"] as const) {
      const [rule] = corsRules(bucket, origins);
      expect(rule?.AllowedMethods).toEqual(["GET", "HEAD", "PUT"]);
      expect(rule?.AllowedHeaders).toContain("x-amz-checksum-sha256");
      expect(rule?.ExposeHeaders).toContain("ETag");
      expect(rule?.AllowedOrigins).toEqual(origins);
    }
  });

  it("lets browsers only read exports and thumbnails", () => {
    expect(corsRules("exports", origins)[0]?.AllowedMethods).toEqual(["GET", "HEAD"]);
    expect(corsRules("thumbnails", origins)[0]?.AllowedMethods).toEqual(["GET", "HEAD"]);
  });

  it("keeps Yjs snapshots server-only", () => {
    expect(corsRules("yjsSnapshots", origins)).toEqual([]);
  });
});

describe("lifecycleRules", () => {
  const expiry = (bucket: Parameters<typeof lifecycleRules>[0], id: string) =>
    lifecycleRules(bucket).find((rule) => rule.ID === id)?.Expiration?.Days;

  it("expires exports after 7 days and thumbnails after 30", () => {
    expect(expiry("exports", "expire-exports")).toBe(7);
    expect(expiry("thumbnails", "expire-thumbnails")).toBe(30);
    expect(expiry("originals", "expire-exports")).toBeUndefined();
  });

  it("deletes test objects after a day and aborts stale multipart uploads everywhere", () => {
    for (const bucket of [
      "originals",
      "yjsSnapshots",
      "assets",
      "exports",
      "thumbnails",
    ] as const) {
      const rules = lifecycleRules(bucket);
      const test = rules.find((rule) => rule.ID === "delete-test-objects");
      expect(test?.Filter?.Prefix).toBe(TEST_KEY_PREFIX);
      expect(test?.Expiration?.Days).toBe(1);
      const abort = rules.find((rule) => rule.ID === "abort-incomplete-uploads");
      expect(abort?.AbortIncompleteMultipartUpload?.DaysAfterInitiation).toBe(1);
    }
  });
});

describe("storageConfigFromEnv", () => {
  const env = {
    S3_REGION: "ap-south-1",
    S3_BUCKET_ORIGINALS: "o",
    S3_BUCKET_YJS_SNAPSHOTS: "y",
    S3_BUCKET_ASSETS: "a",
    S3_BUCKET_EXPORTS: "e",
    S3_BUCKET_THUMBNAILS: "t",
  };

  it("uses the default AWS chain when no keys are set", () => {
    const config = storageConfigFromEnv(env);
    expect(config.credentials).toBeUndefined();
    expect(config.buckets.yjsSnapshots).toBe("y");
    expect(config.keyPrefix).toBe("");
  });

  it("names every missing setting", () => {
    expect(() => storageConfigFromEnv({ S3_REGION: "ap-south-1" })).toThrow(
      /S3_BUCKET_ORIGINALS.*S3_BUCKET_THUMBNAILS/,
    );
  });

  it("refuses half a key pair", () => {
    expect(() => storageConfigFromEnv({ ...env, S3_ACCESS_KEY_ID: "AKIA" })).toThrow(/both/);
  });
});
