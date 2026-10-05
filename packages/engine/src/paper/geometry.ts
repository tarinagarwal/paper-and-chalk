/** Line clipping and families of parallel lines, for the angled templates. */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Segment = [number, number, number, number];

/** Liang-Barsky: the part of segment (x1, y1)-(x2, y2) inside the box, or null. */
export function clipSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  box: Box,
): Segment | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, x1 - box.left],
    [dx, box.right - x1],
    [-dy, y1 - box.top],
    [dy, box.bottom - y1],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  if (t1 - t0 < 1e-9) return null;
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

/**
 * Parallel lines at `angleDeg` (0 = horizontal, 90 = vertical), `spacing` apart, through `origin`,
 * clipped to the box.
 */
export function lineFamily(
  angleDeg: number,
  spacing: number,
  box: Box,
  origin: { x: number; y: number },
): Segment[] {
  const a = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  // Normal to the lines: offsets are measured along it.
  const nx = -uy;
  const ny = ux;
  const corners = [
    [box.left, box.top],
    [box.right, box.top],
    [box.left, box.bottom],
    [box.right, box.bottom],
  ] as const;
  const projections = corners.map(([x, y]) => (x - origin.x) * nx + (y - origin.y) * ny);
  const min = Math.min(...projections);
  const max = Math.max(...projections);
  const reach = Math.hypot(box.right - box.left, box.bottom - box.top) + 1;
  const out: Segment[] = [];
  for (let k = Math.ceil(min / spacing); k * spacing <= max; k++) {
    const px = origin.x + nx * k * spacing;
    const py = origin.y + ny * k * spacing;
    const clipped = clipSegment(
      px - ux * reach,
      py - uy * reach,
      px + ux * reach,
      py + uy * reach,
      box,
    );
    if (clipped) out.push(clipped);
  }
  return out;
}

/** Positions from `start` to `end` in steps of `step`, centred so the leftover splits evenly. */
export function centredSteps(start: number, end: number, step: number): number[] {
  const count = Math.floor((end - start) / step + 1e-9);
  const offset = (end - start - count * step) / 2;
  return Array.from({ length: count + 1 }, (_, i) => start + offset + i * step);
}
