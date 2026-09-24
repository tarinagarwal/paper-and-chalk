import { createHash, randomBytes } from "node:crypto";

import { MiB, PLAN_STORAGE_BYTES, SINGLE_UPLOAD_MAX_BYTES, type WorkspaceRecord } from "@pc/schema";
import type { SignedRequest, Storage } from "@pc/storage";
import { testStorage } from "@pc/storage/testing";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MongoConnection } from "../client";
import { typedCollections, type TypedCollections } from "../collections";
import { AccessDeniedError, InvalidRequestError } from "../errors";
import type { AccessContext } from "../permissions/can";
import { closeTestDb, openTestDb } from "../testing";
import { createFileRepositories, createRepositories, type FileRepositories } from "./index";
import type { UploadInitResult } from "./uploads";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const pdfBytes = (size = 2048) =>
  new Uint8Array([...new TextEncoder().encode("%PDF-1.7\n"), ...randomBytes(size - 9)]);
/** Big enough for a multipart upload (3 parts), shaped like an MP4. */
const videoBytes = () => {
  const bytes = new Uint8Array(randomBytes(SINGLE_UPLOAD_MAX_BYTES + 100));
  bytes.set([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom")], 0);
  return bytes;
};

async function put(request: SignedRequest, body: Uint8Array): Promise<void> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });
  if (!response.ok)
    throw new Error(`upload failed: ${String(response.status)} ${await response.text()}`);
}

/** Uploads what init asked for; for multipart, only the listed part numbers (default: all). */
async function send(result: UploadInitResult, bytes: Uint8Array, only?: number[]) {
  if (result.status !== "upload") throw new Error("nothing to upload");
  if (result.mode === "single") return put(result.request, bytes);
  for (const { partNumber, request } of result.parts) {
    if (only && !only.includes(partNumber)) continue;
    const start = (partNumber - 1) * result.partSize;
    await put(request, bytes.subarray(start, Math.min(start + result.partSize, bytes.length)));
  }
}

async function outcome(call: Promise<unknown>): Promise<string> {
  try {
    await call;
    return "allowed";
  } catch (error) {
    if (error instanceof AccessDeniedError) return error.reason;
    if (error instanceof InvalidRequestError) return error.code;
    throw error;
  }
}

describe("uploads", () => {
  let conn: MongoConnection;
  let c: TypedCollections;
  let storage: Storage;
  let files: FileRepositories;
  let team: WorkspaceRecord;
  const ids = { owner: "", editor: "", viewer: "", outsider: "" };
  const ctx = (who: keyof typeof ids): AccessContext => ({
    actor: { kind: "user", userId: ids[who], email: `${who}@example.com` },
  });
  const used = async () =>
    (await c.users.findOne({ _id: new ObjectId(ids.owner) }))?.storageUsedBytes ?? 0;
  const init = (
    who: keyof typeof ids,
    bytes: Uint8Array,
    contentType: "application/pdf" | "video/mp4" | "image/png" = "application/pdf",
    extra: { sha256?: string; documentId?: string } = {},
  ) =>
    files.uploads.init(ctx(who), {
      workspaceId: team._id,
      documentId: extra.documentId ?? null,
      fileName: contentType === "application/pdf" ? "notes.pdf" : "file.bin",
      contentType,
      size: bytes.byteLength,
      sha256: extra.sha256 ?? sha256(bytes),
    });

  beforeAll(async () => {
    conn = await openTestDb("uploads");
    c = typedCollections(conn.db);
    storage = testStorage();
    files = createFileRepositories(conn, storage);
    const repos = createRepositories(conn);
    for (const who of Object.keys(ids) as (keyof typeof ids)[]) {
      const _id = new ObjectId();
      ids[who] = _id.toHexString();
      await c.users.insertOne({
        _id,
        name: who,
        email: `${who}@example.com`,
        emailVerified: true,
        plan: "free",
        storageUsedBytes: 0,
        settings: "{}",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    team = await repos.workspaces.create(ctx("owner"), { name: "Uploads" });
    await repos.workspaces.addMember(ctx("owner"), team._id, {
      userId: ids.editor,
      role: "editor",
    });
    await repos.workspaces.addMember(ctx("owner"), team._id, {
      userId: ids.viewer,
      role: "viewer",
    });
  });

  afterAll(async () => {
    const assets = await c.assets.find().toArray();
    await Promise.all(assets.map((a) => storage.remove(a.bucket, a.key)));
    await closeTestDb(conn);
  });

  it("uploads a small file in one signed PUT, charges the owner and verifies it", async () => {
    const bytes = pdfBytes();
    const before = await used();
    const result = await init("editor", bytes);
    expect(result).toMatchObject({ status: "upload", mode: "single" });
    await send(result, bytes);
    if (result.status !== "upload") return;

    const { asset, created } = await files.uploads.complete(ctx("editor"), result.upload._id);
    expect(created).toBe(true);
    expect(asset).toMatchObject({
      status: "verifying",
      sha256Verified: true,
      chargedTo: ids.owner,
      bucket: "originals",
    });
    expect(asset.key).toMatch(new RegExp(`^test/.+/ws/${team._id}/${asset._id}$`));
    expect(await used()).toBe(before + bytes.byteLength);
    expect(await outcome(files.assets.readUrl(ctx("viewer"), asset._id))).toBe("asset_not_ready");

    expect(await files.verification.verify(asset._id)).toEqual({ status: "ready" });
    expect(await files.verification.verify(asset._id)).toEqual({
      status: "skipped",
      reason: "already_checked",
    });
    const signed = await files.assets.readUrl(ctx("viewer"), asset._id, { download: true });
    const response = await fetch(signed.url);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-disposition")).toContain("notes.pdf");
    expect(await outcome(files.assets.readUrl(ctx("outsider"), asset._id))).toBe("no_access");
  });

  it("returns the existing asset for a file the workspace already has", async () => {
    const bytes = pdfBytes();
    const first = await init("owner", bytes);
    await send(first, bytes);
    if (first.status !== "upload") return;
    const { asset } = await files.uploads.complete(ctx("owner"), first.upload._id);
    const before = await used();
    const again = await init("editor", bytes);
    expect(again).toMatchObject({ status: "exists", asset: { _id: asset._id } });
    expect(await used()).toBe(before);
  });

  it("checks who may upload and what", async () => {
    const bytes = pdfBytes();
    expect(await outcome(init("viewer", bytes))).toBe("role_too_low");
    expect(await outcome(init("outsider", bytes))).toBe("no_access");
    expect(
      await outcome(
        files.uploads.init(
          { actor: { kind: "guest", guestId: "g" } },
          {
            workspaceId: team._id,
            fileName: "a.pdf",
            contentType: "application/pdf",
            size: 10,
            sha256: sha256(bytes),
          },
        ),
      ),
    ).toBe("guests_not_allowed");
    expect(
      await outcome(
        files.uploads.init(ctx("owner"), {
          workspaceId: team._id,
          fileName: "huge.pdf",
          contentType: "application/pdf",
          size: 400 * MiB,
          sha256: sha256(bytes),
        }),
      ),
    ).toBe("file_too_large");
    await expect(
      files.uploads.init(ctx("owner"), {
        workspaceId: team._id,
        fileName: "x.svg",
        // @ts-expect-error: not on the allowlist
        contentType: "image/svg+xml",
        size: 10,
        sha256: sha256(bytes),
      }),
    ).rejects.toThrow();
  });

  it("only lets the uploader finish an upload, and only once the file is there", async () => {
    const bytes = pdfBytes();
    const result = await init("editor", bytes);
    if (result.status !== "upload") throw new Error("expected an upload");
    expect(await outcome(files.uploads.complete(ctx("owner"), result.upload._id))).toBe(
      "upload_not_found",
    );
    expect(await outcome(files.uploads.complete(ctx("editor"), result.upload._id))).toBe(
      "upload_missing",
    );
    await files.uploads.abort(ctx("editor"), result.upload._id);
    expect((await c.uploads.findOne({ _id: result.upload._id }))?.status).toBe("aborted");
  });

  it("refuses uploads past the owner's quota, even when two race for the last bytes", async () => {
    const limit = PLAN_STORAGE_BYTES.free;
    const owner = { _id: new ObjectId(ids.owner) };
    const original = await used();
    await c.users.updateOne(owner, { $set: { storageUsedBytes: limit - 3000 } });
    expect(await outcome(init("editor", pdfBytes(4000)))).toBe("quota_exceeded");

    const [a, b] = [pdfBytes(2000), pdfBytes(2000)];
    const [ra, rb] = [await init("editor", a), await init("editor", b)];
    await send(ra, a);
    await send(rb, b);
    if (ra.status !== "upload" || rb.status !== "upload") throw new Error("expected uploads");
    const results = await Promise.allSettled([
      files.uploads.complete(ctx("editor"), ra.upload._id),
      files.uploads.complete(ctx("editor"), rb.upload._id),
    ]);
    const failed = results.filter((r) => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]?.status === "rejected" && (failed[0].reason as InvalidRequestError).code).toBe(
      "quota_exceeded",
    );
    expect(await used()).toBe(limit - 1000);
    const loser = (results[0].status === "rejected" ? ra : rb).upload;
    expect(await storage.head(loser.bucket, loser.key)).toBeNull();
    await c.users.updateOne(owner, { $set: { storageUsedBytes: original } });
  });

  it("charges once when two people finish the same new file at the same time", async () => {
    const bytes = pdfBytes();
    const before = await used();
    const [ra, rb] = [await init("owner", bytes), await init("editor", bytes)];
    await send(ra, bytes);
    await send(rb, bytes);
    if (ra.status !== "upload" || rb.status !== "upload") throw new Error("expected uploads");
    const [x, y] = await Promise.all([
      files.uploads.complete(ctx("owner"), ra.upload._id),
      files.uploads.complete(ctx("editor"), rb.upload._id),
    ]);
    expect([x.created, y.created].sort()).toEqual([false, true]);
    expect(x.asset._id).toBe(y.asset._id);
    expect(await used()).toBe(before + bytes.byteLength);
    expect(await c.assets.countDocuments({ sha256: sha256(bytes) })).toBe(1);
  });

  it("rejects a file whose bytes are not the declared type, refunds it, and allows a real one later", async () => {
    const bytes = pdfBytes();
    const before = await used();
    const result = await init("editor", bytes, "image/png");
    await send(result, bytes);
    if (result.status !== "upload") return;
    const { asset } = await files.uploads.complete(ctx("editor"), result.upload._id);
    expect(await used()).toBe(before + bytes.byteLength);

    expect(await files.verification.verify(asset._id)).toEqual({
      status: "rejected",
      reason: "type_mismatch",
    });
    expect(await storage.head(asset.bucket, asset.key)).toBeNull();
    expect(await used()).toBe(before);
    expect(await outcome(files.assets.readUrl(ctx("editor"), asset._id))).toBe("asset_rejected");
    // The rejected record does not block the same bytes uploaded honestly.
    expect(await init("editor", bytes)).toMatchObject({ status: "upload" });
  });

  it("resumes a multipart upload from the parts S3 already has, then re-hashes it", async () => {
    const bytes = videoBytes();
    const first = await init("editor", bytes, "video/mp4");
    expect(first).toMatchObject({ mode: "multipart", partCount: 3, completedParts: [] });
    await send(first, bytes, [1, 2]);
    if (first.status !== "upload") return;
    expect(await outcome(files.uploads.complete(ctx("editor"), first.upload._id))).toBe(
      "upload_incomplete",
    );

    // Picking the same file again (e.g. after a reload) continues the same upload.
    const again = await init("editor", bytes, "video/mp4");
    expect(again).toMatchObject({ mode: "multipart", completedParts: [1, 2] });
    if (again.status !== "upload" || again.mode !== "multipart") return;
    expect(again.upload._id).toBe(first.upload._id);
    expect(again.parts.map((p) => p.partNumber)).toEqual([3]);
    const fresh = await files.uploads.partUrls(ctx("editor"), again.upload._id, [3]);
    expect(fresh.map((p) => p.partNumber)).toEqual([3]);
    await send(again, bytes);

    const { asset } = await files.uploads.complete(ctx("editor"), again.upload._id);
    expect(asset).toMatchObject({ sha256Verified: false, bytes: bytes.byteLength, kind: "video" });
    expect(await files.verification.verify(asset._id)).toEqual({ status: "ready" });
    expect((await c.assets.findOne({ _id: asset._id }))?.sha256Verified).toBe(true);
  });

  it("rejects a multipart upload whose bytes do not match the claimed hash", async () => {
    const bytes = videoBytes();
    const result = await init("editor", bytes, "video/mp4", { sha256: sha256(pdfBytes()) });
    await send(result, bytes);
    if (result.status !== "upload") return;
    const { asset } = await files.uploads.complete(ctx("editor"), result.upload._id);
    expect(await files.verification.verify(asset._id)).toEqual({
      status: "rejected",
      reason: "hash_mismatch",
    });
  });

  it("cancels a multipart upload so the next attempt starts fresh", async () => {
    const bytes = videoBytes();
    const first = await init("editor", bytes, "video/mp4");
    if (first.status !== "upload") return;
    await files.uploads.abort(ctx("editor"), first.upload._id);
    const again = await init("editor", bytes, "video/mp4");
    expect(again.status === "upload" && again.upload._id).not.toBe(first.upload._id);
    if (again.status === "upload") await files.uploads.abort(ctx("editor"), again.upload._id);
  });

  it("serves document files by the document's rules, including a link's download switch", async () => {
    const repos = createRepositories(conn);
    const doc = await repos.documents.create(ctx("owner"), {
      workspaceId: team._id,
      type: "canvas",
      title: "Media",
    });
    const bytes = pdfBytes();
    const result = await init("owner", bytes, "application/pdf", { documentId: doc._id });
    await send(result, bytes);
    if (result.status !== "upload") return;
    const { asset } = await files.uploads.complete(ctx("owner"), result.upload._id);
    await files.verification.verify(asset._id);

    const link = await repos.documents.createShareLink(ctx("owner"), doc._id, {
      role: "viewer",
      allowDownload: false,
    });
    const guest: AccessContext = {
      actor: { kind: "guest", guestId: "g" },
      shareLink: { token: link.token },
    };
    expect(await outcome(files.assets.readUrl(guest, asset._id))).toBe("allowed");
    expect(await outcome(files.assets.readUrl(guest, asset._id, { download: true }))).toBe(
      "download_not_allowed",
    );
    expect(await outcome(files.assets.readUrl(ctx("outsider"), asset._id))).toBe("no_access");
  });
});
