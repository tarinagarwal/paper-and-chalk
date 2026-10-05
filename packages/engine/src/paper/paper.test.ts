import {
  DEFAULT_CANVAS_BACKGROUND,
  orient,
  PAGE_SIZE_PRESETS,
  PAPER_COLOR_PRESETS,
  PAPER_TEMPLATES,
  TEMPLATE_DEFAULTS,
  type PaperBackground,
  type PaperTemplate,
} from "@pc/schema";
import { describe, expect, it } from "vitest";

import { commandsHash, type DrawCommand } from "./commands";
import { drawCommands, type Canvas2D } from "./canvas";
import { canvasBackgroundCommands } from "./infinite";
import { pageCommands, paperCommands } from "./templates";

const A4 = PAGE_SIZE_PRESETS.a4;
/** Index card (3 x 5 in): small enough that full snapshots stay readable. */
const CARD = PAGE_SIZE_PRESETS.indexCard;

function background(
  template: PaperTemplate,
  overrides: Partial<PaperBackground> = {},
): PaperBackground {
  return {
    kind: "paper",
    template,
    paperColor: PAPER_COLOR_PRESETS.white.paperColor,
    lineColor: PAPER_COLOR_PRESETS.white.lineColor,
    spacingPt: TEMPLATE_DEFAULTS[template].spacingPt,
    marginPt: TEMPLATE_DEFAULTS[template].marginPt,
    ...overrides,
  };
}

/** Every x/y coordinate a command places, for bounds checks. */
function points(commands: readonly DrawCommand[]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of commands) {
    if (c.op === "lines")
      for (let i = 0; i < c.segments.length; i += 2)
        out.push([c.segments[i] ?? 0, c.segments[i + 1] ?? 0]);
    if (c.op === "dots")
      for (let i = 0; i < c.points.length; i += 2)
        out.push([c.points[i] ?? 0, c.points[i + 1] ?? 0]);
    if (c.op === "rect") out.push([c.x, c.y], [c.x + c.w, c.y + c.h]);
    if (c.op === "text") out.push([c.x, c.y]);
  }
  return out;
}

const marks = (commands: readonly DrawCommand[]) =>
  commands.reduce(
    (n, c) =>
      n +
      (c.op === "lines"
        ? c.segments.length / 4
        : c.op === "dots"
          ? c.points.length / 2
          : c.op === "fill"
            ? 0
            : 1),
    0,
  );

describe("paper templates", () => {
  it.each(PAPER_TEMPLATES)("%s on an index card matches its snapshot", (template) => {
    expect(paperCommands(CARD, background(template))).toMatchSnapshot();
  });

  it.each(PAPER_TEMPLATES)("%s stays on an A4 page, both ways round", (template) => {
    for (const orientation of ["portrait", "landscape"] as const) {
      const page = orient(A4, orientation);
      const commands = paperCommands(page, background(template));
      expect(commands[0]).toEqual({ op: "fill", color: "#ffffff" });
      for (const [x, y] of points(commands)) {
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(x).toBeLessThanOrEqual(page.widthPt + 0.01);
        expect(y).toBeLessThanOrEqual(page.heightPt + 0.01);
      }
      if (template !== "blank") expect(marks(commands)).toBeGreaterThan(0);
    }
  });

  it("draws with the chosen colours, including dark paper", () => {
    const dark = PAPER_COLOR_PRESETS.dark;
    const commands = paperCommands(A4, background("cornell", dark));
    expect(commands[0]).toEqual({ op: "fill", color: dark.paperColor });
    const lineColors = new Set(commands.flatMap((c) => (c.op === "lines" ? [c.color] : [])));
    expect([...lineColors]).toEqual([dark.lineColor]);
    // Labels get a lighter colour on dark paper so they stay readable.
    const labels = commands.flatMap((c) => (c.op === "text" ? [c.color] : []));
    expect(new Set(labels)).toEqual(new Set(["#aab1ba"]));
  });

  it("follows the spacing: half the spacing, about twice the lines", () => {
    const at = (spacingPt: number) =>
      marks(paperCommands(A4, background("ruledCollege", { spacingPt })));
    expect(at(10) / at(20)).toBeGreaterThan(1.9);
    const dots = (spacingPt: number) =>
      marks(paperCommands(A4, background("dotGrid", { spacingPt })));
    expect(dots(10) / dots(20)).toBeGreaterThan(3.5);
  });

  it("puts the ruled margin where it is asked", () => {
    const commands = paperCommands(A4, background("ruledWide", { marginPt: 100 }));
    const margin = commands.find((c) => c.op === "lines" && c.color === "#e07a6a");
    expect(margin).toMatchObject({ segments: [100, 0, 100, A4.heightPt] });
    const none = paperCommands(A4, background("ruledWide", { marginPt: 0 }));
    expect(none.some((c) => c.op === "lines" && c.color === "#e07a6a")).toBe(false);
  });

  it("lays storyboards out by orientation", () => {
    const columns = (orientation: "portrait" | "landscape") =>
      new Set(
        paperCommands(orient(A4, orientation), background("storyboard")).flatMap((c) =>
          c.op === "rect" ? [c.x] : [],
        ),
      ).size;
    expect(columns("portrait")).toBe(2);
    expect(columns("landscape")).toBe(3);
  });

  it("gives image and PDF pages their paper colour only", () => {
    expect(
      pageCommands({
        widthPt: 400,
        heightPt: 300,
        background: {
          kind: "image",
          assetId: "0196b3a0-0000-7000-8000-000000000001",
          fit: "contain",
          paperColor: "#101010",
        },
      }),
    ).toEqual([{ op: "fill", color: "#101010" }]);
  });

  it("fingerprints command lists: the same page, the same hash", () => {
    const a = paperCommands(A4, background("hex"));
    const b = paperCommands(A4, background("hex"));
    const c = paperCommands(A4, background("hex", { spacingPt: 15 }));
    expect(commandsHash(a)).toBe(commandsHash(b));
    expect(commandsHash(a)).not.toBe(commandsHash(c));
    expect(commandsHash(a)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("infinite canvas backgrounds", () => {
  it("covers the view, anchored to the world grid", () => {
    const commands = canvasBackgroundCommands(
      { ...DEFAULT_CANVAS_BACKGROUND, pattern: "grid", spacingPt: 50 },
      { x: 25, y: -25, width: 100, height: 100 },
    );
    const segments = commands.flatMap((c) => (c.op === "lines" ? c.segments : []));
    // Vertical lines at x = 0, 50, 100; horizontal at y = -50, 0, 50.
    expect(segments.length / 4).toBe(3 + 3);
  });

  it("skips the pattern when it would be too dense to read", () => {
    const dense = canvasBackgroundCommands(
      { ...DEFAULT_CANVAS_BACKGROUND, pattern: "dots", spacingPt: 1 },
      { x: 0, y: 0, width: 5000, height: 5000 },
    );
    expect(dense).toEqual([{ op: "fill", color: DEFAULT_CANVAS_BACKGROUND.paperColor }]);
    expect(
      canvasBackgroundCommands(
        { ...DEFAULT_CANVAS_BACKGROUND, pattern: "none" },
        { x: 0, y: 0, width: 10, height: 10 },
      ),
    ).toHaveLength(1);
  });
});

describe("canvas renderer", () => {
  it("replays commands on a Canvas2D context at the given scale", () => {
    const calls: string[] = [];
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        calls.push(
          `${name}(${args.map((a) => (typeof a === "number" ? String(Math.round(a * 100) / 100) : JSON.stringify(a))).join(",")})`,
        );
      };
    const ctx = {
      save: record("save"),
      restore: record("restore"),
      setTransform: record("setTransform"),
      fillRect: record("fillRect"),
      strokeRect: record("strokeRect"),
      beginPath: record("beginPath"),
      moveTo: record("moveTo"),
      lineTo: record("lineTo"),
      arc: record("arc"),
      closePath: record("closePath"),
      stroke: record("stroke"),
      fill: record("fill"),
      fillText: record("fillText"),
      setLineDash: record("setLineDash"),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "left",
      textBaseline: "alphabetic",
    } as unknown as Canvas2D;
    drawCommands(
      ctx,
      [
        { op: "fill", color: "#fff" },
        { op: "lines", color: "#00f", width: 0.5, dash: null, segments: [0, 10, 100, 10] },
        { op: "dots", color: "#00f", radius: 1, points: [5, 5] },
      ],
      { scale: 2, widthPt: 100, heightPt: 50 },
    );
    expect(calls).toEqual([
      "save()",
      "setTransform(2,0,0,2,0,0)",
      "fillRect(0,0,100,50)",
      "setLineDash([])",
      "beginPath()",
      "moveTo(0,10)",
      "lineTo(100,10)",
      "stroke()",
      "beginPath()",
      "moveTo(6,5)",
      "arc(5,5,1,0,6.28)",
      "fill()",
      "restore()",
    ]);
    // Half-point rules stay one device pixel wide at scale 2.
    expect(ctx.lineWidth).toBe(0.5);
  });
});
