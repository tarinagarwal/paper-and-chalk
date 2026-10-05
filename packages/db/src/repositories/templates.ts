/**
 * "My templates" and saved page sizes (SPEC.md sections 6 and 25). Both are private to the user
 * who made them: every query is filtered by the actor's id, so other people's records do not
 * exist for them.
 */
import {
  pageSizePresetRecordSchema,
  SYSTEM_TEMPLATES,
  templateRecordSchema,
  type PageSizePresetRecord,
  type TemplateRecord,
  type TemplateView,
} from "@pc/schema";

import { InvalidRequestError } from "../errors";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { authorize, requireUser, type RepoContext } from "./context";

const notFound = () => new InvalidRequestError("not_found", "That template does not exist");

export function systemTemplateViews(): TemplateView[] {
  return SYSTEM_TEMPLATES.map((t) => ({
    id: t.id,
    system: true,
    name: t.name,
    description: t.description,
    type: t.type,
    pageCount: t.pageCount,
    firstPage: t.pageSpec
      ? {
          widthPt: t.pageSpec.widthPt,
          heightPt: t.pageSpec.heightPt,
          background: t.pageSpec.background,
        }
      : null,
    canvasBackground: t.canvasBackground,
    coverColor: t.coverColor,
  }));
}

export function templateView(template: TemplateRecord): TemplateView {
  const first = template.pages[0];
  return {
    id: template._id,
    system: false,
    name: template.name,
    description:
      template.type === "canvas"
        ? "Infinite canvas"
        : `${String(template.pages.length)} ${template.pages.length === 1 ? "page" : "pages"}`,
    type: template.type,
    pageCount: template.pages.length,
    firstPage: first
      ? { widthPt: first.widthPt, heightPt: first.heightPt, background: first.background }
      : null,
    canvasBackground: template.canvasBackground,
    coverColor: template.coverColor,
  };
}

export function templatesRepository(r: RepoContext) {
  const { c } = r;

  return {
    /** The user's own templates, newest first. */
    async list(ctx: AccessContext): Promise<TemplateRecord[]> {
      const user = requireUser(ctx);
      return c.templates
        .find({ ownerId: user.userId })
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();
    },

    /**
     * Saves a notebook or canvas's setup (page sizes and paper, cover colour, canvas background)
     * as a template. Anyone who can see the document may keep a template of it. Drawings are not
     * part of it yet: they are stored from the editor step on.
     */
    async saveFromDocument(
      ctx: AccessContext,
      documentId: string,
      name: string,
    ): Promise<TemplateRecord> {
      const user = requireUser(ctx);
      await authorize(r, ctx, { type: "document", documentId }, "view");
      const document = await c.documents.findOne({ _id: documentId, deletedAt: null });
      if (!document) throw new InvalidRequestError("not_found", "Document not found");
      if (document.type === "pdf") {
        throw new InvalidRequestError(
          "template_needs_paper",
          "Imported PDFs can't be templates yet",
        );
      }
      const pages = await c.pages
        .find({ documentId, deletedAt: null })
        .sort({ orderKey: 1, _id: 1 })
        .toArray();
      if (pages.some((p) => p.background.kind !== "paper")) {
        throw new InvalidRequestError(
          "template_needs_paper",
          "Only documents with paper pages can be templates",
        );
      }
      const now = r.now();
      const template = templateRecordSchema.parse({
        _id: newId(),
        ownerId: user.userId,
        name,
        type: document.type,
        defaultPageSpec: document.defaultPageSpec,
        pages: pages.slice(0, 500).map((p) => ({
          widthPt: p.widthPt,
          heightPt: p.heightPt,
          rotation: p.rotation,
          background: p.background,
        })),
        canvasBackground: document.canvasBackground,
        coverColor: document.cover?.kind === "color" ? document.cover.color : null,
        sourceDocumentId: document._id,
        createdAt: now,
        updatedAt: now,
      });
      await c.templates.insertOne(template);
      return template;
    },

    async rename(ctx: AccessContext, templateId: string, name: string): Promise<void> {
      const user = requireUser(ctx);
      const parsed = templateRecordSchema.shape.name.parse(name);
      const result = await c.templates.updateOne(
        { _id: templateId, ownerId: user.userId },
        { $set: { name: parsed, updatedAt: r.now() } },
      );
      if (result.matchedCount === 0) throw notFound();
    },

    async delete(ctx: AccessContext, templateId: string): Promise<void> {
      const user = requireUser(ctx);
      const result = await c.templates.deleteOne({ _id: templateId, ownerId: user.userId });
      if (result.deletedCount === 0) throw notFound();
    },
  };
}

export function pageSizePresetsRepository(r: RepoContext) {
  const { c } = r;
  return {
    async list(ctx: AccessContext): Promise<PageSizePresetRecord[]> {
      const user = requireUser(ctx);
      return c.pageSizePresets.find({ userId: user.userId }).sort({ createdAt: 1 }).toArray();
    },

    async create(
      ctx: AccessContext,
      input: {
        name: string;
        widthPt: number;
        heightPt: number;
        unit: PageSizePresetRecord["unit"];
      },
    ): Promise<PageSizePresetRecord> {
      const user = requireUser(ctx);
      if ((await c.pageSizePresets.countDocuments({ userId: user.userId })) >= 50) {
        throw new InvalidRequestError("too_many_sizes", "You can keep up to 50 page sizes");
      }
      const now = r.now();
      const preset = pageSizePresetRecordSchema.parse({
        _id: newId(),
        userId: user.userId,
        ...input,
        createdAt: now,
        updatedAt: now,
      });
      await c.pageSizePresets.insertOne(preset);
      return preset;
    },

    async delete(ctx: AccessContext, presetId: string): Promise<void> {
      const user = requireUser(ctx);
      const result = await c.pageSizePresets.deleteOne({ _id: presetId, userId: user.userId });
      if (result.deletedCount === 0) {
        throw new InvalidRequestError("not_found", "That page size does not exist");
      }
    },
  };
}
