import { describe, expect, it } from "vitest";

import type { UploadSnapshot } from "./engine";
import { formatBytes, uploadPercent, uploadStatus } from "./format";

const item = (change: Partial<UploadSnapshot>): UploadSnapshot => ({
  id: "u",
  fileName: "a.pdf",
  size: 20 * 1024 * 1024,
  mime: "application/pdf",
  state: "uploading",
  hashedBytes: 0,
  uploadedBytes: 0,
  error: null,
  asset: null,
  duplicate: false,
  ...change,
});

describe("formatBytes", () => {
  it.each([
    [1, "1 byte"],
    [512, "512 bytes"],
    [1536, "1.5 KB"],
    [10 * 1024 * 1024, "10 MB"],
    [3 * 1024 ** 3, "3 GB"],
  ])("%d is %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe("upload status", () => {
  it("shows hashing and upload progress", () => {
    expect(uploadPercent(item({ state: "hashing", hashedBytes: 5 * 1024 * 1024 }))).toBe(25);
    expect(uploadStatus(item({ state: "uploading", uploadedBytes: 10 * 1024 * 1024 }))).toBe(
      "Uploading 10 MB of 20 MB",
    );
    expect(uploadPercent(item({ state: "verifying" }))).toBeNull();
  });

  it("says when a file was already there, and why one failed", () => {
    expect(uploadStatus(item({ state: "done", duplicate: true }))).toBe(
      "Already in this workspace",
    );
    expect(uploadStatus(item({ state: "failed", error: "Storage is full" }))).toBe(
      "Storage is full",
    );
  });
});
