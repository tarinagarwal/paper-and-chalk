/**
 * Element schema (SPEC.md section 3). Every element on a page or canvas chunk is one of these,
 * stored in the page's `elements` Y.Map keyed by id.
 *
 * `data` holds only fields the spec names for each type. Types whose features are built in later
 * steps get their remaining fields added in those steps.
 */
import { z } from "zod";

import {
  epochMsSchema,
  finiteNumber,
  fractionalIndexSchema,
  hexColorSchema,
  idSchema,
  pointSchema,
  positivePoints,
} from "./primitives";

export const ELEMENT_TYPES = [
  "stroke",
  "shape",
  "text",
  "image",
  "sticky",
  "connector",
  "table",
  "tape",
  "embed",
  "audioMarker",
  "math",
  "code",
  "frame",
  "group",
] as const;
export const elementTypeSchema = z.enum(ELEMENT_TYPES);
export type ElementType = z.infer<typeof elementTypeSchema>;

export const blendModeSchema = z.enum(["normal", "multiply"]);
export type BlendMode = z.infer<typeof blendModeSchema>;

export const elementStyleSchema = z.strictObject({
  color: hexColorSchema,
  /** Stroke or outline width in points. Section 9 caps ink at 50 pt. */
  width: z.number().min(0).max(50),
  opacity: z.number().min(0).max(1),
  blend: blendModeSchema,
});
export type ElementStyle = z.infer<typeof elementStyleSchema>;

/** Fields shared by every element type. */
const elementBase = {
  id: idSchema,
  z: fractionalIndexSchema,
  layerId: idSchema,
  x: finiteNumber,
  y: finiteNumber,
  /** Radians, clockwise, around the element's origin. */
  rotation: finiteNumber,
  /** Negative values flip. Zero is not allowed (it would make the element unrecoverable). */
  scaleX: finiteNumber.refine((v) => v !== 0, "scaleX cannot be 0"),
  scaleY: finiteNumber.refine((v) => v !== 0, "scaleY cannot be 0"),
  locked: z.boolean(),
  hidden: z.boolean(),
  groupId: idSchema.nullable(),
  style: elementStyleSchema,
  /** User id, or a guest's temporary id (section 4). */
  createdBy: z.string().min(1).max(128),
  createdAt: epochMsSchema,
  /** Milliseconds into the active audio recording when this element was created (section 19). */
  audioTimestamp: z.int().nonnegative().nullable(),
};

const size = { width: positivePoints, height: positivePoints };

// ---------------------------------------------------------------------------------------------
// stroke

/** Pen tools whose strokes are saved. The laser pointer is never saved (section 9). */
export const INK_TOOLS = [
  "ballpoint",
  "fountain",
  "brush",
  "pencil",
  "marker",
  "calligraphy",
  "highlighter",
] as const;
export const inkToolSchema = z.enum(INK_TOOLS);
export type InkTool = z.infer<typeof inkToolSchema>;

/** Each stroke sample is 5 float32 values: x, y, pressure, tilt, t. */
export const STROKE_SAMPLE_FLOATS = 5;
export const STROKE_SAMPLE_BYTES = STROKE_SAMPLE_FLOATS * Float32Array.BYTES_PER_ELEMENT;

/**
 * Packed, delta-encoded Float32 samples stored as raw bytes. Yjs stores Uint8Array natively but not
 * Float32Array, so the Float32Array's buffer is kept as a Uint8Array view.
 */
export const strokePointsSchema = z
  .instanceof(Uint8Array)
  .refine((b) => b.byteLength >= STROKE_SAMPLE_BYTES, "a stroke needs at least one sample")
  .refine(
    (b) => b.byteLength % STROKE_SAMPLE_BYTES === 0,
    `stroke points must be a whole number of ${STROKE_SAMPLE_BYTES}-byte samples`,
  );

export const strokeDataSchema = z.strictObject({
  points: strokePointsSchema,
  tool: inkToolSchema,
  simulatePressure: z.boolean(),
});

// ---------------------------------------------------------------------------------------------
// shape (section 10)

export const SHAPE_KINDS = [
  "rectangle",
  "ellipse",
  "triangle",
  "diamond",
  "parallelogram",
  "trapezoid",
  "hexagon",
  "polygon",
  "star",
  "cylinder",
  "cloud",
  "callout",
  "brace",
  "blockArrow",
  "line",
  "polyline",
  "bezier",
  "arc",
] as const;
export const shapeKindSchema = z.enum(SHAPE_KINDS);

export const shapeFillSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  z.strictObject({
    kind: z.enum(["solid", "hatch", "crossHatch", "dots"]),
    color: hexColorSchema,
  }),
  z.strictObject({
    kind: z.literal("gradient"),
    from: hexColorSchema,
    to: hexColorSchema,
    angle: finiteNumber,
  }),
]);

export const strokeDashSchema = z.enum(["solid", "dashed", "dotted"]);

export const shapeDataSchema = z.strictObject({
  kind: shapeKindSchema,
  ...size,
  fill: shapeFillSchema,
  dash: strokeDashSchema,
  /** Hand-drawn look toggle. */
  sketchy: z.boolean(),
  cornerRadius: z.number().min(0).optional(),
  /** Polygon side count or star point count. */
  sides: z.int().min(3).max(64).optional(),
  /** Star inner radius as a fraction of the outer radius. */
  innerRadius: z.number().gt(0).lt(1).optional(),
  /** Vertices for line, polyline and bezier, relative to the element origin. */
  points: z.array(pointSchema).min(2).optional(),
});

// ---------------------------------------------------------------------------------------------
// text, math, code (content lives in a nested Y.XmlFragment / Y.Text, not in `data`)

export const textDataSchema = z.strictObject({
  widthMode: z.enum(["auto", "fixed"]),
  /** Box width in points when widthMode is "fixed". */
  width: positivePoints.nullable(),
});

export const mathDataSchema = z.strictObject({
  latex: z.string().max(20_000),
});

export const codeDataSchema = z.strictObject({
  language: z.string().min(1).max(64),
  lineNumbers: z.boolean(),
});

// ---------------------------------------------------------------------------------------------
// media and embeds (section 12)

export const imageDataSchema = z.strictObject({
  assetId: idSchema,
  ...size,
});

export const EMBED_KINDS = [
  "link",
  "youtube",
  "vimeo",
  "loom",
  "figma",
  "googleDocs",
  "gist",
  "githubRepo",
  "pdf",
  "audio",
  "video",
  "iframe",
  "attachment",
] as const;

export const embedDataSchema = z.strictObject({
  kind: z.enum(EMBED_KINDS),
  /** External URL, or null when the embed points at an uploaded asset. */
  url: z.url().nullable(),
  assetId: idSchema.nullable(),
  ...size,
});

export const audioMarkerDataSchema = z.strictObject({
  audioSessionId: idSchema,
  offsetMs: z.int().nonnegative(),
});

// ---------------------------------------------------------------------------------------------
// sticky, tape, table (sections 11, 19, 10)

export const stickyDataSchema = z.strictObject({
  ...size,
  fill: hexColorSchema,
});

export const tapeDataSchema = z.strictObject({
  ...size,
  fill: hexColorSchema,
  revealed: z.boolean(),
});

export const tableDataSchema = z.strictObject({
  columnWidths: z.array(positivePoints).min(1).max(100),
  rowHeights: z.array(positivePoints).min(1).max(1000),
});

// ---------------------------------------------------------------------------------------------
// connector (section 10)

export const arrowheadSchema = z.enum([
  "none",
  "arrow",
  "triangle",
  "circle",
  "diamond",
  "crowsFoot",
]);

export const connectorEndSchema = z.discriminatedUnion("kind", [
  /** Free end at a point, relative to the connector origin. */
  z.strictObject({ kind: z.literal("point"), point: pointSchema }),
  /** Bound to another element; anchor is normalized (0..1) within that element's bounds. */
  z.strictObject({
    kind: z.literal("bound"),
    elementId: idSchema,
    anchor: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  }),
]);

export const connectorDataSchema = z.strictObject({
  start: connectorEndSchema,
  end: connectorEndSchema,
  routing: z.enum(["straight", "elbow", "curved"]),
  startArrowhead: arrowheadSchema,
  endArrowhead: arrowheadSchema,
  dash: strokeDashSchema,
  /** Label position along the path, 0 (start) to 1 (end). Label text lives in a nested Y type. */
  labelPosition: z.number().min(0).max(1).nullable(),
});

// ---------------------------------------------------------------------------------------------
// frame, group

export const framePresetSchema = z.enum(["a4", "slide16x9", "phone", "custom"]);

export const frameDataSchema = z.strictObject({
  name: z.string().max(200),
  preset: framePresetSchema,
  ...size,
});

/** Members point at the group through their own `groupId`. */
export const groupDataSchema = z.strictObject({});

// ---------------------------------------------------------------------------------------------
// union

const element = <T extends ElementType, D extends z.ZodType>(type: T, data: D) =>
  z.strictObject({ ...elementBase, type: z.literal(type), data });

export const strokeElementSchema = element("stroke", strokeDataSchema);
export const shapeElementSchema = element("shape", shapeDataSchema);
export const textElementSchema = element("text", textDataSchema);
export const imageElementSchema = element("image", imageDataSchema);
export const stickyElementSchema = element("sticky", stickyDataSchema);
export const connectorElementSchema = element("connector", connectorDataSchema);
export const tableElementSchema = element("table", tableDataSchema);
export const tapeElementSchema = element("tape", tapeDataSchema);
export const embedElementSchema = element("embed", embedDataSchema);
export const audioMarkerElementSchema = element("audioMarker", audioMarkerDataSchema);
export const mathElementSchema = element("math", mathDataSchema);
export const codeElementSchema = element("code", codeDataSchema);
export const frameElementSchema = element("frame", frameDataSchema);
export const groupElementSchema = element("group", groupDataSchema);

export const elementSchema = z.discriminatedUnion("type", [
  strokeElementSchema,
  shapeElementSchema,
  textElementSchema,
  imageElementSchema,
  stickyElementSchema,
  connectorElementSchema,
  tableElementSchema,
  tapeElementSchema,
  embedElementSchema,
  audioMarkerElementSchema,
  mathElementSchema,
  codeElementSchema,
  frameElementSchema,
  groupElementSchema,
]);

export type Element = z.infer<typeof elementSchema>;
export type ElementOf<T extends ElementType> = Extract<Element, { type: T }>;
export type StrokeElement = ElementOf<"stroke">;
export type ShapeElement = ElementOf<"shape">;
export type TextElement = ElementOf<"text">;
export type ImageElement = ElementOf<"image">;
export type StickyElement = ElementOf<"sticky">;
export type ConnectorElement = ElementOf<"connector">;
export type TableElement = ElementOf<"table">;
export type TapeElement = ElementOf<"tape">;
export type EmbedElement = ElementOf<"embed">;
export type AudioMarkerElement = ElementOf<"audioMarker">;
export type MathElement = ElementOf<"math">;
export type CodeElement = ElementOf<"code">;
export type FrameElement = ElementOf<"frame">;
export type GroupElement = ElementOf<"group">;
