/**
 * Draw commands: a small, renderer-neutral vector language for page backgrounds. Canvas2D draws
 * them today (canvas.ts); PDF export will map the same list to PDF operators. Everything is in
 * points (1/72 in) with the page's top-left corner at (0, 0).
 */

export type DrawCommand =
  /** Paints the whole page. Always first. */
  | { op: "fill"; color: string }
  | {
      op: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      stroke: string | null;
      fill: string | null;
      width: number;
    }
  /** Straight segments sharing one style, flattened as [x1, y1, x2, y2, ...]. */
  | {
      op: "lines";
      color: string;
      width: number;
      dash: number[] | null;
      segments: number[];
    }
  /** Filled circles sharing one style, flattened as [x, y, ...]. */
  | { op: "dots"; color: string; radius: number; points: number[] }
  | {
      op: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      color: string;
      align: "left" | "center" | "right";
      weight: 400 | 600;
    };

export interface LineStyle {
  color: string;
  width: number;
  dash?: readonly number[];
}

/** Two decimals: plenty for print, and keeps snapshots and hashes stable. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Collects commands. Lines with the same style are merged into one command (in the order the
 * styles first appear), so a dense grid is a handful of commands, not thousands.
 */
export class CommandList {
  private readonly out: DrawCommand[] = [];
  private readonly lineBatches = new Map<string, Extract<DrawCommand, { op: "lines" }>>();
  private readonly dotBatches = new Map<string, Extract<DrawCommand, { op: "dots" }>>();

  constructor(paperColor: string) {
    this.out.push({ op: "fill", color: paperColor });
  }

  line(x1: number, y1: number, x2: number, y2: number, style: LineStyle): void {
    const dash = style.dash ? [...style.dash] : null;
    const key = `${style.color}|${String(style.width)}|${dash?.join(",") ?? ""}`;
    let batch = this.lineBatches.get(key);
    if (!batch) {
      batch = { op: "lines", color: style.color, width: style.width, dash, segments: [] };
      this.lineBatches.set(key, batch);
      this.out.push(batch);
    }
    batch.segments.push(r2(x1), r2(y1), r2(x2), r2(y2));
  }

  dot(x: number, y: number, radius: number, color: string): void {
    const key = `${color}|${String(radius)}`;
    let batch = this.dotBatches.get(key);
    if (!batch) {
      batch = { op: "dots", color, radius: r2(radius), points: [] };
      this.dotBatches.set(key, batch);
      this.out.push(batch);
    }
    batch.points.push(r2(x), r2(y));
  }

  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    paint: { stroke?: LineStyle; fill?: string },
  ): void {
    this.out.push({
      op: "rect",
      x: r2(x),
      y: r2(y),
      w: r2(w),
      h: r2(h),
      stroke: paint.stroke?.color ?? null,
      fill: paint.fill ?? null,
      width: paint.stroke?.width ?? 0,
    });
  }

  text(
    x: number,
    y: number,
    text: string,
    style: { size: number; color: string; align?: "left" | "center" | "right"; weight?: 400 | 600 },
  ): void {
    this.out.push({
      op: "text",
      x: r2(x),
      y: r2(y),
      text,
      size: style.size,
      color: style.color,
      align: style.align ?? "left",
      weight: style.weight ?? 400,
    });
  }

  get commands(): DrawCommand[] {
    return this.out;
  }
}

/** A short, stable fingerprint of a command list (FNV-1a over its JSON). */
export function commandsHash(commands: readonly DrawCommand[]): string {
  const text = JSON.stringify(commands);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
