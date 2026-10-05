/**
 * Page sizes, paper templates and page spec (SPEC.md sections 3 and 6). All sizes are in points.
 */
import { z } from "zod";

import { hexColorSchema, idSchema, positivePoints } from "./primitives";

// ---------------------------------------------------------------------------------------------
// units

export const LENGTH_UNITS = ["pt", "mm", "cm", "in", "px"] as const;
export const lengthUnitSchema = z.enum(LENGTH_UNITS);
export type LengthUnit = z.infer<typeof lengthUnitSchema>;

const POINTS_PER_UNIT: Record<LengthUnit, number> = {
  pt: 1,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
  /** CSS pixels at 96 dpi. */
  px: 0.75,
};

export function toPoints(value: number, unit: LengthUnit): number {
  return value * POINTS_PER_UNIT[unit];
}

export function fromPoints(points: number, unit: LengthUnit): number {
  return points / POINTS_PER_UNIT[unit];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const mm = (w: number, h: number) => ({
  widthPt: round2(toPoints(w, "mm")),
  heightPt: round2(toPoints(h, "mm")),
});
const inch = (w: number, h: number) => ({ widthPt: w * 72, heightPt: h * 72 });

// ---------------------------------------------------------------------------------------------
// page size presets (section 6), in their natural orientation

export const PAGE_SIZE_PRESETS = {
  a0: { label: "A0", group: "iso-a", ...mm(841, 1189) },
  a1: { label: "A1", group: "iso-a", ...mm(594, 841) },
  a2: { label: "A2", group: "iso-a", ...mm(420, 594) },
  a3: { label: "A3", group: "iso-a", ...mm(297, 420) },
  a4: { label: "A4", group: "iso-a", ...mm(210, 297) },
  a5: { label: "A5", group: "iso-a", ...mm(148, 210) },
  a6: { label: "A6", group: "iso-a", ...mm(105, 148) },
  b0: { label: "B0", group: "iso-b", ...mm(1000, 1414) },
  b1: { label: "B1", group: "iso-b", ...mm(707, 1000) },
  b2: { label: "B2", group: "iso-b", ...mm(500, 707) },
  b3: { label: "B3", group: "iso-b", ...mm(353, 500) },
  b4: { label: "B4", group: "iso-b", ...mm(250, 353) },
  b5: { label: "B5", group: "iso-b", ...mm(176, 250) },
  b6: { label: "B6", group: "iso-b", ...mm(125, 176) },
  c4: { label: "C4", group: "iso-c", ...mm(229, 324) },
  c5: { label: "C5", group: "iso-c", ...mm(162, 229) },
  c6: { label: "C6", group: "iso-c", ...mm(114, 162) },
  letter: { label: "US Letter", group: "us", ...inch(8.5, 11) },
  legal: { label: "US Legal", group: "us", ...inch(8.5, 14) },
  tabloid: { label: "Tabloid", group: "us", ...inch(11, 17) },
  executive: { label: "Executive", group: "us", ...inch(7.25, 10.5) },
  indexCard: { label: "Index card (3 × 5 in)", group: "other", ...inch(3, 5) },
  slide16x9: { label: "Slide 16:9", group: "screen", widthPt: 960, heightPt: 540 },
  slide4x3: { label: "Slide 4:3", group: "screen", widthPt: 720, heightPt: 540 },
  phone: { label: "Phone screen", group: "screen", widthPt: 390, heightPt: 844 },
} as const satisfies Record<
  string,
  { label: string; group: string; widthPt: number; heightPt: number }
>;

export type PageSizePresetId = keyof typeof PAGE_SIZE_PRESETS;
export const pageSizePresetIdSchema = z.enum(
  Object.keys(PAGE_SIZE_PRESETS) as [PageSizePresetId, ...PageSizePresetId[]],
);

export const orientationSchema = z.enum(["portrait", "landscape"]);
export type Orientation = z.infer<typeof orientationSchema>;

/** Returns width and height with the long side matching the requested orientation. */
export function orient(
  size: { widthPt: number; heightPt: number },
  orientation: Orientation,
): { widthPt: number; heightPt: number } {
  const long = Math.max(size.widthPt, size.heightPt);
  const short = Math.min(size.widthPt, size.heightPt);
  return orientation === "portrait"
    ? { widthPt: short, heightPt: long }
    : { widthPt: long, heightPt: short };
}

// ---------------------------------------------------------------------------------------------
// paper templates (section 6)

export const PAPER_TEMPLATES = [
  "blank",
  "ruledCollege",
  "ruledWide",
  "ruledNarrow",
  "grid",
  "dotGrid",
  "isometric",
  "hex",
  "graphWithAxes",
  "musicStaff",
  "cornell",
  "plannerDaily",
  "plannerWeekly",
  "plannerMonthly",
  "storyboard",
  "handwritingPractice",
  "engineering",
  "calligraphySlants",
] as const;
export const paperTemplateSchema = z.enum(PAPER_TEMPLATES);
export type PaperTemplate = z.infer<typeof paperTemplateSchema>;

/** Grid spacing presets from section 6 ("5 mm, 1/4 in, custom"). */
export const GRID_SPACING_PRESETS_PT = {
  "5mm": round2(toPoints(5, "mm")),
  quarterInch: 18,
} as const;

/**
 * What each template looks like by default: its label, line spacing and margin. The New dialog
 * starts from these; people can change spacing and margins afterwards.
 */
export const TEMPLATE_DEFAULTS: Record<
  PaperTemplate,
  { label: string; spacingPt: number; marginPt: number }
> = {
  blank: { label: "Blank", spacingPt: 20, marginPt: 0 },
  // 9/32 in, 11/32 in and 1/4 in: the usual college, wide and narrow rules.
  ruledCollege: { label: "College ruled", spacingPt: 20.25, marginPt: 90 },
  ruledWide: { label: "Wide ruled", spacingPt: 24.75, marginPt: 90 },
  ruledNarrow: { label: "Narrow ruled", spacingPt: 18, marginPt: 72 },
  grid: { label: "Grid", spacingPt: GRID_SPACING_PRESETS_PT["5mm"], marginPt: 0 },
  dotGrid: { label: "Dot grid", spacingPt: GRID_SPACING_PRESETS_PT["5mm"], marginPt: 0 },
  isometric: { label: "Isometric", spacingPt: 16, marginPt: 0 },
  hex: { label: "Hex", spacingPt: 14, marginPt: 0 },
  graphWithAxes: {
    label: "Graph with axes",
    spacingPt: GRID_SPACING_PRESETS_PT["5mm"],
    marginPt: 18,
  },
  musicStaff: { label: "Music staff", spacingPt: 7.2, marginPt: 42 },
  cornell: { label: "Cornell notes", spacingPt: 20.25, marginPt: 36 },
  plannerDaily: { label: "Daily planner", spacingPt: 22, marginPt: 36 },
  plannerWeekly: { label: "Weekly planner", spacingPt: 20, marginPt: 36 },
  plannerMonthly: { label: "Monthly planner", spacingPt: 20, marginPt: 36 },
  storyboard: { label: "Storyboard", spacingPt: 16, marginPt: 36 },
  handwritingPractice: { label: "Handwriting lines", spacingPt: 12, marginPt: 36 },
  engineering: { label: "Engineering", spacingPt: 14.4, marginPt: 36 },
  calligraphySlants: { label: "Calligraphy slants", spacingPt: 10, marginPt: 36 },
};

/** Paper and line colours offered in the New dialog; "dark" is the dark-paper preset. */
export const PAPER_COLOR_PRESETS = {
  white: { label: "White", paperColor: "#ffffff", lineColor: "#cadcf1" },
  cream: { label: "Cream", paperColor: "#fbf6e8", lineColor: "#d9cfb8" },
  grey: { label: "Grey lines", paperColor: "#ffffff", lineColor: "#c7c7c7" },
  dark: { label: "Dark paper", paperColor: "#1f2124", lineColor: "#5b616b" },
} as const;

// ---------------------------------------------------------------------------------------------
// page background and spec

export const paperBackgroundSchema = z.strictObject({
  kind: z.literal("paper"),
  template: paperTemplateSchema,
  paperColor: hexColorSchema,
  lineColor: hexColorSchema,
  /** Line, grid or dot spacing. Ignored by templates that have none (blank). */
  spacingPt: positivePoints,
  marginPt: z.number().min(0),
});

export const pdfBackgroundSchema = z.strictObject({
  kind: z.literal("pdf"),
  /** The source PDF asset. Hybrid documents can hold pages from several PDFs. */
  assetId: idSchema,
  /** Zero-based page index inside that PDF. */
  pageIndex: z.int().nonnegative(),
});

/** An imported image as the page: filling a page sized to it, or centred on a paper size. */
export const IMAGE_FITS = ["fill", "contain"] as const;
export const imageBackgroundSchema = z.strictObject({
  kind: z.literal("image"),
  assetId: idSchema,
  fit: z.enum(IMAGE_FITS),
  /** Shows around a contained image. */
  paperColor: hexColorSchema,
});

export const pageBackgroundSchema = z.discriminatedUnion("kind", [
  paperBackgroundSchema,
  pdfBackgroundSchema,
  imageBackgroundSchema,
]);
export type PageBackground = z.infer<typeof pageBackgroundSchema>;

export const pageRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

/** Upper bound for custom sizes: 200 in, well above A0. */
const MAX_PAGE_PT = 14_400;

export const pageSpecSchema = z.strictObject({
  /** Preset the size came from, or "custom". */
  sizePreset: z.union([pageSizePresetIdSchema, z.literal("custom")]),
  widthPt: positivePoints.max(MAX_PAGE_PT),
  heightPt: positivePoints.max(MAX_PAGE_PT),
  rotation: pageRotationSchema,
  background: pageBackgroundSchema,
});
export type PageSpec = z.infer<typeof pageSpecSchema>;
export type PaperBackground = z.infer<typeof paperBackgroundSchema>;

/** A page size in points: 1 CSS pixel = 0.75 pt, capped to the largest page we allow. */
export function imagePageSize(
  widthPx: number,
  heightPx: number,
): { widthPt: number; heightPt: number } {
  const scale = Math.min(1, MAX_PAGE_PT / Math.max(widthPx * 0.75, heightPx * 0.75, 1));
  return {
    widthPt: round2(Math.max(1, widthPx * 0.75 * scale)),
    heightPt: round2(Math.max(1, heightPx * 0.75 * scale)),
  };
}

// ---------------------------------------------------------------------------------------------
// infinite canvas background (section 6)

export const CANVAS_PATTERNS = ["none", "dots", "grid", "lines"] as const;
export const canvasBackgroundSchema = z.strictObject({
  pattern: z.enum(CANVAS_PATTERNS),
  spacingPt: positivePoints.max(400),
  color: hexColorSchema,
  paperColor: hexColorSchema,
});
export type CanvasBackground = z.infer<typeof canvasBackgroundSchema>;

export const DEFAULT_CANVAS_BACKGROUND: CanvasBackground = {
  pattern: "dots",
  spacingPt: 20,
  color: "#cfc8ba",
  paperColor: "#f7f4ec",
};
