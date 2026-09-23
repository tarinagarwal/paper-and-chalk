import { IllustrationFrame } from "./frame";

const CHALK = "#ece7dc";
const CHALK_DIM = "#9a948a";

function Node({
  x,
  y,
  w,
  label,
  filled = false,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  filled?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height="38"
        rx="9"
        fill={filled ? CHALK : "none"}
        stroke={CHALK}
        strokeWidth="1.6"
      />
      <text
        x={x + w / 2}
        y={y + 24}
        textAnchor="middle"
        className="font-sans text-[13px] font-medium"
        fill={filled ? "#1c1b19" : CHALK}
      >
        {label}
      </text>
    </g>
  );
}

function Arrow({ d, head, dashed = false }: { d: string; head: string; dashed?: boolean }) {
  return (
    <g fill="none" stroke={CHALK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} strokeDasharray={dashed ? "4 5" : undefined} />
      <path d={head} />
    </g>
  );
}

export function CanvasBoardIllustration() {
  return (
    <IllustrationFrame label="An infinite canvas on a chalkboard: a system diagram with connectors, a frame, sticky notes and a minimap, plus Mermaid code being pasted in as shapes.">
      <div className="relative">
        <div className="relative overflow-hidden rounded-xl border border-[#2f3135] bg-chalkboard">
          <svg viewBox="0 0 560 380" className="block h-auto w-full" aria-hidden>
            <defs>
              <pattern id="board-dots" width="16" height="16" patternUnits="userSpaceOnUse">
                <circle cx="8" cy="8" r="0.9" fill="#2c2e33" />
              </pattern>
            </defs>
            <rect width="560" height="380" fill="url(#board-dots)" />

            {/* Frame */}
            <rect
              x="24"
              y="40"
              width="372"
              height="228"
              rx="4"
              fill="none"
              stroke="#3d3f44"
              strokeWidth="1.2"
            />
            <text
              x="24"
              y="30"
              fill={CHALK_DIM}
              className="font-mono text-[10px] tracking-[0.12em]"
            >
              FRAME · SYNC ARCHITECTURE
            </text>

            <Node x={44} y={70} w={96} label="Browser" />
            <Node x={196} y={70} w={104} label="Next.js" />
            <Node x={196} y={150} w={104} label="Sync" filled />
            <Node x={44} y={206} w={96} label="Workers" />

            {/* Postgres cylinder */}
            <g fill="none" stroke={CHALK} strokeWidth="1.6">
              <path d="M 330 158 v 36 c 0 8, 44 8, 44 0 v -36" />
              <ellipse cx="352" cy="158" rx="22" ry="6" />
            </g>
            <text
              x="352"
              y="215"
              textAnchor="middle"
              fill={CHALK}
              className="font-sans text-[12px]"
            >
              Postgres
            </text>

            <Arrow d="M 142 89 H 190" head="M 184 83 L 191 89 L 184 95" />
            <Arrow
              d="M 92 110 V 136 Q 92 146, 102 146 H 186 Q 190 146, 190 150 V 162"
              head="M 184 158 L 190 164 L 196 158"
            />
            <Arrow d="M 302 169 H 326" head="M 320 163 L 327 169 L 320 175" />
            <Arrow
              d="M 248 190 V 225 Q 248 232, 240 232 H 146"
              head="M 152 226 L 145 232 L 152 238"
              dashed
            />
            <text x="160" y="140" fill={CHALK_DIM} className="font-mono text-[9px]">
              websocket
            </text>

            {/* Stickies outside the frame */}
            <g transform="translate(424 60) rotate(3)">
              <rect width="104" height="86" className="fill-sticky-butter" />
              <text x="12" y="30" className="font-display text-[16px]" fill="#1c1b19">
                Redis for
              </text>
              <text x="12" y="50" className="font-display text-[16px]" fill="#1c1b19">
                fan-out?
              </text>
            </g>
            <g transform="translate(430 170) rotate(-2)">
              <rect width="96" height="78" className="fill-sticky-sage" />
              <text x="12" y="30" className="font-display text-[16px]" fill="#1c1b19">
                p99 under
              </text>
              <text x="12" y="50" className="font-display text-[16px]" fill="#1c1b19">
                150 ms
              </text>
            </g>

            {/* Minimap */}
            <g transform="translate(24 294)">
              <rect width="100" height="66" rx="6" fill="#141517" stroke="#3d3f44" />
              <rect x="10" y="12" width="44" height="28" rx="1.5" fill="none" stroke="#5a5c62" />
              <rect x="62" y="12" width="10" height="9" fill="#e6d47f" />
              <rect x="62" y="26" width="10" height="9" fill="#b1cda8" />
              <rect
                x="6"
                y="8"
                width="72"
                height="42"
                rx="2"
                fill="rgb(124 155 255 / 0.12)"
                stroke="#7c9bff"
              />
            </g>
          </svg>
        </div>

        <div className="relative -mt-10 ml-auto w-[min(17rem,85%)] rotate-[1.5deg] rounded-lg bg-paper-sheet p-4 text-[#1c1b19] shadow-popover sm:absolute sm:-right-3 sm:-bottom-6 sm:mt-0">
          <p className="font-mono text-[10px] tracking-[0.12em] text-[#57524b]">PASTED MERMAID</p>
          <pre className="mt-2 font-mono text-[11px] leading-relaxed text-[#46423b]">
            {"flowchart LR\n  Browser --> Next.js\n  Browser -- ws --> Sync\n  Sync --> Postgres"}
          </pre>
          <p className="mt-2 text-[11px] text-[#57524b]">Became 4 shapes and 3 connectors.</p>
        </div>
      </div>
    </IllustrationFrame>
  );
}
