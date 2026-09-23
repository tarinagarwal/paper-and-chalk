/** Tiny geometry helpers for drawing variable-width strokes as filled SVG paths. */

export type Pt = readonly [number, number];

/** Samples a Catmull-Rom spline through the points. */
export function smooth(points: readonly Pt[], perSegment = 16): Pt[] {
  const out: Pt[] = [];
  const at = (i: number): Pt => points[Math.max(0, Math.min(points.length - 1, i))] ?? [0, 0];
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const coord = (k: 0 | 1) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([coord(0), coord(1)]);
    }
  }
  out.push(at(points.length - 1));
  return out;
}

/**
 * Builds a closed ribbon around a polyline. `width(t, angle)` gets the position along the stroke
 * (0..1) and the travel direction in radians, and returns the full width at that point.
 */
export function ribbon(line: readonly Pt[], width: (t: number, angle: number) => number): string {
  const left: string[] = [];
  const right: string[] = [];
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const prev = line[Math.max(0, i - 1)] ?? [0, 0];
    const next = line[Math.min(n - 1, i + 1)] ?? [0, 0];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx);
    const half = width(i / (n - 1), angle) / 2;
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    const p = line[i] ?? [0, 0];
    left.push(`${(p[0] + nx).toFixed(1)} ${(p[1] + ny).toFixed(1)}`);
    right.push(`${(p[0] - nx).toFixed(1)} ${(p[1] - ny).toFixed(1)}`);
  }
  return `M ${left.join(" L ")} L ${right.reverse().join(" L ")} Z`;
}

/**
 * A run of cursive loops (a prolate cycloid), which reads as handwriting at a glance.
 * `pitch` is the horizontal advance per loop and `loop` the loop radius (loops appear when
 * loop > pitch / 2π).
 */
export function cursive(
  x0: number,
  y: number,
  length: number,
  { pitch = 11, loop = 7, rise = 6, steps = 14, vary = 0.22 } = {},
): Pt[] {
  const out: Pt[] = [];
  const turns = length / pitch;
  const total = Math.ceil(turns * steps);
  for (let i = 0; i <= total; i++) {
    const t = (i / steps) * 2 * Math.PI;
    // Loop size drifts a little from letter to letter, like a real hand.
    const size = loop * (1 - vary * 0.8 + vary * Math.sin(t * 0.43 + 0.6) * Math.cos(t * 0.29));
    const x = x0 + (t / (2 * Math.PI)) * pitch - size * 0.55 * Math.sin(t);
    const yy = y - rise * 0.5 - size * 0.5 * Math.cos(t) + Math.sin(t * 0.37) * 1.2;
    out.push([x, yy]);
  }
  return out;
}

/** Polyline to an SVG path. */
export function polyline(points: readonly Pt[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
}
