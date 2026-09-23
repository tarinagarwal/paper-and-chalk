import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE_PRESETS,
  PAPER_TEMPLATES,
  fromPoints,
  orient,
  pageSpecSchema,
  toPoints,
  type PageSizePresetId,
} from "./page";

const paper = {
  kind: "paper",
  template: "ruledCollege",
  paperColor: "#fffdf8",
  lineColor: "#cadcf1",
  spacingPt: 20,
  marginPt: 36,
} as const;

const a4Spec = {
  sizePreset: "a4",
  widthPt: 595.28,
  heightPt: 841.89,
  rotation: 0,
  background: paper,
} as const;

describe("page size presets", () => {
  const expected: Partial<Record<PageSizePresetId, [number, number]>> = {
    a4: [595.28, 841.89],
    a0: [2383.94, 3370.39],
    a6: [297.64, 419.53],
    b5: [498.9, 708.66],
    c5: [459.21, 649.13],
    letter: [612, 792],
    legal: [612, 1008],
    tabloid: [792, 1224],
    executive: [522, 756],
    indexCard: [216, 360],
    slide16x9: [960, 540],
    slide4x3: [720, 540],
    phone: [390, 844],
  };

  it.each(Object.entries(expected))("%s has the standard size in points", (id, size) => {
    const preset = PAGE_SIZE_PRESETS[id as PageSizePresetId];
    expect([preset.widthPt, preset.heightPt]).toEqual(size);
  });

  it("covers every size family from section 6", () => {
    const ids = Object.keys(PAGE_SIZE_PRESETS);
    for (const family of ["a", "b"]) {
      for (let n = 0; n <= 6; n++) expect(ids).toContain(`${family}${n}`);
    }
    expect(ids).toEqual(expect.arrayContaining(["c4", "c5", "c6"]));
  });
});

describe("units", () => {
  it("converts to and from points", () => {
    expect(toPoints(1, "in")).toBe(72);
    expect(toPoints(25.4, "mm")).toBeCloseTo(72);
    expect(toPoints(2.54, "cm")).toBeCloseTo(72);
    expect(toPoints(96, "px")).toBe(72);
    expect(fromPoints(72, "in")).toBe(1);
  });
});

describe("orient", () => {
  it("puts the long side vertical for portrait and horizontal for landscape", () => {
    const a4 = PAGE_SIZE_PRESETS.a4;
    expect(orient(a4, "landscape")).toEqual({ widthPt: a4.heightPt, heightPt: a4.widthPt });
    expect(orient(a4, "portrait")).toEqual({ widthPt: a4.widthPt, heightPt: a4.heightPt });
    expect(orient(PAGE_SIZE_PRESETS.slide16x9, "landscape")).toEqual({
      widthPt: 960,
      heightPt: 540,
    });
  });
});

describe("pageSpecSchema", () => {
  it("parses a paper page", () => {
    expect(pageSpecSchema.parse(a4Spec)).toEqual(a4Spec);
  });

  it("parses a PDF page", () => {
    const spec = {
      ...a4Spec,
      background: {
        kind: "pdf",
        assetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        pageIndex: 3,
      },
    };
    expect(pageSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("parses a custom size", () => {
    const spec = { ...a4Spec, sizePreset: "custom", widthPt: toPoints(100, "mm"), heightPt: 300 };
    expect(pageSpecSchema.safeParse(spec).success).toBe(true);
  });

  it.each(PAPER_TEMPLATES)("accepts the %s template", (template) => {
    const spec = { ...a4Spec, background: { ...paper, template } };
    expect(pageSpecSchema.safeParse(spec).success).toBe(true);
  });

  it("rejects an unknown template", () => {
    const spec = { ...a4Spec, background: { ...paper, template: "sudoku" } };
    expect(pageSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an unknown size preset", () => {
    expect(pageSpecSchema.safeParse({ ...a4Spec, sizePreset: "a7" }).success).toBe(false);
  });

  it("rejects a rotation that is not a right angle", () => {
    expect(pageSpecSchema.safeParse({ ...a4Spec, rotation: 45 }).success).toBe(false);
  });

  it("rejects zero, negative and oversized dimensions", () => {
    expect(pageSpecSchema.safeParse({ ...a4Spec, widthPt: 0 }).success).toBe(false);
    expect(pageSpecSchema.safeParse({ ...a4Spec, heightPt: -10 }).success).toBe(false);
    expect(pageSpecSchema.safeParse({ ...a4Spec, widthPt: 100_000 }).success).toBe(false);
  });

  it("rejects a negative PDF page index", () => {
    const spec = {
      ...a4Spec,
      background: { kind: "pdf", assetId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", pageIndex: -1 },
    };
    expect(pageSpecSchema.safeParse(spec).success).toBe(false);
  });
});
