import { createHash, randomBytes } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

import { AUTH_STATE } from "../playwright.config";
import { personalWorkspaceId } from "./library-helpers";

/**
 * The upload API end to end, against the real dev buckets (keys under test/e2e/) and the local
 * workers. The browser side (hashing worker, tray, pause and resume) is unit-tested in
 * src/lib/upload; its end-to-end test returns with the import flow that uploads from the library.
 */

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const pdf = () => Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(4096)]);
/** Big enough to go up in 8 MB parts (3 of them). */
const video = () => {
  const bytes = randomBytes(17 * 1024 * 1024);
  Buffer.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom")]).copy(bytes);
  return bytes;
};

interface Signed {
  url: string;
  method: string;
  headers: Record<string, string>;
}

async function init(
  request: APIRequestContext,
  workspaceId: string,
  fileName: string,
  contentType: string,
  bytes: Buffer,
) {
  const response = await request.post("/api/uploads/init", {
    data: { workspaceId, fileName, contentType, size: bytes.length, sha256: sha256(bytes) },
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

async function put(request: APIRequestContext, signed: Signed, body: Buffer) {
  const response = await request.fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    data: body,
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function waitForStatus(request: APIRequestContext, assetId: string, status: string) {
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/assets/${assetId}`);
        return ((await response.json()) as { asset: { status: string } }).asset.status;
      },
      { timeout: 60_000, intervals: [500, 1000] },
    )
    .toBe(status);
}

test.describe("uploads (API, real S3)", () => {
  test.use({ storageState: AUTH_STATE });
  test.setTimeout(120_000);

  test("uploads a PDF with one signed PUT, verifies it, reads it back and dedupes a copy", async ({
    request,
  }) => {
    const workspaceId = await personalWorkspaceId();
    const file = pdf();
    const started = await init(request, workspaceId, "notes.pdf", "application/pdf", file);
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ status: "upload", mode: "single" });
    await put(request, started.body.request as Signed, file);

    const completed = await request.post(`/api/uploads/${String(started.body.uploadId)}/complete`);
    expect(completed.status()).toBe(201);
    const { asset } = (await completed.json()) as { asset: { id: string } };
    await waitForStatus(request, asset.id, "ready");

    const link = (await (await request.get(`/api/assets/${asset.id}/url`)).json()) as {
      url: string;
    };
    expect(link.url).toMatch(/amazonaws\.com\/.*X-Amz-Expires=900/);
    const read = await request.get(link.url);
    expect(read.status()).toBe(200);
    expect(Buffer.compare(await read.body(), file)).toBe(0);

    const again = await init(request, workspaceId, "copy.pdf", "application/pdf", file);
    expect(again.body).toMatchObject({ status: "exists", asset: { id: asset.id } });
  });

  test("rejects a file whose contents are not what its type says", async ({ request }) => {
    const workspaceId = await personalWorkspaceId();
    const fake = Buffer.from(`<html><script>alert(1)</script>${randomBytes(64).toString("hex")}`);
    const started = await init(request, workspaceId, "not-really.pdf", "application/pdf", fake);
    await put(request, started.body.request as Signed, fake);
    const completed = await request.post(`/api/uploads/${String(started.body.uploadId)}/complete`);
    const { asset } = (await completed.json()) as { asset: { id: string } };
    await waitForStatus(request, asset.id, "rejected");
    expect((await request.get(`/api/assets/${asset.id}/url`)).status()).toBe(410);
  });

  test("refuses unsupported types before anything is uploaded", async ({ request }) => {
    const workspaceId = await personalWorkspaceId();
    const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
    const started = await init(request, workspaceId, "drawing.svg", "image/svg+xml", svg);
    expect(started.status).toBe(400);
  });

  test("resumes a multipart upload where it stopped, and aborts one", async ({ request }) => {
    const workspaceId = await personalWorkspaceId();
    const file = video();
    const first = await init(request, workspaceId, "lecture.mp4", "video/mp4", file);
    expect(first.body).toMatchObject({ status: "upload", mode: "multipart", partCount: 3 });
    const partSize = first.body.partSize as number;
    const parts = first.body.parts as { partNumber: number; request: Signed }[];
    const slice = (n: number) =>
      file.subarray((n - 1) * partSize, Math.min(n * partSize, file.length));
    // Only the first part goes up, then the "tab closes".
    const one = parts.find((p) => p.partNumber === 1);
    if (!one) throw new Error("no part 1");
    await put(request, one.request, slice(1));
    const early = await request.post(`/api/uploads/${String(first.body.uploadId)}/complete`);
    expect(early.status()).toBe(409);

    // Picking the same file again resumes: part 1 is already there.
    const resumed = await init(request, workspaceId, "lecture.mp4", "video/mp4", file);
    expect(resumed.body).toMatchObject({ uploadId: first.body.uploadId, completedParts: [1] });
    for (const part of resumed.body.parts as { partNumber: number; request: Signed }[]) {
      await put(request, part.request, slice(part.partNumber));
    }
    const completed = await request.post(`/api/uploads/${String(first.body.uploadId)}/complete`);
    expect(completed.status()).toBe(201);
    const { asset } = (await completed.json()) as { asset: { id: string } };
    await waitForStatus(request, asset.id, "ready");

    const other = video();
    const cancelled = await init(request, workspaceId, "cancel-me.mp4", "video/mp4", other);
    const aborted = await request.delete(`/api/uploads/${String(cancelled.body.uploadId)}`);
    expect(aborted.ok()).toBe(true);
    expect(
      (await request.post(`/api/uploads/${String(cancelled.body.uploadId)}/complete`)).status(),
    ).toBe(404);
  });
});
