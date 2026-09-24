import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BUCKETS } from "./config";
import type { SignedRequest, Storage } from "./client";
import { testStorage } from "./testing";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Sends a signed request the way the browser will: the signed headers and nothing else. */
async function send(
  request: SignedRequest,
  body: Uint8Array,
  headers: Record<string, string> = {},
) {
  return fetch(request.url, {
    method: request.method,
    headers: { ...request.headers, ...headers },
    body,
  });
}

describe("storage against the dev buckets", () => {
  let storage: Storage;
  const written: { bucket: "assets" | "originals"; key: string }[] = [];

  beforeAll(() => {
    storage = testStorage();
  });

  afterAll(async () => {
    // The lifecycle rule would delete these after a day; tidy up now anyway.
    await Promise.all(written.map(({ bucket, key }) => storage.remove(bucket, key)));
  });

  it("sees all five buckets", async () => {
    for (const bucket of BUCKETS) expect(await storage.bucketExists(bucket), bucket).toBe(true);
  });

  it("keeps every test key under test/", () => {
    expect(storage.key("ws", "abc", "def")).toMatch(/^test\/[0-9a-f-]{36}\/ws\/abc\/def$/);
  });

  describe("single signed PUT", () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 a tiny test file for Paper & Chalk\n");
    const input = () => ({
      bucket: "originals" as const,
      key: storage.key("single", "file.pdf"),
      contentType: "application/pdf",
      size: bytes.byteLength,
      sha256Hex: sha256(bytes),
    });

    it("uploads with the signed headers and records the checksum", async () => {
      const request = input();
      written.push({ bucket: "originals", key: request.key });
      const signed = await storage.presignUpload(request);
      expect(Object.keys(signed.headers).sort()).toEqual(["content-type", "x-amz-checksum-sha256"]);
      const response = await send(signed, bytes);
      expect(response.status, await response.text()).toBe(200);

      const info = await storage.head("originals", request.key);
      expect(info).toMatchObject({ size: bytes.byteLength, contentType: "application/pdf" });
      expect(info?.checksumSha256).toBe(Buffer.from(request.sha256Hex, "hex").toString("base64"));
    });

    it("is refused with a different content type", async () => {
      const signed = await storage.presignUpload(input());
      const response = await send(signed, bytes, { "content-type": "text/html" });
      expect(response.status).toBe(403);
    });

    it("is refused with a different size", async () => {
      const signed = await storage.presignUpload(input());
      const response = await send(signed, new Uint8Array([...bytes, 0x20]));
      expect(response.status).toBe(403);
    });

    it("is refused when the bytes do not match the hash", async () => {
      const signed = await storage.presignUpload(input());
      const tampered = new Uint8Array(bytes);
      tampered[0] = 0x41;
      const response = await send(signed, tampered);
      expect(response.status).toBe(400);
      expect(await response.text()).toMatch(/checksum|digest/i);
    });
  });

  describe("multipart", () => {
    const partSize = 5 * 1024 * 1024;
    const data = new Uint8Array(randomBytes(partSize + 1234));
    const parts = [data.subarray(0, partSize), data.subarray(partSize)];

    it("uploads parts, resumes from the listed parts and completes", async () => {
      const key = storage.key("multi", "clip.webm");
      written.push({ bucket: "assets", key });
      const uploadId = await storage.startMultipart({
        bucket: "assets",
        key,
        contentType: "audio/webm",
      });

      const first = await storage.presignPart({
        bucket: "assets",
        key,
        uploadId,
        partNumber: 1,
        size: parts[0]?.byteLength ?? 0,
      });
      expect((await send(first, parts[0] ?? new Uint8Array())).status).toBe(200);
      // A paused upload learns what S3 already has.
      expect(
        (await storage.listParts({ bucket: "assets", key, uploadId })).map((p) => p.partNumber),
      ).toEqual([1]);

      const second = await storage.presignPart({
        bucket: "assets",
        key,
        uploadId,
        partNumber: 2,
        size: parts[1]?.byteLength ?? 0,
      });
      expect((await send(second, parts[1] ?? new Uint8Array())).status).toBe(200);

      const listed = await storage.listParts({ bucket: "assets", key, uploadId });
      expect(listed.map((p) => p.size)).toEqual([partSize, 1234]);
      await storage.completeMultipart({ bucket: "assets", key, uploadId, parts: listed });

      expect((await storage.head("assets", key))?.size).toBe(data.byteLength);
      expect(await storage.sha256Hex("assets", key)).toBe(sha256(data));
    });

    it("refuses a part of the wrong size", async () => {
      const key = storage.key("multi", "wrong.webm");
      const uploadId = await storage.startMultipart({
        bucket: "assets",
        key,
        contentType: "audio/webm",
      });
      const signed = await storage.presignPart({
        bucket: "assets",
        key,
        uploadId,
        partNumber: 1,
        size: 10,
      });
      expect((await send(signed, new Uint8Array(11))).status).toBe(403);
      await storage.abortMultipart({ bucket: "assets", key, uploadId });
      await storage.abortMultipart({ bucket: "assets", key, uploadId });
    });
  });

  describe("reading", () => {
    const bytes = new TextEncoder().encode("\x89PNG\r\n\x1a\n pretend image bytes");
    let key: string;

    beforeAll(async () => {
      key = storage.key("read", "picture.png");
      written.push({ bucket: "assets", key });
      const signed = await storage.presignUpload({
        bucket: "assets",
        key,
        contentType: "image/png",
        size: bytes.byteLength,
        sha256Hex: sha256(bytes),
      });
      expect((await send(signed, bytes)).status).toBe(200);
    });

    it("signs 15-minute read URLs that name the file", async () => {
      const signed = await storage.presignRead({
        bucket: "assets",
        key,
        fileName: "My picture.png",
        download: true,
      });
      expect(new URL(signed.url).searchParams.get("X-Amz-Expires")).toBe("900");
      const response = await fetch(signed.url);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-disposition")).toBe(
        "attachment; filename*=UTF-8''My%20picture.png",
      );
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    });

    it("reads the first bytes, copies and deletes", async () => {
      expect(await storage.readStart("assets", key, 8)).toEqual(bytes.subarray(0, 8));
      const copyKey = storage.key("read", "copy.png");
      await storage.copy({ bucket: "assets", key }, { bucket: "assets", key: copyKey });
      expect((await storage.head("assets", copyKey))?.size).toBe(bytes.byteLength);
      await storage.remove("assets", copyKey);
      expect(await storage.head("assets", copyKey)).toBeNull();
    });
  });

  describe("CORS", () => {
    const preflight = async (bucket: string, origin: string) =>
      fetch(`https://${bucket}.s3.${storage.config.region}.amazonaws.com/test/cors-check`, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "PUT",
          "access-control-request-headers": "content-type,x-amz-checksum-sha256",
        },
      });

    it("lets the app origin upload and exposes ETag", async () => {
      const response = await preflight(storage.config.buckets.originals, "http://localhost:3000");
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
      expect(response.headers.get("access-control-expose-headers")).toMatch(/ETag/);
    });

    it("refuses other origins", async () => {
      const response = await preflight(storage.config.buckets.originals, "https://evil.example");
      expect(response.status).toBe(403);
    });
  });
});
