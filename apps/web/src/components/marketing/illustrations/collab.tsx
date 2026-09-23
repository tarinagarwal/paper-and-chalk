import { IllustrationFrame } from "./frame";

function Cursor({ color, name, className }: { color: string; name: string; className: string }) {
  return (
    <div className={`absolute flex flex-col items-start ${className}`}>
      <svg viewBox="0 0 16 18" className="size-4" aria-hidden>
        <path
          d="M1 1 L15 8.6 L8.6 10.2 L5.6 16.8 Z"
          fill={color}
          stroke="#fff"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      <span
        className="ml-3 rounded-md px-2 py-0.5 text-[11px] font-medium text-white"
        style={{ background: color }}
      >
        {name}
      </span>
    </div>
  );
}

export function CollabIllustration() {
  return (
    <IllustrationFrame label="Two collaborators on one lecture PDF: Maya's cursor and live stroke, Jun's comment thread, a follow-mode outline, and an offline banner with changes waiting to sync.">
      <div className="relative mx-auto max-w-[34rem]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center">
            {[
              ["M", "#3f7d4e"],
              ["J", "#7a3e8f"],
              ["R", "#2f5bd3"],
            ].map(([initial, color], i) => (
              <span
                key={initial}
                className="grid size-8 place-items-center rounded-full text-xs font-semibold text-white ring-2 ring-background"
                style={{ background: color, marginLeft: i === 0 ? 0 : -8 }}
              >
                {initial}
              </span>
            ))}
            <span className="ml-3 hidden font-mono text-[11px] text-muted-foreground sm:inline">
              3 here
            </span>
          </div>
          <span className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 font-mono text-[11px] text-ink-2">
            <span className="size-1.5 rounded-full bg-pen-ochre" aria-hidden />
            Offline · 3<span className="hidden sm:inline"> changes</span> waiting
          </span>
        </div>

        <div className="relative rounded-md p-1.5 ring-2 ring-[#3f7d4e]">
          <span className="absolute -top-3 left-3 rounded bg-[#3f7d4e] px-1.5 py-0.5 text-[10px] font-medium text-white">
            Following Maya
          </span>
          <div className="relative overflow-hidden rounded-[3px] bg-paper-sheet px-6 pt-6 pb-8 text-[#2b2925] sm:px-8">
            <p className="font-mono text-[10px] tracking-[0.12em] text-[#57524b]">
              LECTURE 7 · THERMODYNAMICS
            </p>
            <p className="mt-3 font-display text-[0.9375rem] leading-[1.7]">
              The entropy of an isolated system never decreases. For a reversible process,{" "}
              <span className="relative inline-block">
                dS = δQ / T
                <svg
                  className="absolute -inset-x-2 -bottom-2 h-3 w-[calc(100%+1rem)]"
                  viewBox="0 0 100 12"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path
                    d="M2 7 C 20 3, 40 10, 60 5 S 90 6, 98 4"
                    fill="none"
                    stroke="#3f7d4e"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              , which is why a heat engine can never turn all of its heat into work.
            </p>
            <svg viewBox="0 0 300 70" className="mt-4 h-16 w-[50%]" aria-hidden>
              <path
                d="M10 55 C 50 55, 70 18, 110 16 C 150 14, 170 44, 210 40"
                fill="none"
                stroke="#7a3e8f"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M210 40 C 230 38, 245 30, 258 26"
                fill="none"
                stroke="#7a3e8f"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeDasharray="2 6"
                opacity="0.6"
              />
            </svg>
            <Cursor color="#3f7d4e" name="Maya" className="top-3 right-6" />
            <Cursor color="#7a3e8f" name="Jun · drawing" className="bottom-11 left-[44%]" />
          </div>
        </div>

        <div className="relative -mt-14 mr-[-0.25rem] ml-auto w-[min(16rem,88%)] rounded-xl border bg-popover p-3.5 shadow-popover sm:mr-[-1rem]">
          <div className="flex gap-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#7a3e8f] text-[10px] font-semibold text-white">
              J
            </span>
            <div className="text-[0.8125rem] leading-snug">
              <p>
                <span className="font-medium">Jun</span>{" "}
                <span className="font-mono text-[10px] text-muted-foreground">
                  on “dS = δQ / T”
                </span>
              </p>
              <p className="mt-1 text-ink-2">
                <span className="font-medium text-pen-moss">@Maya</span> is this on the midterm?
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2.5 border-t pt-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#3f7d4e] text-[10px] font-semibold text-white">
              M
            </span>
            <p className="text-[0.8125rem] leading-snug text-ink-2">Yes, question 3 last year.</p>
          </div>
        </div>
      </div>
    </IllustrationFrame>
  );
}
