import { describe, expect, it } from "vitest";

import {
  GiB,
  MAX_UPLOAD_BYTES,
  MiB,
  PART_SIZE_BYTES,
  partRange,
  planUpload,
  PLAN_STORAGE_BYTES,
  resolveUploadMime,
  SINGLE_UPLOAD_MAX_BYTES,
  uploadBucket,
  uploadInitRequestSchema,
  uploadInitResponseSchema,
  uploadKind,
  UPLOAD_TYPES,
} from "./uploads";

describe("resolveUploadMime", () => {
  it.each([
    ["notes.pdf", "application/pdf", "application/pdf"],
    ["photo.JPG", "image/jpeg", "image/jpeg"],
    ["photo.jpg", "image/pjpeg", "image/jpeg"],
    ["IMG_0001.HEIC", "", "image/heic"],
    ["scan.heif", "image/heif", "image/heic"],
    ["lecture.m4a", "audio/x-m4a", "audio/mp4"],
    ["memo.wav", "audio/wave", "audio/wav"],
    ["voice.webm", "audio/webm;codecs=opus", "audio/webm"],
    ["archive.zip", "application/x-zip-compressed", "application/zip"],
    [
      "report.docx",
      "application/octet-stream",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  ] as const)("%s reported as %j is %s", (name, reported, expected) => {
    expect(resolveUploadMime(name, reported)).toBe(expected);
  });

  it.each([
    ["drawing.svg", "image/svg+xml"],
    ["page.html", "text/html"],
    ["script.exe", "application/octet-stream"],
    ["no-extension", ""],
    // A disallowed reported type is not rescued by a friendly extension.
    ["trick.pdf", "text/html"],
  ])("refuses %s (%s)", (name, reported) => {
    expect(resolveUploadMime(name, reported)).toBeNull();
  });
});

describe("types and limits", () => {
  it("routes PDFs to originals and everything else to assets", () => {
    expect(uploadBucket("application/pdf")).toBe("originals");
    expect(uploadBucket("image/png")).toBe("assets");
    expect(uploadBucket("application/zip")).toBe("assets");
  });

  it("has a size limit for every kind in the allowlist", () => {
    for (const mime of Object.keys(UPLOAD_TYPES) as (keyof typeof UPLOAD_TYPES)[]) {
      expect(MAX_UPLOAD_BYTES[uploadKind(mime)]).toBeGreaterThan(0);
    }
    expect(MAX_UPLOAD_BYTES.video).toBe(GiB);
  });

  it("gives Free 3 GB and Pro 100 GB (section 28)", () => {
    expect(PLAN_STORAGE_BYTES.free).toBe(3 * GiB);
    expect(PLAN_STORAGE_BYTES.pro).toBe(100 * GiB);
  });
});

describe("planUpload and partRange", () => {
  it("sends files up to 16 MB in one request", () => {
    expect(planUpload(1)).toEqual({ mode: "single" });
    expect(planUpload(SINGLE_UPLOAD_MAX_BYTES)).toEqual({ mode: "single" });
  });

  it("splits larger files into 8 MB parts, the last one smaller", () => {
    const size = SINGLE_UPLOAD_MAX_BYTES + 1;
    expect(planUpload(size)).toEqual({
      mode: "multipart",
      partSize: PART_SIZE_BYTES,
      partCount: 3,
    });
    expect(partRange(size, PART_SIZE_BYTES, 1)).toEqual({ start: 0, end: 8 * MiB, size: 8 * MiB });
    expect(partRange(size, PART_SIZE_BYTES, 3)).toEqual({ start: 16 * MiB, end: size, size: 1 });
  });

  it("stays within S3's 10,000-part limit for the largest file", () => {
    const plan = planUpload(MAX_UPLOAD_BYTES.video);
    expect(plan.mode === "multipart" && plan.partCount).toBe(128);
  });
});

describe("uploadInitRequestSchema", () => {
  const valid = {
    workspaceId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    fileName: "notes.pdf",
    contentType: "application/pdf",
    size: 1234,
    sha256: "a".repeat(64),
  };

  it("accepts a valid request and defaults documentId to null", () => {
    expect(uploadInitRequestSchema.parse(valid).documentId).toBeNull();
  });

  it.each([
    ["an unlisted type", { contentType: "image/svg+xml" }],
    ["a bad hash", { sha256: "xyz" }],
    ["an empty file", { size: 0 }],
    ["a blank name", { fileName: "  " }],
    ["unknown fields", { bucket: "originals" }],
  ])("rejects %s", (_label, change) => {
    expect(uploadInitRequestSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe("uploadInitResponseSchema", () => {
  const request = {
    url: "https://bucket.s3.ap-south-1.amazonaws.com/k?X-Amz-Signature=abc",
    method: "PUT",
    headers: { "content-type": "application/pdf" },
    expiresAt: "2026-09-24T12:00:00.000Z",
  };
  const uploadId = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

  it("parses each kind of answer", () => {
    expect(
      uploadInitResponseSchema.parse({ status: "upload", uploadId, mode: "single", request }),
    ).toMatchObject({ mode: "single" });
    expect(
      uploadInitResponseSchema.parse({
        status: "upload",
        uploadId,
        mode: "multipart",
        partSize: 8 * MiB,
        partCount: 3,
        completedParts: [1],
        parts: [{ partNumber: 2, request }],
      }),
    ).toMatchObject({ mode: "multipart", completedParts: [1] });
    expect(
      uploadInitResponseSchema.safeParse({
        status: "exists",
        asset: {
          id: uploadId,
          workspaceId: uploadId,
          documentId: null,
          kind: "pdf",
          fileName: "a.pdf",
          mime: "application/pdf",
          bytes: 3,
          sha256: "a".repeat(64),
          status: "ready",
          rejectedReason: null,
          createdAt: "2026-09-24T12:00:00.000Z",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects a multipart answer without its parts", () => {
    expect(
      uploadInitResponseSchema.safeParse({ status: "upload", uploadId, mode: "multipart" }).success,
    ).toBe(false);
  });
});
