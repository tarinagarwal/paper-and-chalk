/**
 * Infinite canvas backgrounds (SPEC.md section 6): dots, grid or lines anchored to world (0, 0),
 * generated only for the part of the world in view.
 */
import type { CanvasBackground } from "@pc/schema";

import { CommandList, type DrawCommand } from "./commands";

export interface WorldView {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** More marks than this in view and the pattern is skipped: at that density it reads as noise. */
const MAX_MARKS = 40_000;

export function canvasBackgroundCommands(bg: CanvasBackground, view: WorldView): DrawCommand[] {
  const list = new CommandList(bg.paperColor);
  const s = bg.spacingPt;
  const cols = Math.ceil(view.width / s) + 1;
  const rows = Math.ceil(view.height / s) + 1;
  if (bg.pattern === "none" || cols * rows > MAX_MARKS) return list.commands;
  const x0 = Math.floor(view.x / s) * s;
  const y0 = Math.floor(view.y / s) * s;
  const right = view.x + view.width;
  const bottom = view.y + view.height;
  const style = { color: bg.color, width: 0.5 };
  if (bg.pattern === "dots") {
    const radius = Math.min(1.6, Math.max(0.7, s * 0.05));
    for (let y = y0; y <= bottom; y += s) {
      for (let x = x0; x <= right; x += s) list.dot(x, y, radius, bg.color);
    }
  } else {
    for (let y = y0; y <= bottom; y += s) list.line(view.x, y, right, y, style);
    if (bg.pattern === "grid") {
      for (let x = x0; x <= right; x += s) list.line(x, view.y, x, bottom, style);
    }
  }
  return list.commands;
}
