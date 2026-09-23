import { describe, expect, it } from "vitest";

import {
  ELEMENT_TYPES,
  STROKE_SAMPLE_FLOATS,
  elementSchema,
  type Element,
  type ElementType,
} from "./element";

const ids = {
  element: "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
  layer: "11111111-2222-4333-8444-555555555555",
  asset: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  other: "99999999-8888-4777-8666-555555555555",
} as const;

function strokeBytes(samples: number): Uint8Array {
  const floats = new Float32Array(samples * STROKE_SAMPLE_FLOATS);
  return new Uint8Array(floats.buffer);
}

const base = {
  id: ids.element,
  z: "a0",
  layerId: ids.layer,
  x: 10,
  y: 20,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  locked: false,
  hidden: false,
  groupId: null,
  style: { color: "#1c1b19", width: 2, opacity: 1, blend: "normal" },
  createdBy: "user-1",
  createdAt: 1_758_600_000_000,
  audioTimestamp: null,
} as const;

/** One valid `data` object per element type. */
const validData: Record<ElementType, unknown> = {
  stroke: { points: strokeBytes(3), tool: "fountain", simulatePressure: false },
  shape: {
    kind: "rectangle",
    width: 120,
    height: 80,
    fill: { kind: "solid", color: "#cfe2c8" },
    dash: "solid",
    sketchy: false,
    cornerRadius: 8,
  },
  text: { widthMode: "auto", width: null },
  image: { assetId: ids.asset, width: 640, height: 480 },
  sticky: { width: 180, height: 180, fill: "#f5e6a3" },
  connector: {
    start: { kind: "point", point: { x: 0, y: 0 } },
    end: { kind: "bound", elementId: ids.other, anchor: { x: 0.5, y: 0 } },
    routing: "elbow",
    startArrowhead: "none",
    endArrowhead: "arrow",
    dash: "solid",
    labelPosition: 0.5,
  },
  table: { columnWidths: [100, 100], rowHeights: [30, 30, 30] },
  tape: { width: 200, height: 40, fill: "#c8911e", revealed: false },
  embed: { kind: "youtube", url: "https://youtu.be/abc", assetId: null, width: 560, height: 315 },
  audioMarker: { audioSessionId: ids.asset, offsetMs: 12_500 },
  math: { latex: "e^{i\\pi} + 1 = 0" },
  code: { language: "typescript", lineNumbers: true },
  frame: { name: "Slide 1", preset: "slide16x9", width: 960, height: 540 },
  group: {},
};

const make = (type: ElementType, overrides: Record<string, unknown> = {}) => ({
  ...base,
  type,
  data: validData[type],
  ...overrides,
});

describe("elementSchema", () => {
  it.each(ELEMENT_TYPES)("parses a valid %s element", (type) => {
    const parsed: Element = elementSchema.parse(make(type));
    expect(parsed.type).toBe(type);
    expect(parsed.id).toBe(ids.element);
  });

  it("rejects an unknown element type", () => {
    expect(elementSchema.safeParse(make("stroke", { type: "laser" })).success).toBe(false);
  });

  it("rejects data belonging to a different type", () => {
    expect(elementSchema.safeParse(make("sticky", { data: validData.shape })).success).toBe(false);
  });

  it("rejects unknown top-level fields", () => {
    expect(elementSchema.safeParse(make("text", { extra: true })).success).toBe(false);
  });

  it("rejects a non-UUID id", () => {
    expect(elementSchema.safeParse(make("text", { id: "abc" })).success).toBe(false);
  });

  it("rejects a zero scale", () => {
    expect(elementSchema.safeParse(make("text", { scaleX: 0 })).success).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    expect(elementSchema.safeParse(make("text", { x: Number.NaN })).success).toBe(false);
    expect(elementSchema.safeParse(make("text", { y: Infinity })).success).toBe(false);
  });

  it("rejects an invalid hex color", () => {
    const style = { ...base.style, color: "red" };
    expect(elementSchema.safeParse(make("text", { style })).success).toBe(false);
  });

  it("rejects stroke width above 50 pt", () => {
    const style = { ...base.style, width: 51 };
    expect(elementSchema.safeParse(make("stroke", { style })).success).toBe(false);
  });

  it("accepts multiply blend for highlighter strokes", () => {
    const style = { ...base.style, blend: "multiply" };
    const data = { ...(validData.stroke as object), tool: "highlighter" };
    expect(elementSchema.safeParse(make("stroke", { style, data })).success).toBe(true);
  });

  describe("stroke points", () => {
    const withPoints = (points: unknown) =>
      make("stroke", { data: { points, tool: "ballpoint", simulatePressure: true } });

    it("rejects a stroke with no points", () => {
      const data = { tool: "ballpoint", simulatePressure: true };
      const result = elementSchema.safeParse(make("stroke", { data }));
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((i) => i.path.join(".") === "data.points")).toBe(true);
    });

    it("rejects an empty stroke", () => {
      expect(elementSchema.safeParse(withPoints(new Uint8Array(0))).success).toBe(false);
    });

    it("rejects a partial sample", () => {
      expect(elementSchema.safeParse(withPoints(new Uint8Array(21))).success).toBe(false);
    });

    it("rejects a plain number array", () => {
      expect(elementSchema.safeParse(withPoints([1, 2, 3, 4, 5])).success).toBe(false);
    });

    it("rejects the laser pointer, which is never saved", () => {
      const data = { points: strokeBytes(1), tool: "laser", simulatePressure: false };
      expect(elementSchema.safeParse(make("stroke", { data })).success).toBe(false);
    });
  });

  it("rejects a star with an inner radius of 1 or more", () => {
    const data = { ...(validData.shape as object), kind: "star", sides: 5, innerRadius: 1 };
    expect(elementSchema.safeParse(make("shape", { data })).success).toBe(false);
  });

  it("rejects a connector anchor outside 0..1", () => {
    const data = {
      ...(validData.connector as object),
      end: { kind: "bound", elementId: ids.other, anchor: { x: 1.5, y: 0 } },
    };
    expect(elementSchema.safeParse(make("connector", { data })).success).toBe(false);
  });

  it("rejects a negative audio timestamp", () => {
    expect(elementSchema.safeParse(make("text", { audioTimestamp: -1 })).success).toBe(false);
  });
});
