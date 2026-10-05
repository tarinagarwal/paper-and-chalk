/**
 * New documents (SPEC.md section 6): what the New dialog sends, the system templates it offers,
 * and the shapes of templates, saved page sizes and URL imports in the API.
 */
import { z } from "zod";

import { documentTitleSchema } from "./library";
import {
  canvasBackgroundSchema,
  DEFAULT_CANVAS_BACKGROUND,
  orient,
  PAGE_SIZE_PRESETS,
  PAPER_COLOR_PRESETS,
  pageBackgroundSchema,
  pageSizePresetIdSchema,
  pageSpecSchema,
  TEMPLATE_DEFAULTS,
  type CanvasBackground,
  type Orientation,
  type PageSizePresetId,
  type PageSpec,
  type PaperTemplate,
} from "./page";
import { hexColorSchema, positivePoints } from "./primitives";
import { documentCoverSchema } from "./records";

export const MAX_START_PAGES = 500;

const target = {
  workspaceId: z.uuid(),
  folderId: z.uuid().nullable().default(null),
  title: documentTitleSchema,
};

/** A notebook page spec must be paper: images and PDFs only come in through Import. */
const paperSpecSchema = pageSpecSchema.refine((spec) => spec.background.kind === "paper", {
  message: "Notebook pages are paper",
  path: ["background"],
});

/** An uploaded file to import, with an image's pixel size (read in the browser). */
export const importItemSchema = z.strictObject({
  assetId: z.uuid(),
  widthPx: z.int().positive().max(100_000).nullable().default(null),
  heightPx: z.int().positive().max(100_000).nullable().default(null),
});
export type ImportItem = z.output<typeof importItemSchema>;

/** How imported images become pages: sized to the image, or centred on a paper size. */
export const imageFitSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("image") }),
  z.strictObject({
    mode: z.literal("paper"),
    sizePreset: z.union([pageSizePresetIdSchema, z.literal("custom")]),
    widthPt: positivePoints.max(14_400),
    heightPt: positivePoints.max(14_400),
    paperColor: hexColorSchema,
  }),
]);
export type ImageFit = z.infer<typeof imageFitSchema>;

export const newDocumentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("notebook"),
    ...target,
    pageSpec: paperSpecSchema,
    pageCount: z.int().min(1).max(MAX_START_PAGES),
    cover: documentCoverSchema.nullable().default(null),
  }),
  z.strictObject({
    kind: z.literal("canvas"),
    ...target,
    canvasBackground: canvasBackgroundSchema,
  }),
  z.strictObject({
    kind: z.literal("import"),
    ...target,
    items: z.array(importItemSchema).min(1).max(50),
    imageFit: imageFitSchema.default({ mode: "image" }),
  }),
  z.strictObject({
    kind: z.literal("template"),
    ...target,
    /** A system template id, or the id of one of "My templates". */
    templateId: z.string().min(1).max(64),
  }),
]);
export type NewDocument = z.input<typeof newDocumentSchema>;
export type NewDocumentParsed = z.output<typeof newDocumentSchema>;

// ---------------------------------------------------------------------------------------------
// system templates

export interface SystemTemplate {
  id: string;
  name: string;
  description: string;
  type: "notebook" | "canvas";
  pageSpec: PageSpec | null;
  pageCount: number;
  canvasBackground: CanvasBackground | null;
  coverColor: string | null;
}

/** A paper page spec from a size preset, orientation and template, with its default spacing. */
export function paperPageSpec(
  sizePreset: PageSizePresetId,
  orientation: Orientation,
  template: PaperTemplate,
  colors: { paperColor: string; lineColor: string } = PAPER_COLOR_PRESETS.white,
): PageSpec {
  return {
    sizePreset,
    ...orient(PAGE_SIZE_PRESETS[sizePreset], orientation),
    rotation: 0,
    background: {
      kind: "paper",
      template,
      paperColor: colors.paperColor,
      lineColor: colors.lineColor,
      spacingPt: TEMPLATE_DEFAULTS[template].spacingPt,
      marginPt: TEMPLATE_DEFAULTS[template].marginPt,
    },
  };
}

const notebook = (
  id: string,
  name: string,
  description: string,
  spec: PageSpec,
  pageCount: number,
  coverColor: string,
): SystemTemplate => ({
  id,
  name,
  description,
  type: "notebook",
  pageSpec: spec,
  pageCount,
  canvasBackground: null,
  coverColor,
});

/** The Templates tab's gallery. Ids are stable: they are stored nowhere but in requests. */
export const SYSTEM_TEMPLATES: readonly SystemTemplate[] = [
  notebook(
    "lecture-notes",
    "Lecture notes",
    "Cornell layout on A4: cues, notes, summary.",
    paperPageSpec("a4", "portrait", "cornell"),
    10,
    "#2f5d8a",
  ),
  notebook(
    "college-notebook",
    "College notebook",
    "US Letter, college ruled with a margin.",
    paperPageSpec("letter", "portrait", "ruledCollege"),
    20,
    "#c43e18",
  ),
  notebook(
    "dot-journal",
    "Dot journal",
    "A5 dot grid for bullet journals and sketches.",
    paperPageSpec("a5", "portrait", "dotGrid", PAPER_COLOR_PRESETS.cream),
    30,
    "#5b7a3a",
  ),
  notebook(
    "daily-planner",
    "Daily planner",
    "A5 day pages: schedule, priorities and notes.",
    paperPageSpec("a5", "portrait", "plannerDaily"),
    7,
    "#c98a1b",
  ),
  notebook(
    "weekly-planner",
    "Weekly planner",
    "A4 week on a page with a notes box.",
    paperPageSpec("a4", "portrait", "plannerWeekly"),
    4,
    "#6b4fa0",
  ),
  notebook(
    "monthly-planner",
    "Monthly planner",
    "A4 landscape month grid.",
    paperPageSpec("a4", "landscape", "plannerMonthly"),
    12,
    "#a8466f",
  ),
  notebook(
    "graph-paper",
    "Graph paper",
    "A4 5 mm grid with axes for plots and maths.",
    paperPageSpec("a4", "portrait", "graphWithAxes"),
    10,
    "#2f7d74",
  ),
  notebook(
    "engineering-pad",
    "Engineering pad",
    "Letter engineering grid with a title block.",
    paperPageSpec("letter", "portrait", "engineering"),
    10,
    "#5b7a3a",
  ),
  notebook(
    "music-manuscript",
    "Music manuscript",
    "A4 staff paper.",
    paperPageSpec("a4", "portrait", "musicStaff"),
    10,
    "#1f2124",
  ),
  notebook(
    "storyboard",
    "Storyboard",
    "A4 landscape, six 16:9 frames with captions.",
    paperPageSpec("a4", "landscape", "storyboard"),
    6,
    "#6f6a60",
  ),
  notebook(
    "handwriting-practice",
    "Handwriting practice",
    "Letter guide lines with a dashed midline.",
    paperPageSpec("letter", "portrait", "handwritingPractice"),
    5,
    "#c43e18",
  ),
  notebook(
    "chalkboard",
    "Chalkboard notes",
    "Dark A4 grid paper for night owls.",
    paperPageSpec("a4", "portrait", "grid", PAPER_COLOR_PRESETS.dark),
    10,
    "#1f2124",
  ),
  {
    id: "whiteboard",
    name: "Whiteboard",
    description: "An infinite canvas with a dot grid.",
    type: "canvas",
    pageSpec: null,
    pageCount: 0,
    canvasBackground: DEFAULT_CANVAS_BACKGROUND,
    coverColor: null,
  },
];

export const systemTemplate = (id: string) => SYSTEM_TEMPLATES.find((t) => t.id === id) ?? null;

// ---------------------------------------------------------------------------------------------
// API shapes

/** A template as the Templates tab shows it: the first page is enough for its preview. */
export const templateViewSchema = z.strictObject({
  id: z.string(),
  system: z.boolean(),
  name: z.string(),
  description: z.string(),
  type: z.enum(["notebook", "canvas"]),
  pageCount: z.int().nonnegative(),
  firstPage: z
    .strictObject({ widthPt: z.number(), heightPt: z.number(), background: pageBackgroundSchema })
    .nullable(),
  canvasBackground: canvasBackgroundSchema.nullable(),
  coverColor: hexColorSchema.nullable(),
});
export type TemplateView = z.infer<typeof templateViewSchema>;

export const templateNameSchema = z.string().trim().min(1).max(80);
export const saveTemplateSchema = z.strictObject({ name: templateNameSchema });

export const pageSizePresetViewSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  widthPt: z.number(),
  heightPt: z.number(),
  unit: z.enum(["mm", "cm", "in", "px"]),
});
export type PageSizePresetView = z.infer<typeof pageSizePresetViewSchema>;

export const createPageSizePresetSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  widthPt: positivePoints.max(14_400),
  heightPt: positivePoints.max(14_400),
  unit: z.enum(["mm", "cm", "in", "px"]),
});

/** Import from a web address: HTTPS only (checked again by the worker before it fetches). */
export const importUrlSchema = z.strictObject({
  workspaceId: z.uuid(),
  url: z
    .url()
    .max(2000)
    .refine((u) => u.startsWith("https://"), "Use an https:// address"),
});

export const jobViewSchema = z.strictObject({
  id: z.uuid(),
  kind: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  output: z.unknown(),
  error: z.string().nullable(),
});
export type JobView = z.infer<typeof jobViewSchema>;

/** What the URL import job hands back. */
export const importedFileSchema = z.strictObject({
  assetId: z.uuid(),
  fileName: z.string(),
  kind: z.enum(["pdf", "image"]),
  bytes: z.number(),
});
export type ImportedFile = z.infer<typeof importedFileSchema>;
