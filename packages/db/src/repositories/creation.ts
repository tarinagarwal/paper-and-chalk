/**
 * The New dialog's flows (SPEC.md section 6): notebooks, infinite canvases, imports and documents
 * from templates. Every flow ends in `insertDocument`, so all get their pages and meta Y.Doc stub.
 */
import {
  imagePageSize,
  newDocumentSchema,
  orient,
  PAGE_SIZE_PRESETS,
  PAPER_COLOR_PRESETS,
  paperPageSpec,
  systemTemplate,
  type AssetRecord,
  type DocumentRecord,
  type DocumentSource,
  type NewDocument,
  type NewDocumentParsed,
  type TemplatePage,
} from "@pc/schema";

import { InvalidRequestError } from "../errors";
import type { AccessContext } from "../permissions/can";
import { authorize, requireUser, type RepoContext } from "./context";
import { checkFolder, insertDocument, type NewDocumentRows } from "./insert";

type Target = Pick<NewDocumentRows, "workspaceId" | "folderId" | "title">;

export function creationRepository(r: RepoContext) {
  const { c } = r;

  /** The workspace's verified files with these ids, in the order asked. */
  async function readyAssets(workspaceId: string, ids: readonly string[]): Promise<AssetRecord[]> {
    const unique = [...new Set(ids)];
    const found = await c.assets.find({ _id: { $in: unique }, workspaceId }).toArray();
    const byId = new Map(found.map((a) => [a._id, a]));
    return ids.map((id) => {
      const asset = byId.get(id);
      if (!asset) throw new InvalidRequestError("unknown_asset", "A file is not in this workspace");
      if (asset.status !== "ready") {
        throw new InvalidRequestError(
          "asset_not_ready",
          `“${asset.fileName}” is still being checked`,
        );
      }
      return asset;
    });
  }

  const totalBytes = (assets: readonly AssetRecord[]) =>
    [...new Map(assets.map((a) => [a._id, a.bytes])).values()].reduce((sum, b) => sum + b, 0);

  async function notebook(
    userId: string,
    target: Target,
    input: Extract<NewDocumentParsed, { kind: "notebook" }>,
  ) {
    const cover = input.cover;
    const coverAssets =
      cover?.kind === "image" ? await readyAssets(target.workspaceId, [cover.assetId]) : [];
    if (coverAssets[0] && coverAssets[0].kind !== "image") {
      throw new InvalidRequestError("bad_cover", "A cover must be an image");
    }
    const page: TemplatePage = {
      widthPt: input.pageSpec.widthPt,
      heightPt: input.pageSpec.heightPt,
      rotation: input.pageSpec.rotation,
      background: input.pageSpec.background,
    };
    return insertDocument(r, userId, {
      ...target,
      type: "notebook",
      cover,
      defaultPageSpec: input.pageSpec,
      canvasBackground: null,
      sources: [],
      bytes: totalBytes(coverAssets),
      pages: Array.from({ length: input.pageCount }, () => page),
      attachAssetIds: coverAssets.map((a) => a._id),
    });
  }

  /**
   * Imported files in the chosen order. Images become pages now (sized to the image, or centred
   * on a paper size); PDFs are listed as sources and become pages when they are processed.
   */
  async function importFiles(
    userId: string,
    target: Target,
    input: Extract<NewDocumentParsed, { kind: "import" }>,
  ) {
    const assets = await readyAssets(
      target.workspaceId,
      input.items.map((i) => i.assetId),
    );
    const sources: DocumentSource[] = [];
    const pages: TemplatePage[] = [];
    input.items.forEach((item, i) => {
      const asset = assets[i];
      if (!asset) return;
      if (asset.kind !== "pdf" && asset.kind !== "image") {
        throw new InvalidRequestError("bad_import", `“${asset.fileName}” is not a PDF or an image`);
      }
      sources.push({ assetId: asset._id, kind: asset.kind, fileName: asset.fileName });
      if (asset.kind !== "image") return;
      const landscape = (item.widthPx ?? 3) > (item.heightPx ?? 4);
      if (input.imageFit.mode === "paper") {
        const size = orient(input.imageFit, landscape ? "landscape" : "portrait");
        pages.push({
          ...size,
          rotation: 0,
          background: {
            kind: "image",
            assetId: asset._id,
            fit: "contain",
            paperColor: input.imageFit.paperColor,
          },
        });
      } else {
        // Without its pixel size an image is centred on A4 instead.
        const size =
          item.widthPx && item.heightPx
            ? imagePageSize(item.widthPx, item.heightPx)
            : orient(PAGE_SIZE_PRESETS.a4, landscape ? "landscape" : "portrait");
        pages.push({
          ...size,
          rotation: 0,
          background: {
            kind: "image",
            assetId: asset._id,
            fit: item.widthPx && item.heightPx ? "fill" : "contain",
            paperColor: PAPER_COLOR_PRESETS.white.paperColor,
          },
        });
      }
    });
    const hasPdf = sources.some((s) => s.kind === "pdf");
    return insertDocument(r, userId, {
      ...target,
      type: hasPdf ? "pdf" : "notebook",
      cover: null,
      // Pages added later to an image notebook are plain A4.
      defaultPageSpec: hasPdf ? null : paperPageSpec("a4", "portrait", "blank"),
      canvasBackground: null,
      sources,
      bytes: totalBytes(assets),
      pages,
      attachAssetIds: assets.map((a) => a._id),
    });
  }

  async function fromTemplate(
    ctx: AccessContext,
    userId: string,
    target: Target,
    templateId: string,
  ) {
    const system = systemTemplate(templateId);
    if (system) {
      const spec = system.pageSpec;
      return insertDocument(r, userId, {
        ...target,
        type: system.type,
        cover: system.coverColor ? { kind: "color", color: system.coverColor } : null,
        defaultPageSpec: spec,
        canvasBackground: system.canvasBackground,
        sources: [],
        bytes: 0,
        pages: spec
          ? Array.from({ length: system.pageCount }, () => ({
              widthPt: spec.widthPt,
              heightPt: spec.heightPt,
              rotation: spec.rotation,
              background: spec.background,
            }))
          : [],
      });
    }
    const user = requireUser(ctx);
    // "My templates" are private: someone else's template does not exist for this user.
    const template = await c.templates.findOne({ _id: templateId, ownerId: user.userId });
    if (!template) throw new InvalidRequestError("not_found", "That template does not exist");
    return insertDocument(r, userId, {
      ...target,
      type: template.type,
      cover: template.coverColor ? { kind: "color", color: template.coverColor } : null,
      defaultPageSpec: template.defaultPageSpec,
      canvasBackground: template.canvasBackground,
      sources: [],
      bytes: 0,
      pages: template.pages,
    });
  }

  return {
    /** Throws unless the user may add documents and files to the workspace. */
    async assertCanCreate(ctx: AccessContext, workspaceId: string): Promise<void> {
      requireUser(ctx);
      await authorize(r, ctx, { type: "workspace", workspaceId }, "createContent");
    },

    /** Creates a document from the New dialog. Needs `createContent` on the workspace. */
    async create(ctx: AccessContext, raw: NewDocument): Promise<DocumentRecord> {
      const user = requireUser(ctx);
      const input = newDocumentSchema.parse(raw);
      await authorize(
        r,
        ctx,
        { type: "workspace", workspaceId: input.workspaceId },
        "createContent",
      );
      await checkFolder(r, input.workspaceId, input.folderId);
      const target: Target = {
        workspaceId: input.workspaceId,
        folderId: input.folderId,
        title: input.title,
      };
      switch (input.kind) {
        case "notebook":
          return (await notebook(user.userId, target, input)).document;
        case "canvas":
          return (
            await insertDocument(r, user.userId, {
              ...target,
              type: "canvas",
              cover: null,
              defaultPageSpec: null,
              canvasBackground: input.canvasBackground,
              sources: [],
              bytes: 0,
              pages: [],
            })
          ).document;
        case "import":
          return (await importFiles(user.userId, target, input)).document;
        case "template":
          return (await fromTemplate(ctx, user.userId, target, input.templateId)).document;
      }
    },
  };
}
