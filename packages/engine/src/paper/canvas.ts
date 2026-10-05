/** Draws paper commands onto a Canvas2D context. */
import type { DrawCommand } from "./commands";

/** The parts of CanvasRenderingContext2D the renderer uses (tests pass a recorder). */
export type Canvas2D = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "setTransform"
  | "fillRect"
  | "strokeRect"
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "arc"
  | "closePath"
  | "stroke"
  | "fill"
  | "fillText"
  | "setLineDash"
> & {
  fillStyle: CanvasRenderingContext2D["fillStyle"];
  strokeStyle: CanvasRenderingContext2D["strokeStyle"];
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
};

export interface DrawOptions {
  /** Device pixels per point. */
  scale: number;
  /** Where page (0, 0) lands, in device pixels. */
  offsetX?: number;
  offsetY?: number;
  /** Size of the area the fill covers, in points (defaults to the whole canvas via a big rect). */
  widthPt: number;
  heightPt: number;
}

/**
 * Draws commands with the given scale. Hairlines stay at least one device pixel wide so thin rules
 * do not vanish on small previews.
 */
export function drawCommands(
  ctx: Canvas2D,
  commands: readonly DrawCommand[],
  options: DrawOptions,
): void {
  const { scale } = options;
  const minWidth = 1 / scale;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, options.offsetX ?? 0, options.offsetY ?? 0);
  for (const command of commands) {
    switch (command.op) {
      case "fill":
        ctx.fillStyle = command.color;
        ctx.fillRect(0, 0, options.widthPt, options.heightPt);
        break;
      case "rect":
        if (command.fill) {
          ctx.fillStyle = command.fill;
          ctx.fillRect(command.x, command.y, command.w, command.h);
        }
        if (command.stroke) {
          ctx.setLineDash([]);
          ctx.strokeStyle = command.stroke;
          ctx.lineWidth = Math.max(command.width, minWidth);
          ctx.strokeRect(command.x, command.y, command.w, command.h);
        }
        break;
      case "lines": {
        ctx.setLineDash(command.dash ?? []);
        ctx.strokeStyle = command.color;
        ctx.lineWidth = Math.max(command.width, minWidth);
        ctx.beginPath();
        const s = command.segments;
        for (let i = 0; i + 3 < s.length; i += 4) {
          ctx.moveTo(s[i] ?? 0, s[i + 1] ?? 0);
          ctx.lineTo(s[i + 2] ?? 0, s[i + 3] ?? 0);
        }
        ctx.stroke();
        break;
      }
      case "dots": {
        ctx.fillStyle = command.color;
        const r = Math.max(command.radius, minWidth / 2);
        ctx.beginPath();
        const p = command.points;
        for (let i = 0; i + 1 < p.length; i += 2) {
          const x = p[i] ?? 0;
          const y = p[i + 1] ?? 0;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
        }
        ctx.fill();
        break;
      }
      case "text":
        ctx.fillStyle = command.color;
        ctx.font = `${String(command.weight)} ${String(command.size)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = command.align;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(command.text, command.x, command.y);
        break;
    }
  }
  ctx.restore();
}
