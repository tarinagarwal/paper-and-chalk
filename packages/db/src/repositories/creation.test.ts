import {
  DEFAULT_CANVAS_BACKGROUND,
  PAGE_SIZE_PRESETS,
  paperPageSpec,
  toPoints,
  type AssetRecord,
  type DocumentRecord,
  type WorkspaceRecord,
} from "@pc/schema";
import type { Storage } from "@pc/storage";
import { testStorage } from "@pc/storage/testing";
import { ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MongoConnection } from "../client";
import { typedCollections, type TypedCollections } from "../collections";
import { AccessDeniedError, InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { closeTestDb, openTestDb } from "../testing";
import { createFileRepositories, createRepositories, type Repositories } from "./index";
import { storageBreakdown } from "./quota";
import { metaDocName, readMetaDoc } from "./ydoc";

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

const ratio = (d: { widthPt: number; heightPt: number }) =>
  Math.round((d.widthPt / d.heightPt) * 1000) / 1000;

describe("new documents", () => {
  let conn: MongoConnection;
  let c: TypedCollections;
  let repos: Repositories;
  let files: ReturnType<typeof createFileRepositories>;
  let storage: Storage;
  const people = {
    ann: new ObjectId().toHexString(),
    bob: new ObjectId().toHexString(),
    cal: new ObjectId().toHexString(),
  };
  const as = (name: keyof typeof people): AccessContext => ({
    actor: { kind: "user", userId: people[name], email: `${name}@example.com` },
  });
  const ann = as("ann");
  const bob = as("bob");
  const cal = as("cal");
  let ws: WorkspaceRecord;

  const pagesOf = (documentId: string) =>
    c.pages.find({ documentId, deletedAt: null }).sort({ orderKey: 1 }).toArray();

  async function metaOf(documentId: string) {
    const record = await c.yjsUpdates.findOne({ docName: metaDocName(documentId) });
    if (!record) throw new Error("no meta doc");
    // MongoDB hands binary data back as a Binary: read its bytes.
    const update = record.update as unknown as { buffer: Uint8Array } | Uint8Array;
    return readMetaDoc(update instanceof Uint8Array ? update : update.buffer);
  }

  /** An uploaded, verified file in the workspace (no bytes needed for these tests). */
  async function asset(kind: "pdf" | "image", bytes = 1000, workspace = ws): Promise<AssetRecord> {
    const record: AssetRecord = {
      _id: newId(),
      workspaceId: workspace._id,
      documentId: null,
      kind,
      bucket: kind === "pdf" ? "originals" : "assets",
      key: storage.key("ws", workspace._id, newId()),
      fileName: kind === "pdf" ? "reading.pdf" : "photo.png",
      bytes,
      mime: kind === "pdf" ? "application/pdf" : "image/png",
      sha256: newId().replace(/-/g, "").padEnd(64, "0").slice(0, 64),
      sha256Verified: true,
      status: "ready",
      rejectedReason: null,
      createdBy: people.ann,
      chargedTo: people.ann,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await c.assets.insertOne(record);
    await c.users.updateOne(
      { _id: ObjectId.createFromHexString(people.ann) },
      { $inc: { storageUsedBytes: bytes } },
    );
    return record;
  }

  beforeAll(async () => {
    conn = await openTestDb("creation");
    c = typedCollections(conn.db);
    repos = createRepositories(conn);
    storage = testStorage();
    files = createFileRepositories(conn, storage);
    for (const [name, id] of Object.entries(people)) {
      await c.users.insertOne({
        _id: ObjectId.createFromHexString(id),
        name,
        email: `${name}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        plan: "free",
        storageUsedBytes: 0,
        settings: "{}",
      });
      await repos.ensurePersonalWorkspace(id);
    }
    ws = await repos.workspaces.create(ann, { name: "Studio" });
    await repos.workspaces.addMember(ann, ws._id, { userId: people.bob, role: "viewer" });
  });

  afterAll(async () => {
    await closeTestDb(conn);
  });

  describe("notebooks", () => {
    it("creates an A4 portrait dot-grid notebook with 5 pages and its meta doc", async () => {
      const spec = paperPageSpec("a4", "portrait", "dotGrid");
      const doc = await repos.creation.create(ann, {
        kind: "notebook",
        workspaceId: ws._id,
        title: "Dots",
        pageSpec: spec,
        pageCount: 5,
        cover: { kind: "color", color: "#2f5d8a" },
      });
      expect(doc).toMatchObject({ type: "notebook", pageCount: 5, cover: { color: "#2f5d8a" } });
      const pages = await pagesOf(doc._id);
      expect(pages).toHaveLength(5);
      for (const page of pages) {
        expect(page).toMatchObject({ widthPt: spec.widthPt, heightPt: spec.heightPt });
        expect(page.background).toMatchObject({ kind: "paper", template: "dotGrid" });
      }
      const meta = await metaOf(doc._id);
      expect(meta.pages).toEqual(pages.map((p) => p._id));
      expect(meta.settings).toMatchObject({ type: "notebook" });
      expect(meta.layers).toHaveLength(1);
    });

    it("keeps every size's proportions: A3 landscape, B5, Letter and a custom 100 x 150 mm", async () => {
      const cases = [
        { spec: paperPageSpec("a3", "landscape", "grid"), expected: 420 / 297 },
        { spec: paperPageSpec("b5", "portrait", "grid"), expected: 176 / 250 },
        { spec: paperPageSpec("letter", "portrait", "grid"), expected: 8.5 / 11 },
        {
          spec: {
            ...paperPageSpec("a4", "portrait", "grid"),
            sizePreset: "custom" as const,
            widthPt: toPoints(100, "mm"),
            heightPt: toPoints(150, "mm"),
          },
          expected: 100 / 150,
        },
      ];
      for (const { spec, expected } of cases) {
        const doc = await repos.creation.create(ann, {
          kind: "notebook",
          workspaceId: ws._id,
          title: spec.sizePreset,
          pageSpec: spec,
          pageCount: 1,
        });
        const [page] = await pagesOf(doc._id);
        expect(page && ratio(page), spec.sizePreset).toBeCloseTo(expected, 2);
      }
      expect(ratio(PAGE_SIZE_PRESETS.a4)).toBeCloseTo(210 / 297, 3);
    });

    it("needs permission to add to the workspace and a folder inside it", async () => {
      const input = {
        kind: "notebook" as const,
        workspaceId: ws._id,
        title: "Nope",
        pageSpec: paperPageSpec("a5", "portrait", "blank"),
        pageCount: 1,
      };
      expect(await outcome(repos.creation.create(bob, input))).toBe("role_too_low");
      expect(await outcome(repos.creation.create(cal, input))).toBe("no_access");
      const calHome = await c.workspaces.findOne({ ownerId: people.cal, personal: true });
      const elsewhere = await repos.folders.create(cal, {
        workspaceId: calHome?._id ?? "",
        name: "X",
      });
      expect(await outcome(repos.creation.create(ann, { ...input, folderId: elsewhere._id }))).toBe(
        "wrong_folder",
      );
    });
  });

  describe("canvases", () => {
    it("keeps the background on the document and in the meta doc", async () => {
      const background = { ...DEFAULT_CANVAS_BACKGROUND, pattern: "grid" as const, spacingPt: 32 };
      const doc = await repos.creation.create(ann, {
        kind: "canvas",
        workspaceId: ws._id,
        title: "Board",
        canvasBackground: background,
      });
      expect(doc).toMatchObject({ type: "canvas", pageCount: 0, canvasBackground: background });
      expect((await metaOf(doc._id)).settings).toMatchObject({ canvasBackground: background });
    });
  });

  describe("imports", () => {
    it("lists files in order, makes image pages now and PDF pages later", async () => {
      const pdf = await asset("pdf", 5000);
      const photo = await asset("image", 700);
      const doc = await repos.creation.create(ann, {
        kind: "import",
        workspaceId: ws._id,
        title: "Mixed",
        items: [{ assetId: pdf._id }, { assetId: photo._id, widthPx: 1600, heightPx: 1200 }],
      });
      expect(doc).toMatchObject({ type: "pdf", bytes: 5700, pageCount: 1 });
      expect(doc.sources.map((s) => [s.kind, s.assetId])).toEqual([
        ["pdf", pdf._id],
        ["image", photo._id],
      ]);
      const [page] = await pagesOf(doc._id);
      expect(page).toMatchObject({
        widthPt: 1200,
        heightPt: 900,
        background: { kind: "image", assetId: photo._id, fit: "fill" },
      });
      // Both files now belong to this document.
      expect(await c.assets.countDocuments({ documentId: doc._id })).toBe(2);
    });

    it("fits images on a paper size, turned to match the image", async () => {
      const wide = await asset("image");
      const doc = await repos.creation.create(ann, {
        kind: "import",
        workspaceId: ws._id,
        title: "Scans",
        items: [{ assetId: wide._id, widthPx: 3000, heightPx: 2000 }],
        imageFit: {
          mode: "paper",
          sizePreset: "a4",
          widthPt: PAGE_SIZE_PRESETS.a4.widthPt,
          heightPt: PAGE_SIZE_PRESETS.a4.heightPt,
          paperColor: "#ffffff",
        },
      });
      expect(doc.type).toBe("notebook");
      const [page] = await pagesOf(doc._id);
      expect(page).toMatchObject({
        widthPt: PAGE_SIZE_PRESETS.a4.heightPt,
        heightPt: PAGE_SIZE_PRESETS.a4.widthPt,
        background: { fit: "contain" },
      });
    });

    it("only takes verified files from the same workspace", async () => {
      const checking = await asset("pdf");
      await c.assets.updateOne({ _id: checking._id }, { $set: { status: "verifying" } });
      const calHome = await c.workspaces.findOne({ ownerId: people.cal, personal: true });
      const foreign = calHome ? await asset("pdf", 10, calHome) : null;
      const input = (assetId: string) => ({
        kind: "import" as const,
        workspaceId: ws._id,
        title: "Bad",
        items: [{ assetId }],
      });
      expect(await outcome(repos.creation.create(ann, input(checking._id)))).toBe(
        "asset_not_ready",
      );
      expect(await outcome(repos.creation.create(ann, input(foreign?._id ?? "")))).toBe(
        "unknown_asset",
      );
    });
  });

  describe("templates", () => {
    it("creates from a system template", async () => {
      const doc = await repos.creation.create(ann, {
        kind: "template",
        workspaceId: ws._id,
        title: "Biology",
        templateId: "lecture-notes",
      });
      expect(doc).toMatchObject({ pageCount: 10, cover: { kind: "color" } });
      expect((await pagesOf(doc._id))[0]?.background).toMatchObject({ template: "cornell" });
      const board = await repos.creation.create(ann, {
        kind: "template",
        workspaceId: ws._id,
        title: "Board",
        templateId: "whiteboard",
      });
      expect(board).toMatchObject({ type: "canvas", canvasBackground: DEFAULT_CANVAS_BACKGROUND });
    });

    it("saves a notebook as a private template and creates from it", async () => {
      const source = await repos.creation.create(ann, {
        kind: "notebook",
        workspaceId: ws._id,
        title: "Weekly",
        pageSpec: paperPageSpec("a5", "landscape", "plannerWeekly"),
        pageCount: 3,
        cover: { kind: "color", color: "#6b4fa0" },
      });
      // A viewer can keep a template of what they see.
      const template = await repos.templates.saveFromDocument(bob, source._id, "My weeks");
      expect(template).toMatchObject({
        ownerId: people.bob,
        type: "notebook",
        coverColor: "#6b4fa0",
      });
      expect(template.pages).toHaveLength(3);
      expect((await repos.templates.list(bob)).map((t) => t.name)).toEqual(["My weeks"]);
      expect(await repos.templates.list(ann)).toEqual([]);

      const bobHome = await c.workspaces.findOne({ ownerId: people.bob, personal: true });
      const copy = await repos.creation.create(bob, {
        kind: "template",
        workspaceId: bobHome?._id ?? "",
        title: "From my template",
        templateId: template._id,
      });
      const pages = await pagesOf(copy._id);
      expect(pages).toHaveLength(3);
      expect(pages[0]).toMatchObject({
        widthPt: PAGE_SIZE_PRESETS.a5.heightPt,
        background: { template: "plannerWeekly" },
      });
      // Someone else's template does not exist for Ann.
      expect(
        await outcome(
          repos.creation.create(ann, {
            kind: "template",
            workspaceId: ws._id,
            title: "Stolen",
            templateId: template._id,
          }),
        ),
      ).toBe("not_found");
      expect(await outcome(repos.templates.delete(ann, template._id))).toBe("not_found");
      await repos.templates.rename(bob, template._id, "Weeks");
      await repos.templates.delete(bob, template._id);
      expect(await repos.templates.list(bob)).toEqual([]);
    });

    it("refuses to make templates of imported files", async () => {
      const pdf = await asset("pdf");
      const doc = await repos.creation.create(ann, {
        kind: "import",
        workspaceId: ws._id,
        title: "Paper",
        items: [{ assetId: pdf._id }],
      });
      expect(await outcome(repos.templates.saveFromDocument(ann, doc._id, "PDF"))).toBe(
        "template_needs_paper",
      );
    });
  });

  describe("saved page sizes", () => {
    it("are private to the person who saved them", async () => {
      const size = await repos.pageSizePresets.create(ann, {
        name: "Pocket",
        widthPt: toPoints(90, "mm"),
        heightPt: toPoints(140, "mm"),
        unit: "mm",
      });
      expect((await repos.pageSizePresets.list(ann)).map((p) => p.name)).toEqual(["Pocket"]);
      expect(await repos.pageSizePresets.list(bob)).toEqual([]);
      expect(await outcome(repos.pageSizePresets.delete(bob, size._id))).toBe("not_found");
      await repos.pageSizePresets.delete(ann, size._id);
      expect(await repos.pageSizePresets.list(ann)).toEqual([]);
    });
  });

  describe("shared files", () => {
    let original: DocumentRecord;
    let photo: AssetRecord;

    beforeAll(async () => {
      photo = await asset("image", 4000);
      original = await repos.creation.create(ann, {
        kind: "import",
        workspaceId: ws._id,
        title: "Holiday",
        items: [{ assetId: photo._id, widthPx: 800, heightPx: 600 }],
      });
    });

    it("lets someone with the document read its image, and nobody through another document", async () => {
      // Cal is not in the workspace but has the document.
      await repos.documents.grant(ann, original._id, {
        principal: { kind: "user", userId: people.cal },
        role: "viewer",
      });
      const url = await files.assets.readUrl(cal, photo._id, { documentId: original._id });
      expect(url.url).toContain("X-Amz-Expires=900");
      // A loose file of the workspace (in no document) stays out of reach.
      const loose = await asset("image");
      expect(await outcome(files.assets.readUrl(cal, loose._id))).toBe("no_access");
      const other = await repos.creation.create(ann, {
        kind: "notebook",
        workspaceId: ws._id,
        title: "Plain",
        pageSpec: paperPageSpec("a4", "portrait", "blank"),
        pageCount: 1,
      });
      await repos.documents.grant(ann, other._id, {
        principal: { kind: "user", userId: people.cal },
        role: "viewer",
      });
      expect(await outcome(files.assets.readUrl(cal, photo._id, { documentId: other._id }))).toBe(
        "not_found",
      );
    });

    it("keeps a file while any document still uses it, then deletes and refunds it", async () => {
      const used = async () =>
        (await c.users.findOne({ _id: ObjectId.createFromHexString(people.ann) }))
          ?.storageUsedBytes ?? 0;
      const copy = await repos.documents.duplicate(ann, original._id);
      expect(copy).toMatchObject({ bytes: 4000, sources: original.sources });
      expect((await pagesOf(copy._id))[0]?.background).toMatchObject({ assetId: photo._id });

      const before = await used();
      await repos.documents.trash(ann, original._id);
      expect((await files.trash.purge(ann, [original._id])).done).toEqual([original._id]);
      expect(await c.assets.countDocuments({ _id: photo._id })).toBe(1);
      expect(await used()).toBe(before);

      await repos.documents.trash(ann, copy._id);
      await files.trash.purge(ann, [copy._id]);
      expect(await c.assets.countDocuments({ _id: photo._id })).toBe(0);
      expect(await used()).toBe(before - 4000);
      expect(await c.yjsUpdates.countDocuments({ documentId: copy._id })).toBe(0);
    });
  });

  describe("fetched files and jobs", () => {
    it("records a fetched file once per workspace and charges it once", async () => {
      const sha256 = "a".repeat(64);
      const first = await files.imports.registerFetched({
        assetId: newId(),
        workspaceId: ws._id,
        userId: people.ann,
        fileName: "web.pdf",
        mime: "application/pdf",
        bucket: "originals",
        key: storage.key("fetched", "one"),
        bytes: 900,
        sha256,
      });
      expect(first).toMatchObject({ created: true, asset: { status: "ready", documentId: null } });
      const again = await files.imports.registerFetched({
        assetId: newId(),
        workspaceId: ws._id,
        userId: people.bob,
        fileName: "same.pdf",
        mime: "application/pdf",
        bucket: "originals",
        key: storage.key("fetched", "two"),
        bytes: 900,
        sha256,
      });
      expect(again).toMatchObject({ created: false, asset: { _id: first.asset._id } });
    });

    it("shows a job only to the person who started it", async () => {
      const job = await repos.jobs.create("importFromUrl", {
        workspaceId: ws._id,
        userId: people.ann,
        url: "https://example.com/a.pdf",
      });
      expect((await repos.jobs.getForUser(job._id, people.ann))?._id).toBe(job._id);
      expect(await repos.jobs.getForUser(job._id, people.bob)).toBeNull();
    });
  });

  describe("storage breakdown", () => {
    it("splits files in documents from loose ones and lists the largest documents", async () => {
      const before = await storageBreakdown(c, people.cal);
      expect(before).toEqual({ inDocumentsBytes: 0, unattachedBytes: 0, largest: [] });

      const calWs = await repos.workspaces.create(cal, { name: "Cal's" });
      const make = async (bytes: number, title: string) => {
        const file = await asset("image", bytes, calWs);
        await c.assets.updateOne({ _id: file._id }, { $set: { chargedTo: people.cal } });
        return repos.creation.create(cal, {
          kind: "import",
          workspaceId: calWs._id,
          title,
          items: [{ assetId: file._id, widthPx: 100, heightPx: 100 }],
        });
      };
      await make(3000, "Big");
      const small = await make(1000, "Small");
      const loose = await asset("pdf", 500, calWs);
      await c.assets.updateOne({ _id: loose._id }, { $set: { chargedTo: people.cal } });
      await repos.documents.trash(cal, small._id);

      const after = await storageBreakdown(c, people.cal);
      expect(after.inDocumentsBytes).toBe(4000);
      expect(after.unattachedBytes).toBe(500);
      // Trashed documents still use their files until purged, but are not listed as live.
      expect(after.largest.map((d) => [d.title, d.bytes])).toEqual([["Big", 3000]]);
    });
  });
});
