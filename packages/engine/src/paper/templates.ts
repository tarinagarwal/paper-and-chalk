/**
 * Paper backgrounds for every template in SPEC.md section 6, as draw commands. Pure functions of
 * the page size and the background (template, colours, spacing, margin): the New dialog's preview
 * and the page itself run the same code, so they always match.
 */
import type { PageBackground, PaperBackground, PaperTemplate } from "@pc/schema";

import { CommandList, type DrawCommand, type LineStyle } from "./commands";
import { centredSteps, clipSegment, lineFamily, type Box } from "./geometry";

export interface PageGeometry {
  widthPt: number;
  heightPt: number;
}

/** Red-orange margin rule on ruled paper, as on printed pads. */
const MARGIN_RED = "#e07a6a";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function luminance(hex: string): number {
  const full = hex.length <= 5 ? hex.replace(/^#(.)(.)(.).*$/, "#$1$1$2$2$3$3") : hex;
  const n = Number.parseInt(full.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

interface Paper {
  list: CommandList;
  w: number;
  h: number;
  s: number;
  m: number;
  line: LineStyle;
  strong: LineStyle;
  faint: LineStyle;
  dashed: LineStyle;
  label: string;
}

function paper(page: PageGeometry, bg: PaperBackground): Paper {
  const dark = luminance(bg.paperColor) < 0.45;
  return {
    list: new CommandList(bg.paperColor),
    w: page.widthPt,
    h: page.heightPt,
    s: bg.spacingPt,
    m: Math.min(bg.marginPt, page.widthPt / 3, page.heightPt / 3),
    line: { color: bg.lineColor, width: 0.5 },
    strong: { color: bg.lineColor, width: 1 },
    faint: { color: bg.lineColor, width: 0.4, dash: [1.5, 2] },
    dashed: { color: bg.lineColor, width: 0.5, dash: [3, 3] },
    // Labels (planner days, Cornell areas) need more contrast than the lines.
    label: dark ? "#aab1ba" : "#6f7682",
  };
}

const inset = (p: Paper): Box => ({ left: p.m, top: p.m, right: p.w - p.m, bottom: p.h - p.m });

function horizontalRules(
  p: Paper,
  from: number,
  to: number,
  x1: number,
  x2: number,
  style = p.line,
) {
  for (let y = from; y <= to + 1e-6; y += p.s) p.list.line(x1, y, x2, y, style);
}

function ruled(p: Paper): void {
  // A header band of three lines, then rules to the bottom; the margin rule on the left.
  horizontalRules(p, 3 * p.s, p.h - p.s, 0, p.w);
  if (p.m > 0) p.list.line(p.m, 0, p.m, p.h, { color: MARGIN_RED, width: 0.75 });
}

function grid(p: Paper, box: Box = inset(p), majorEvery = 0): void {
  const xs = centredSteps(box.left, box.right, p.s);
  const ys = centredSteps(box.top, box.bottom, p.s);
  const top = ys[0] ?? box.top;
  const bottom = ys.at(-1) ?? box.bottom;
  const left = xs[0] ?? box.left;
  const right = xs.at(-1) ?? box.right;
  xs.forEach((x, i) => {
    p.list.line(x, top, x, bottom, majorEvery && i % majorEvery === 0 ? p.strong : p.line);
  });
  ys.forEach((y, i) => {
    p.list.line(left, y, right, y, majorEvery && i % majorEvery === 0 ? p.strong : p.line);
  });
}

function dotGrid(p: Paper): void {
  const box = inset(p);
  const radius = Math.min(1.6, Math.max(0.6, p.s * 0.05));
  const xs = centredSteps(box.left, box.right, p.s);
  for (const y of centredSteps(box.top, box.bottom, p.s)) {
    for (const x of xs) p.list.dot(x, y, radius, p.line.color);
  }
}

function isometric(p: Paper): void {
  const box = inset(p);
  const origin = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  // Equilateral triangles of side s: all three families are s * sqrt(3)/2 apart.
  const gap = (p.s * Math.sqrt(3)) / 2;
  for (const angle of [90, 30, 150]) {
    for (const [x1, y1, x2, y2] of lineFamily(angle, gap, box, origin)) {
      p.list.line(x1, y1, x2, y2, p.line);
    }
  }
}

function hex(p: Paper): void {
  const box = inset(p);
  const a = p.s;
  const rowH = Math.sqrt(3) * a;
  const seen = new Set<string>();
  const key = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
  // Flat-topped hexagons; odd columns sit half a row lower.
  for (let col = -1; col * 1.5 * a <= box.right - box.left + a; col++) {
    const cx = box.left + col * 1.5 * a;
    for (let row = -1; row * rowH <= box.bottom - box.top + rowH; row++) {
      const cy = box.top + row * rowH + (col % 2 !== 0 ? rowH / 2 : 0);
      const corners = Array.from({ length: 6 }, (_, i) => {
        const t = (Math.PI / 3) * i;
        return [cx + a * Math.cos(t), cy + a * Math.sin(t)] as const;
      });
      for (let i = 0; i < 6; i++) {
        const [x1, y1] = corners[i] ?? [0, 0];
        const [x2, y2] = corners[(i + 1) % 6] ?? [0, 0];
        const edge = [key(x1, y1), key(x2, y2)].sort().join("|");
        if (seen.has(edge)) continue;
        seen.add(edge);
        const clipped = clipSegment(x1, y1, x2, y2, box);
        if (clipped) p.list.line(...clipped, p.line);
      }
    }
  }
}

function graphWithAxes(p: Paper): void {
  const box = inset(p);
  grid(p, box, 5);
  const xs = centredSteps(box.left, box.right, p.s);
  const ys = centredSteps(box.top, box.bottom, p.s);
  // Axes on the grid lines nearest the centre.
  const axisX = xs[Math.round((xs.length - 1) / 2)] ?? p.w / 2;
  const axisY = ys[Math.round((ys.length - 1) / 2)] ?? p.h / 2;
  const axis = { color: p.strong.color, width: 1.5 };
  p.list.line(axisX, ys[0] ?? box.top, axisX, ys.at(-1) ?? box.bottom, axis);
  p.list.line(xs[0] ?? box.left, axisY, xs.at(-1) ?? box.right, axisY, axis);
}

function musicStaff(p: Paper): void {
  const g = p.s;
  const block = 10 * g; // 5 lines (4 gaps) plus 6 gaps of space
  const available = p.h - 2 * p.m;
  const count = Math.max(1, Math.floor((available + 6 * g) / block));
  const top = p.m + (available - (count * block - 6 * g)) / 2;
  const left = p.m;
  const right = p.w - p.m;
  for (let staff = 0; staff < count; staff++) {
    const y0 = top + staff * block;
    for (let i = 0; i < 5; i++) p.list.line(left, y0 + i * g, right, y0 + i * g, p.line);
    p.list.line(left, y0, left, y0 + 4 * g, p.strong);
    p.list.line(right, y0, right, y0 + 4 * g, p.strong);
  }
}

function cornell(p: Paper): void {
  const header = p.m + 2 * p.s;
  const cue = p.w * 0.3;
  const summary = p.h * 0.8;
  horizontalRules(p, header + p.s, summary - p.s / 2, 0, p.w);
  horizontalRules(p, summary + p.s, p.h - p.m, 0, p.w);
  p.list.line(0, header, p.w, header, p.strong);
  p.list.line(cue, header, cue, summary, p.strong);
  p.list.line(0, summary, p.w, summary, p.strong);
  const size = Math.max(6, p.s * 0.35);
  p.list.text(p.m, header - 6, "Topic", { size, color: p.label });
  p.list.text(p.m, header + size + 3, "Cues", { size, color: p.label });
  p.list.text(cue + 6, header + size + 3, "Notes", { size, color: p.label });
  p.list.text(p.m, summary + size + 3, "Summary", { size, color: p.label });
}

function plannerDaily(p: Paper): void {
  const size = 7;
  const headerY = p.m + 28;
  p.list.text(p.m, p.m + 14, "Date", { size: 9, color: p.label, weight: 600 });
  p.list.line(p.m, headerY, p.w - p.m, headerY, p.strong);
  const split = p.m + (p.w - 2 * p.m) * 0.62;
  p.list.line(split, headerY + 8, split, p.h - p.m, p.line);

  const hours = 14; // 07:00 to 20:00
  const top = headerY + 12;
  const slot = (p.h - p.m - top) / hours;
  for (let i = 0; i < hours; i++) {
    const y = top + i * slot;
    p.list.line(p.m, y, split - 8, y, p.line);
    p.list.line(p.m + 30, y + slot / 2, split - 8, y + slot / 2, p.faint);
    p.list.text(p.m, y + size + 3, `${String(7 + i).padStart(2, "0")}:00`, {
      size,
      color: p.label,
    });
  }
  p.list.line(p.m, top + hours * slot, split - 8, top + hours * slot, p.line);

  const x = split + 12;
  p.list.text(x, top + 8, "Priorities", { size: 8, color: p.label, weight: 600 });
  for (let i = 0; i < 6; i++) {
    const y = top + 22 + i * p.s;
    p.list.rect(x, y - 8, 8, 8, { stroke: p.line });
    p.list.line(x + 14, y, p.w - p.m, y, p.line);
  }
  const notes = top + 22 + 6 * p.s + 18;
  p.list.text(x, notes, "Notes", { size: 8, color: p.label, weight: 600 });
  horizontalRules(p, notes + p.s, p.h - p.m, x, p.w - p.m);
}

function plannerWeekly(p: Paper): void {
  p.list.text(p.m, p.m + 14, "Week of", { size: 9, color: p.label, weight: 600 });
  const top = p.m + 28;
  p.list.line(p.m, top, p.w - p.m, top, p.strong);
  const cols = 2;
  const rows = 4;
  const gap = 10;
  const cw = (p.w - 2 * p.m - gap) / cols;
  const ch = (p.h - p.m - top - gap - (rows - 1) * gap) / rows;
  [...WEEKDAYS, "Notes"].forEach((day, i) => {
    const x = p.m + (i % cols) * (cw + gap);
    const y = top + gap + Math.floor(i / cols) * (ch + gap);
    p.list.rect(x, y, cw, ch, { stroke: p.line });
    p.list.text(x + 6, y + 13, day, { size: 8, color: p.label, weight: 600 });
    for (let ly = y + 20 + p.s; ly < y + ch - 4; ly += p.s)
      p.list.line(x + 6, ly, x + cw - 6, ly, p.faint);
  });
}

function plannerMonthly(p: Paper): void {
  p.list.text(p.m, p.m + 14, "Month", { size: 9, color: p.label, weight: 600 });
  const top = p.m + 28;
  p.list.line(p.m, top, p.w - p.m, top, p.strong);
  const cw = (p.w - 2 * p.m) / 7;
  WEEKDAYS_SHORT.forEach((day, i) => {
    p.list.text(p.m + i * cw + cw / 2, top + 14, day, { size: 8, color: p.label, align: "center" });
  });
  const gridTop = top + 20;
  const rh = (p.h - p.m - gridTop) / 6;
  for (let r = 0; r <= 6; r++)
    p.list.line(p.m, gridTop + r * rh, p.w - p.m, gridTop + r * rh, p.line);
  for (let c = 0; c <= 7; c++) p.list.line(p.m + c * cw, gridTop, p.m + c * cw, p.h - p.m, p.line);
}

function storyboard(p: Paper): void {
  const landscape = p.w > p.h;
  const cols = landscape ? 3 : 2;
  const gutter = 18;
  const cw = (p.w - 2 * p.m - (cols - 1) * gutter) / cols;
  const frame = (cw * 9) / 16;
  const rowH = frame + 8 + 2 * p.s + gutter;
  const rows = Math.max(1, Math.floor((p.h - 2 * p.m + gutter) / rowH));
  let n = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = p.m + c * (cw + gutter);
      const y = p.m + r * rowH;
      p.list.rect(x, y, cw, frame, { stroke: p.strong });
      p.list.text(x + 5, y + 11, String(n++), { size: 8, color: p.label });
      for (let i = 1; i <= 2; i++)
        p.list.line(x, y + frame + 8 + i * p.s, x + cw, y + frame + 8 + i * p.s, p.line);
    }
  }
}

function handwritingPractice(p: Paper): void {
  // Ascender, dashed waist, baseline, dotted descender: x-height = s, one s between sets.
  const left = p.m;
  const right = p.w - p.m;
  for (let y = p.m + p.s; y + 3 * p.s <= p.h - p.m; y += 4 * p.s) {
    p.list.line(left, y, right, y, p.line);
    p.list.line(left, y + p.s, right, y + p.s, p.dashed);
    p.list.line(left, y + 2 * p.s, right, y + 2 * p.s, p.strong);
    p.list.line(left, y + 3 * p.s, right, y + 3 * p.s, p.faint);
  }
}

function engineering(p: Paper): void {
  const header = 36;
  const box: Box = { left: p.m, top: p.m, right: p.w - p.m, bottom: p.m + header };
  p.list.rect(box.left, box.top, box.right - box.left, header, { stroke: p.strong });
  const third = (box.right - box.left) / 3;
  p.list.line(box.left + third, box.top, box.left + third, box.bottom, p.line);
  p.list.line(box.left + 2 * third, box.top, box.left + 2 * third, box.bottom, p.line);
  grid(p, { left: p.m, top: p.m + header + 12, right: p.w - p.m, bottom: p.h - p.m }, 5);
}

function calligraphySlants(p: Paper): void {
  // Nib widths: ascender 3, x-height 5, descender 3, gap 2 (units of s). Slants at 55 degrees.
  const u = p.s;
  const block = 13 * u;
  const left = p.m;
  const right = p.w - p.m;
  const slant = Math.tan((55 * Math.PI) / 180);
  for (let y = p.m; y + 11 * u <= p.h - p.m; y += block) {
    p.list.line(left, y, right, y, p.faint);
    p.list.line(left, y + 3 * u, right, y + 3 * u, p.line);
    p.list.line(left, y + 8 * u, right, y + 8 * u, p.strong);
    p.list.line(left, y + 11 * u, right, y + 11 * u, p.faint);
    const height = 11 * u;
    const run = height / slant;
    for (let x = left - run; x <= right; x += 4 * u) {
      const band: Box = { left, top: y, right, bottom: y + height };
      const seg = clipSegment(x, y + height, x + run, y, band);
      if (seg) p.list.line(...seg, p.faint);
    }
  }
}

const TEMPLATES: Record<PaperTemplate, (p: Paper) => void> = {
  blank: () => undefined,
  ruledCollege: ruled,
  ruledWide: ruled,
  ruledNarrow: ruled,
  grid: (p) => {
    grid(p);
  },
  dotGrid,
  isometric,
  hex,
  graphWithAxes,
  musicStaff,
  cornell,
  plannerDaily,
  plannerWeekly,
  plannerMonthly,
  storyboard,
  handwritingPractice,
  engineering,
  calligraphySlants,
};

/** The draw commands for a paper page. */
export function paperCommands(page: PageGeometry, background: PaperBackground): DrawCommand[] {
  const p = paper(page, background);
  TEMPLATES[background.template](p);
  return p.list.commands;
}

/**
 * The draw commands for any page background. Image and PDF pages are drawn by the renderer from
 * their files; their commands are the paper colour plus an `image`/`pdf` slot.
 */
export function pageCommands(page: PageGeometry & { background: PageBackground }): DrawCommand[] {
  const { background } = page;
  if (background.kind === "paper") return paperCommands(page, background);
  const list = new CommandList(background.kind === "image" ? background.paperColor : "#ffffff");
  return list.commands;
}
