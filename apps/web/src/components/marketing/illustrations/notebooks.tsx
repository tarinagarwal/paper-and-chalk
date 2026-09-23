import { IllustrationFrame } from "./frame";

const line = "rgb(47 91 211 / 0.28)";
const grid = "rgb(28 27 25 / 0.12)";

/** CSS drawings of a few of the 18 paper templates. Colours are fixed: this is paper. */
const templates: { name: string; style: React.CSSProperties; extra?: React.ReactNode }[] = [
  {
    name: "College ruled",
    style: {
      backgroundImage: `linear-gradient(to right, transparent 13px, rgb(196 62 24 / 0.45) 13px, rgb(196 62 24 / 0.45) 14px, transparent 14px), linear-gradient(to bottom, transparent 9px, ${line} 9px, ${line} 10px, transparent 10px)`,
      backgroundSize: "100% 100%, 100% 10px",
      backgroundPosition: "0 0, 0 14px",
    },
  },
  {
    name: "Grid 5 mm",
    style: {
      backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
      backgroundSize: "8px 8px",
    },
  },
  {
    name: "Dot grid",
    style: {
      backgroundImage: "radial-gradient(rgb(28 27 25 / 0.3) 0.9px, transparent 1.1px)",
      backgroundSize: "8px 8px",
    },
  },
  {
    name: "Cornell",
    style: {
      backgroundImage: `linear-gradient(to bottom, transparent 9px, ${line} 9px, ${line} 10px, transparent 10px)`,
      backgroundSize: "100% 10px",
      backgroundPosition: "0 8px",
    },
    extra: (
      <>
        <span className="absolute inset-y-0 left-[30%] w-px bg-[rgb(196_62_24/0.45)]" />
        <span className="absolute inset-x-0 bottom-[22%] h-px bg-[rgb(196_62_24/0.45)]" />
        <span className="absolute inset-x-0 bottom-0 h-[22%] bg-[#fffdf8]" />
      </>
    ),
  },
  {
    name: "Isometric",
    style: {
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13.86' height='8' viewBox='0 0 13.86 8'%3E%3Cpath d='M0 0 L13.86 8 M13.86 0 L0 8 M0 0 V8' stroke='rgb(28 27 25 / 0.16)' stroke-width='0.7' fill='none'/%3E%3C/svg%3E")`,
      backgroundSize: "13.86px 8px",
    },
  },
  {
    name: "Music staff",
    style: {
      backgroundImage: `repeating-linear-gradient(to bottom, rgb(28 27 25 / 0.35) 0 1px, transparent 1px 4px, rgb(28 27 25 / 0.35) 4px 5px, transparent 5px 8px, rgb(28 27 25 / 0.35) 8px 9px, transparent 9px 12px, rgb(28 27 25 / 0.35) 12px 13px, transparent 13px 16px, rgb(28 27 25 / 0.35) 16px 17px, transparent 17px 34px)`,
      backgroundPosition: "0 10px",
    },
  },
  {
    name: "Graph with axes",
    style: {
      backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`,
      backgroundSize: "6px 6px",
    },
    extra: (
      <>
        <span className="absolute inset-x-2 top-1/2 h-[1.5px] bg-[#1c1b19]/60" />
        <span className="absolute inset-y-2 left-1/2 w-[1.5px] bg-[#1c1b19]/60" />
      </>
    ),
  },
  {
    name: "Planner, weekly",
    style: {},
    extra: (
      <span className="absolute inset-2 grid grid-cols-2 gap-1">
        {["M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span
            key={i}
            className="border-t border-[#1c1b19]/20 pt-0.5 font-mono text-[6px] text-[#57524b]"
          >
            {d}
          </span>
        ))}
      </span>
    ),
  },
];

const sizes = [
  { name: "A6", w: 105, h: 148 },
  { name: "A5", w: 148, h: 210 },
  { name: "A4", w: 210, h: 297 },
  { name: "Letter", w: 216, h: 279 },
  { name: "16:9", w: 254, h: 143 },
];

export function NotebooksIllustration() {
  return (
    <IllustrationFrame label="Eight paper templates, from college ruled to a weekly planner, and page sizes from A6 to a 16:9 slide.">
      <ul className="grid grid-cols-4 gap-x-2.5 gap-y-4 sm:gap-x-4">
        {templates.map((t) => (
          <li key={t.name} className="flex flex-col gap-2">
            <div
              className="relative aspect-[3/4] overflow-hidden rounded-[2px] bg-[#fffdf8] shadow-paper"
              style={t.style}
            >
              {t.extra}
            </div>
            <span className="truncate font-mono text-[9px] text-ink-2 sm:text-[10.5px]">
              {t.name}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-7 flex items-end gap-3 border-t border-dashed pt-5 sm:gap-5">
        {sizes.map((size) => (
          <div key={size.name} className="flex flex-col items-center gap-1.5">
            <div
              className="rounded-[2px] border border-[#1c1b19]/25 bg-[#fffdf8]"
              style={{ width: size.w / 5.5, height: size.h / 5.5 }}
            />
            <span className="font-mono text-[10px] text-muted-foreground">{size.name}</span>
          </div>
        ))}
        <span className="ml-auto font-mono text-[10px] leading-tight text-muted-foreground">
          + A0–A3, B, C,
          <br />
          Legal, custom
        </span>
      </div>
    </IllustrationFrame>
  );
}
