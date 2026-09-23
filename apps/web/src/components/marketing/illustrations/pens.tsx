import { shortcuts } from "@/content/home";

import { IllustrationFrame } from "./frame";
import { cursive, ribbon } from "./ink-geometry";

// A line of cursive loops, like a word being written.
const line = cursive(10, 22, 250, { pitch: 34, loop: 19, rise: 2, steps: 22 });
const bell = (t: number) => Math.sin(Math.PI * t);

const pens: { name: string; note: string; d: string; className: string; grain?: boolean }[] = [
  {
    name: "Ballpoint",
    note: "steady",
    d: ribbon(line, () => 1.7),
    className: "fill-pen-graphite",
  },
  {
    name: "Fountain",
    note: "taper",
    d: ribbon(
      line,
      (t, angle) => 0.5 + 3.6 * bell(t) ** 0.4 * (0.55 + 0.45 * Math.abs(Math.sin(angle))),
    ),
    className: "fill-pen-cobalt",
  },
  {
    name: "Brush",
    note: "pressure",
    d: ribbon(line, (t) => 0.6 + 7.5 * bell(t) ** 0.6 * (0.55 + 0.45 * Math.sin(t * 11 + 1))),
    className: "fill-pen-graphite",
  },
  {
    name: "Pencil",
    note: "grain",
    d: ribbon(line, (t) => 1.6 + 1.4 * bell(t)),
    className: "fill-pen-graphite",
    grain: true,
  },
  {
    name: "Marker",
    note: "flat",
    d: ribbon(line, () => 5.5),
    className: "fill-pen-vermilion opacity-80",
  },
  {
    name: "Calligraphy",
    note: "nib 45°",
    d: ribbon(
      line,
      (t, angle) => 0.5 + 6 * Math.abs(Math.sin(angle - Math.PI / 4)) * bell(t) ** 0.25,
    ),
    className: "fill-pen-plum",
  },
];

export function PensIllustration() {
  return (
    <IllustrationFrame label="Sample strokes from each pen: ballpoint, fountain, brush, pencil, marker, calligraphy and highlighter, plus single-key tool shortcuts.">
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="pencil-grain">
          <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="4" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.5" />
          <feComposite in="SourceGraphic" operator="in" />
        </filter>
      </svg>
      <div className="rounded-xl border bg-card shadow-float">
        <ul className="divide-y">
          {pens.map((pen) => (
            <li key={pen.name} className="flex items-center gap-4 px-4 py-2.5 sm:px-5">
              <div className="w-24 shrink-0 sm:w-28">
                <p className="text-sm font-medium">{pen.name}</p>
                <p className="font-mono text-[10px] text-muted-foreground">{pen.note}</p>
              </div>
              <svg
                viewBox="0 0 280 40"
                className="h-10 min-w-0 flex-1 overflow-visible"
                aria-hidden
              >
                <path
                  d={pen.d}
                  className={pen.className}
                  filter={pen.grain ? "url(#pencil-grain)" : undefined}
                />
              </svg>
            </li>
          ))}
          <li className="flex items-center gap-4 px-4 py-3 sm:px-5">
            <div className="w-24 shrink-0 sm:w-28">
              <p className="text-sm font-medium">Highlighter</p>
              <p className="font-mono text-[10px] text-muted-foreground">snaps to text</p>
            </div>
            <p className="min-w-0 flex-1 truncate font-display text-[1.0625rem]">
              the{" "}
              <span className="-mx-0.5 bg-[#e8b730]/70 px-0.5 text-[#1c1b19]">
                mitochondria is where
              </span>{" "}
              it happens
            </p>
          </li>
        </ul>
      </div>
      <div className="mt-6 flex flex-wrap gap-1.5" aria-label="Keyboard shortcuts">
        {shortcuts.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-1.5 rounded-md border bg-card py-1 pr-2 pl-1 text-[11px] text-ink-2"
          >
            <kbd className="grid size-5 place-items-center rounded border bg-surface-2 font-mono text-[10px] text-foreground">
              {s.key}
            </kbd>
            {s.tool}
          </span>
        ))}
      </div>
    </IllustrationFrame>
  );
}
