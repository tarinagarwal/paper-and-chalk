import { PAGE_SIZE_PRESETS, TEMPLATE_DEFAULTS, toPoints } from "@pc/schema";
import { describe, expect, it } from "vitest";

import { defaultNotebookForm, notebookSpec, pageSizeName, sizeLabel, withTemplate } from "./spec";

const ratio = (w: number, h: number) => Math.round((w / h) * 1000) / 1000;

describe("notebook form", () => {
  it("starts as one A4 portrait college-ruled page", () => {
    const result = notebookSpec(defaultNotebookForm(), []);
    expect(result).toMatchObject({
      ok: true,
      pageCount: 1,
      spec: {
        sizePreset: "a4",
        widthPt: PAGE_SIZE_PRESETS.a4.widthPt,
        background: { template: "ruledCollege" },
      },
    });
  });

  it("turns presets for landscape and keeps their proportions", () => {
    const form = { ...defaultNotebookForm(), size: "a3", orientation: "landscape" as const };
    const result = notebookSpec(form, []);
    if (!result.ok) throw new Error(result.error);
    expect(ratio(result.spec.widthPt, result.spec.heightPt)).toBeCloseTo(420 / 297, 2);
  });

  it("reads custom sizes in any unit and refuses silly ones", () => {
    const custom = {
      ...defaultNotebookForm(),
      size: "custom",
      customWidth: "100",
      customHeight: "150",
    };
    const mm = notebookSpec(custom, []);
    if (!mm.ok) throw new Error(mm.error);
    expect(mm.spec).toMatchObject({ sizePreset: "custom" });
    expect(mm.spec.widthPt).toBeCloseTo(toPoints(100, "mm"), 1);
    expect(ratio(mm.spec.widthPt, mm.spec.heightPt)).toBeCloseTo(100 / 150, 2);
    const inches = notebookSpec({ ...custom, unit: "in", customWidth: "4", customHeight: "6" }, []);
    expect(inches.ok && inches.spec.widthPt).toBe(288);
    expect(notebookSpec({ ...custom, customWidth: "5" }, []).ok).toBe(false);
    expect(notebookSpec({ ...custom, customHeight: "abc" }, []).ok).toBe(false);
  });

  it("uses a saved size", () => {
    const saved = [
      {
        id: "0196b3a0-0000-7000-8000-000000000001",
        name: "Pocket",
        widthPt: 360,
        heightPt: 560,
        unit: "mm" as const,
      },
    ];
    const result = notebookSpec(
      { ...defaultNotebookForm(), size: `saved:${saved[0]?.id ?? ""}` },
      saved,
    );
    expect(result).toMatchObject({ ok: true, spec: { widthPt: 360, heightPt: 560 } });
    expect(notebookSpec({ ...defaultNotebookForm(), size: "saved:gone" }, saved).ok).toBe(false);
  });

  it("gives each template its usual spacing and margin", () => {
    const form = withTemplate(defaultNotebookForm(), "musicStaff");
    const result = notebookSpec(form, []);
    if (!result.ok) throw new Error(result.error);
    expect(result.spec.background).toMatchObject({ template: "musicStaff" });
    if (result.spec.background.kind !== "paper") throw new Error("paper");
    expect(result.spec.background.spacingPt).toBeCloseTo(TEMPLATE_DEFAULTS.musicStaff.spacingPt, 0);
  });

  it("checks spacing, margin and page count", () => {
    expect(notebookSpec({ ...defaultNotebookForm(), spacingMm: "0" }, []).ok).toBe(false);
    expect(notebookSpec({ ...defaultNotebookForm(), marginMm: "200" }, []).ok).toBe(false);
    expect(notebookSpec({ ...defaultNotebookForm(), pageCount: "501" }, []).ok).toBe(false);
    expect(notebookSpec({ ...defaultNotebookForm(), pageCount: "5" }, [])).toMatchObject({
      pageCount: 5,
    });
  });

  it("labels sizes in millimetres or inches", () => {
    expect(sizeLabel(PAGE_SIZE_PRESETS.a4.widthPt, PAGE_SIZE_PRESETS.a4.heightPt)).toBe(
      "210 × 297 mm",
    );
    expect(sizeLabel(612, 792, "in")).toBe("8.5 × 11 in");
  });
});

describe("page size names", () => {
  it("names presets in either orientation and falls back to the measurements", () => {
    const a4 = PAGE_SIZE_PRESETS.a4;
    expect(pageSizeName(a4.widthPt, a4.heightPt)).toBe("A4 · 210 × 297 mm");
    expect(pageSizeName(a4.heightPt, a4.widthPt)).toBe("A4 · 297 × 210 mm");
    const letter = PAGE_SIZE_PRESETS.letter;
    expect(pageSizeName(letter.widthPt, letter.heightPt)).toBe(`${letter.label} · 8.5 × 11 in`);
    expect(pageSizeName(toPoints(100, "mm"), toPoints(150, "mm"))).toBe("100 × 150 mm");
  });
});
