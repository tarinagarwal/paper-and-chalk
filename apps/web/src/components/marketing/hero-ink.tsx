import { cn } from "@/lib/utils";

/** Class names defined in globals.css (hero ink loop). */
const s = {
  scene: "ink-scene",
  sweep: "ink-sweep",
  draw: "ink-draw",
  pop: "ink-pop",
  reveal: "ink-reveal",
  hl1: "ink-hl1",
  hl2: "ink-hl2",
  circle: "ink-circle",
  arrow: "ink-arrow",
  arrowHead: "ink-arrow-head",
  sticky: "ink-sticky",
  stickyText: "ink-sticky-text",
  connector: "ink-connector",
  connectorHead: "ink-connector-head",
  maya: "ink-maya",
  jun: "ink-jun",
} as const;

/**
 * Hero scene: a PDF page resting on a chalkboard. Ink is drawn live on both: highlights snap to
 * text lines, a red pencil circles the chart, and Maya's arrow crosses from the page onto the
 * board, turning from graphite to chalk as it leaves the paper.
 */
const PAPER = { x: 24, y: 36, w: 356, h: 468 };
const BOARD = { x: 290, y: 110, w: 410, h: 410 };
const PAPER_RIGHT = PAPER.x + PAPER.w;

const textLines = (ys: readonly number[], widths: readonly number[]) =>
  ys.map((y, i) => ({ y, w: widths[i] ?? 280 }));

const para1 = textLines([132, 150, 168, 186, 204], [292, 280, 288, 262, 196]);
const para2 = textLines([374, 392, 410, 428], [292, 270, 284, 150]);
const bars = [
  { x: 80, h: 30 },
  { x: 134, h: 52 },
  { x: 188, h: 44 },
  { x: 242, h: 80, peak: true },
  { x: 296, h: 62 },
];

const ARROW = "M 306 296 C 350 298, 400 314, 441 339";
const ARROW_HEAD = "M 423 330 L 442 340 L 425 350";
const CIRCLE =
  "M 300 266 C 298 236, 226 234, 221 272 C 216 314, 296 328, 304 292 C 308 272, 292 258, 270 255";

export function HeroInk({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 720 560"
      className={cn(s.scene, "block h-auto w-full overflow-visible", className)}
      role="img"
      aria-label="A PDF page resting on a chalkboard. Two lines are highlighted, a chart bar is circled in red pencil, and Maya draws an arrow from the page onto the board, where a sticky note asks: Q2 or Q3 numbers?"
      data-testid="hero-ink"
    >
      <defs>
        <pattern id="hero-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="9" cy="9" r="1" className="fill-chalkboard-dot" />
        </pattern>
        <clipPath id="hero-on-paper">
          <rect x={PAPER.x} y={PAPER.y} width={PAPER.w} height={PAPER.h} />
        </clipPath>
        <clipPath id="hero-on-board">
          <rect x={PAPER_RIGHT} y="0" width={720 - PAPER_RIGHT} height="560" />
        </clipPath>
      </defs>

      {/* Chalkboard */}
      <rect
        x={BOARD.x}
        y={BOARD.y}
        width={BOARD.w}
        height={BOARD.h}
        rx="18"
        className="fill-chalkboard"
      />
      <rect
        x={BOARD.x}
        y={BOARD.y}
        width={BOARD.w}
        height={BOARD.h}
        rx="18"
        fill="url(#hero-dots)"
      />
      <rect
        x={BOARD.x + 0.5}
        y={BOARD.y + 0.5}
        width={BOARD.w - 1}
        height={BOARD.h - 1}
        rx="17.5"
        fill="none"
        stroke="#2f3135"
      />
      <text
        x="404"
        y="146"
        className="fill-[#9a948a] font-mono text-[10px] tracking-[0.12em]"
        aria-hidden
      >
        FRAME · Q3 REVIEW
      </text>

      {/* Diagram on the board */}
      <rect
        x="404"
        y="164"
        width="104"
        height="42"
        rx="9"
        fill="none"
        stroke="#ece7dc"
        strokeWidth="1.6"
      />
      <text
        x="456"
        y="190"
        textAnchor="middle"
        className="fill-chalk font-sans text-[14px] font-medium"
      >
        Draft
      </text>
      <rect x="566" y="164" width="112" height="42" rx="9" className="fill-chalk" />
      <text
        x="622"
        y="190"
        textAnchor="middle"
        className="fill-[#1c1b19] font-sans text-[14px] font-medium"
      >
        Review
      </text>
      <path
        className={cn(s.draw, s.connector)}
        pathLength={1}
        d="M 510 185 C 528 181, 546 181, 562 185"
        fill="none"
        stroke="#ece7dc"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        className={cn(s.draw, s.connectorHead)}
        pathLength={1}
        d="M 553 178 L 563 185 L 553 192"
        fill="none"
        stroke="#ece7dc"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* A second sticky, already on the board */}
      <g transform="translate(596 422) rotate(3)">
        <rect width="92" height="78" className="fill-sticky-sky" />
        <text x="12" y="32" className="fill-[#1c1b19] font-display text-[18px]">
          ship Fri
        </text>
        <text x="12" y="64" className="fill-[#1c1b19]/55 font-mono text-[9px]">
          jun
        </text>
      </g>

      {/* PDF page */}
      <rect
        x={PAPER.x}
        y={PAPER.y}
        width={PAPER.w}
        height={PAPER.h}
        rx="3"
        className="fill-paper-sheet"
      />
      <rect x="60" y="76" width="168" height="11" rx="2" className="fill-paper-head" />
      <rect x="60" y="97" width="104" height="7" rx="2" className="fill-paper-line" />

      <rect
        className={cn(s.sweep, s.hl1, "fill-highlight")}
        x="56"
        y="161"
        width="296"
        height="20"
        rx="2"
      />
      <rect
        className={cn(s.sweep, s.hl2, "fill-highlight")}
        x="56"
        y="179"
        width="270"
        height="20"
        rx="2"
      />
      {para1.map((l) => (
        <rect key={l.y} x="60" y={l.y} width={l.w} height="6" rx="3" className="fill-paper-line" />
      ))}

      <rect
        x="60.5"
        y="232.5"
        width="291"
        height="117"
        rx="2"
        fill="none"
        className="stroke-paper-line"
      />
      {bars.map((b) => (
        <rect
          key={b.x}
          x={b.x}
          y={336 - b.h}
          width="36"
          height={b.h}
          className={b.peak ? "fill-paper-head" : "fill-paper-line"}
        />
      ))}

      {para2.map((l) => (
        <rect key={l.y} x="60" y={l.y} width={l.w} height="6" rx="3" className="fill-paper-line" />
      ))}
      <text x="202" y="480" textAnchor="middle" className="fill-paper-head font-mono text-[11px]">
        3 / 12
      </text>

      {/* Red pencil circles the peak */}
      <path
        className={cn(s.draw, s.circle)}
        pathLength={1}
        d={CIRCLE}
        fill="none"
        stroke="#c43e18"
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Maya's arrow: graphite on the paper, chalk on the board */}
      <g fill="none" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path
          className={cn(s.draw, s.arrow)}
          pathLength={1}
          d={ARROW}
          stroke="#1c1b19"
          clipPath="url(#hero-on-paper)"
        />
        <path
          className={cn(s.draw, s.arrow)}
          pathLength={1}
          d={ARROW}
          stroke="#ece7dc"
          clipPath="url(#hero-on-board)"
        />
        <path className={cn(s.draw, s.arrowHead)} pathLength={1} d={ARROW_HEAD} stroke="#ece7dc" />
      </g>

      {/* The sticky Maya drops on the board */}
      <g transform="translate(452 300) rotate(-3)">
        <g className={cn(s.pop, s.sticky)}>
          <rect width="138" height="118" className="fill-sticky-butter" />
          <text x="16" y="42" className="fill-[#1c1b19] font-display text-[21px]">
            Q2 or Q3
          </text>
          <text x="16" y="68" className="fill-[#1c1b19] font-display text-[21px]">
            numbers?
          </text>
          <rect
            className={cn(s.reveal, s.stickyText, "fill-sticky-butter")}
            x="12"
            y="22"
            width="120"
            height="54"
          />
          <text x="16" y="104" className="fill-[#1c1b19]/55 font-mono text-[9px]">
            maya
          </text>
        </g>
      </g>

      {/* Collaborator cursors */}
      <g className={s.jun}>
        <Cursor color="#7a3e8f" name="Jun" />
      </g>
      <g className={s.maya}>
        <Cursor color="#3f7d4e" name="Maya" />
      </g>
    </svg>
  );
}

function Cursor({ color, name }: { color: string; name: string }) {
  const width = name.length * 7.4 + 16;
  return (
    <g>
      <path
        d="M0 0 L14 7.6 L7.6 9.2 L4.6 15.8 Z"
        fill={color}
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <rect x="10" y="16" width={width} height="20" rx="6" fill={color} />
      <text
        x={10 + width / 2}
        y="30"
        textAnchor="middle"
        className="fill-white font-sans text-[11.5px] font-medium"
      >
        {name}
      </text>
    </g>
  );
}
