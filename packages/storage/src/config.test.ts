import { describe, expect, it } from "vitest";

import { storageConfigFromEnv } from "./config";

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
