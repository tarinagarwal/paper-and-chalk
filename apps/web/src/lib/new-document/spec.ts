/**
 * The New dialog's notebook form as data, and how it becomes a page spec. Pure, so the preview,
 * the request and the tests all agree.
 */
import {
  fromPoints,
  orient,
  PAGE_SIZE_PRESETS,
  PAPER_COLOR_PRESETS,
  TEMPLATE_DEFAULTS,
  toPoints,
  type LengthUnit,
  type Orientation,
  type PageSizePresetId,
  type PageSizePresetView,
  type PageSpec,
  type PaperTemplate,
} from "@pc/schema";

export type CustomUnit = Exclude<LengthUnit, "pt">;

export interface NotebookForm {
  title: string;
  /** A preset id, "custom", or "saved:<id>" for one of the user's saved sizes. */
  size: string;
  customWidth: string;
  customHeight: string;
  unit: CustomUnit;
  orientation: Orientation;
  template: PaperTemplate;
  paperColor: string;
  lineColor: string;
  /** In millimetres, as typed. */
  spacingMm: string;
  marginMm: string;
  pageCount: string;
}

const mm = (pt: number) => String(Math.round(fromPoints(pt, "mm") * 10) / 10);

export function defaultNotebookForm(): NotebookForm {
  return {
    title: "Untitled notebook",
    size: "a4",
    customWidth: "100",
    customHeight: "150",
    unit: "mm",
    orientation: "portrait",
    template: "ruledCollege",
    paperColor: PAPER_COLOR_PRESETS.white.paperColor,
    lineColor: PAPER_COLOR_PRESETS.white.lineColor,
    spacingMm: mm(TEMPLATE_DEFAULTS.ruledCollege.spacingPt),
    marginMm: mm(TEMPLATE_DEFAULTS.ruledCollege.marginPt),
    pageCount: "1",
  };
}

/** Picking a template also picks its usual spacing and margin. */
export function withTemplate(form: NotebookForm, template: PaperTemplate): NotebookForm {
  return {
    ...form,
    template,
    spacingMm: mm(TEMPLATE_DEFAULTS[template].spacingPt),
    marginMm: mm(TEMPLATE_DEFAULTS[template].marginPt),
  };
}

const number = (value: string) => {
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

/** Size bounds for custom pages: 1 in to 200 in on either side. */
export const MIN_PAGE_PT = 72;
export const MAX_PAGE_PT = 14_400;

export type SizeResult =
  | { ok: true; sizePreset: PageSizePresetId | "custom"; widthPt: number; heightPt: number }
  | { ok: false; error: string };

/** The page size the form describes, before orientation. */
export function formSize(form: NotebookForm, saved: readonly PageSizePresetView[]): SizeResult {
  if (form.size in PAGE_SIZE_PRESETS) {
    const id = form.size as PageSizePresetId;
    return { ok: true, sizePreset: id, ...PAGE_SIZE_PRESETS[id] };
  }
  if (form.size.startsWith("saved:")) {
    const preset = saved.find((p) => `saved:${p.id}` === form.size);
    if (!preset) return { ok: false, error: "That saved size no longer exists" };
    return { ok: true, sizePreset: "custom", widthPt: preset.widthPt, heightPt: preset.heightPt };
  }
  const widthPt = toPoints(number(form.customWidth), form.unit);
  const heightPt = toPoints(number(form.customHeight), form.unit);
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt)) {
    return { ok: false, error: "Enter a width and a height" };
  }
  if (Math.min(widthPt, heightPt) < MIN_PAGE_PT || Math.max(widthPt, heightPt) > MAX_PAGE_PT) {
    return { ok: false, error: "Pages can be 1 to 200 inches on each side" };
  }
  return { ok: true, sizePreset: "custom", widthPt, heightPt };
}

export type SpecResult =
  { ok: true; spec: PageSpec; pageCount: number } | { ok: false; error: string };

/** The page spec and page count the form describes, or what is wrong with it. */
export function notebookSpec(form: NotebookForm, saved: readonly PageSizePresetView[]): SpecResult {
  const size = formSize(form, saved);
  if (!size.ok) return size;
  const spacingPt = toPoints(number(form.spacingMm), "mm");
  const marginPt = toPoints(number(form.marginMm), "mm");
  if (!(spacingPt >= 2 && spacingPt <= 200)) {
    return { ok: false, error: "Spacing must be between 1 and 70 mm" };
  }
  if (!(marginPt >= 0 && marginPt <= Math.min(size.widthPt, size.heightPt) / 3)) {
    return { ok: false, error: "The margin is too wide for this page" };
  }
  const pageCount = Math.floor(number(form.pageCount));
  if (!(pageCount >= 1 && pageCount <= 500)) {
    return { ok: false, error: "Start with 1 to 500 pages" };
  }
  const oriented = orient(size, form.orientation);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    ok: true,
    pageCount,
    spec: {
      sizePreset: size.sizePreset,
      widthPt: round(oriented.widthPt),
      heightPt: round(oriented.heightPt),
      rotation: 0,
      background: {
        kind: "paper",
        template: form.template,
        paperColor: form.paperColor,
        lineColor: form.lineColor,
        spacingPt: round(spacingPt),
        marginPt: round(marginPt),
      },
    },
  };
}

/** The preset a page size matches in either orientation (pages store sizes, not preset ids). */
export function matchPreset(widthPt: number, heightPt: number): PageSizePresetId | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.6;
  for (const [id, p] of Object.entries(PAGE_SIZE_PRESETS)) {
    if (
      (near(p.widthPt, widthPt) && near(p.heightPt, heightPt)) ||
      (near(p.widthPt, heightPt) && near(p.heightPt, widthPt))
    ) {
      return id as PageSizePresetId;
    }
  }
  return null;
}

/** "A4 · 210 × 297 mm", "US Letter · 8.5 × 11 in" or "100 × 150 mm" for a custom size. */
export function pageSizeName(widthPt: number, heightPt: number): string {
  const id = matchPreset(widthPt, heightPt);
  if (!id) return sizeLabel(widthPt, heightPt);
  const preset = PAGE_SIZE_PRESETS[id];
  return `${preset.label} · ${sizeLabel(widthPt, heightPt, preset.group === "us" ? "in" : "mm")}`;
}

/** "210 × 297 mm" (or inches for US sizes), for labels. */
export function sizeLabel(widthPt: number, heightPt: number, unit: "mm" | "in" = "mm"): string {
  const f = (pt: number) =>
    unit === "in"
      ? String(Math.round(fromPoints(pt, "in") * 100) / 100)
      : String(Math.round(fromPoints(pt, "mm")));
  return `${f(widthPt)} × ${f(heightPt)} ${unit}`;
}
