import { secondaryFeatures, type Feature } from "@/content/home";

import { cursive, polyline } from "./illustrations/ink-geometry";

import { SectionIntro, Tick } from "./section";

export function SecondaryFeatures() {
  return (
    <section aria-labelledby="more-features-title" className="border-t py-section-sm sm:py-section">
      <div className="container-page flex flex-col gap-12">
        <SectionIntro
          id="more-features-title"
          eyebrow="And the rest of the desk"
          title="The things paper could never do."
        />
        <div className="grid gap-5 md:grid-cols-2">
          {secondaryFeatures.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const titleId = `feature-${feature.id}-title`;
  return (
    <article
      id={`feature-${feature.id}`}
      aria-labelledby={titleId}
      className="flex flex-col overflow-hidden rounded-2xl border bg-card"
    >
      <div className="flex h-72 items-center justify-center overflow-hidden border-b bg-canvas-dots p-6">
        <Illustration id={feature.id} />
      </div>
      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <p className="flex items-center gap-3 eyebrow">
          <span className="text-primary">{feature.number}</span>
          <span aria-hidden className="h-px w-6 bg-line-strong" />
          <span>{feature.label}</span>
        </p>
        <h3
          id={titleId}
          className="mt-4 font-display text-[1.625rem] leading-tight tracking-[-0.01em]"
        >
          {feature.title}
        </h3>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">{feature.body}</p>
        <ul className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-5">
          {feature.points.map((p) => (
            <li key={p} className="flex items-center gap-2 text-sm">
              <Tick className="size-3.5 text-primary" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function Illustration({ id }: { id: string }) {
  switch (id) {
    case "audio":
      return <AudioArt />;
    case "ai":
      return <AiArt />;
    case "study":
      return <StudyArt />;
    case "present":
      return <PresentArt />;
    default:
      return null;
  }
}

// Four lines of handwriting: words of cursive loops with gaps between them.
const noteLines = [
  [
    [8, 58],
    [72, 54],
    [132, 72],
  ],
  [
    [8, 40],
    [54, 66],
    [126, 44],
  ],
  [
    [8, 70],
    [84, 38],
    [128, 60],
  ],
  [
    [8, 46],
    [60, 30],
  ],
].map((words, row) =>
  words
    .map(([x, w]) =>
      polyline(
        cursive(x ?? 0, 18 + row * 24, w ?? 0, {
          pitch: 9.5,
          loop: 8,
          rise: 3,
          steps: 12,
          vary: 0.6,
        }),
      ),
    )
    .join(" "),
);

function AudioArt() {
  const bars = [
    6, 12, 9, 16, 22, 14, 8, 18, 26, 20, 12, 7, 15, 21, 11, 6, 13, 19, 9, 5, 12, 17, 10, 6,
  ];
  return (
    <div className="w-full max-w-xs" aria-hidden>
      <div className="rounded-[3px] bg-paper-sheet px-4 pt-4 pb-3 shadow-paper">
        <svg viewBox="0 0 224 96" className="h-auto w-full">
          <defs>
            <clipPath id="audio-played">
              <rect x="0" y="0" width="224" height="54" />
              <rect x="0" y="54" width="104" height="42" />
            </clipPath>
          </defs>
          {noteLines.map((d) => (
            <path
              key={d}
              d={d}
              fill="none"
              stroke="#1c1b19"
              strokeOpacity="0.16"
              strokeWidth="1.15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          <g clipPath="url(#audio-played)">
            {noteLines.map((d) => (
              <path
                key={d}
                d={d}
                fill="none"
                stroke="#1c1b19"
                strokeWidth="1.15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        </svg>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-full border bg-card py-1.5 pr-4 pl-1.5 shadow-float">
        <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
          <svg viewBox="0 0 12 12" className="size-3" fill="currentColor">
            <path d="M3 2 L10 6 L3 10 Z" />
          </svg>
        </span>
        <span className="flex h-6 flex-1 items-center gap-[3px]">
          {bars.map((h, i) => (
            <span
              key={i}
              className={
                i < 11
                  ? "w-[3px] rounded-full bg-foreground"
                  : "w-[3px] rounded-full bg-line-strong"
              }
              style={{ height: h }}
            />
          ))}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">12:04</span>
      </div>
    </div>
  );
}

function AiArt() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3" aria-hidden>
      <div className="rounded-[3px] bg-paper-sheet px-4 py-3 shadow-paper">
        <p className="font-display text-[1.375rem] text-[#1c1b19] italic">
          x ={" "}
          <span className="inline-flex flex-col items-center align-middle text-[0.95rem] leading-tight">
            <span className="border-b border-[#1c1b19] px-1">−b ± √(b² − 4ac)</span>
            <span>2a</span>
          </span>
        </p>
      </div>
      <div className="rounded-xl border bg-popover p-3 shadow-popover">
        <p className="eyebrow">Handwriting → LaTeX</p>
        <p className="mt-2 overflow-x-auto rounded-md bg-surface-2 px-2.5 py-2 font-mono text-[11px] whitespace-nowrap">
          {"x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
            Insert
          </span>
          <span className="rounded-md border px-2.5 py-1 text-xs">Replace ink</span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">cites p. 12</span>
        </div>
      </div>
    </div>
  );
}

function StudyArt() {
  return (
    <div className="flex w-full max-w-sm items-end gap-4" aria-hidden>
      <div className="flex-1 space-y-3 rounded-[3px] bg-paper-sheet p-4 shadow-paper">
        <p className="font-mono text-[9px] tracking-[0.12em] text-[#57524b]">CELL BIOLOGY</p>
        {[
          ["Powerhouse", "mitochondria", false],
          ["Makes proteins", "ribosome", true],
          ["Stores DNA", "nucleus", false],
        ].map(([q, a, revealed]) => (
          <div key={String(q)} className="flex items-center gap-2 text-[11px] text-[#2b2925]">
            <span className="w-20 shrink-0">{q}</span>
            {revealed ? (
              <span className="font-display text-[13px] text-[#a3300d] italic">{a}</span>
            ) : (
              <span
                className="h-4 flex-1 rounded-[2px]"
                style={{
                  background:
                    "repeating-linear-gradient(-45deg, rgb(200 145 30 / 0.55) 0 5px, rgb(200 145 30 / 0.4) 5px 10px)",
                }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="relative w-28 shrink-0">
        <div className="absolute inset-0 translate-x-1.5 -translate-y-1.5 rounded-lg border bg-card" />
        <div className="relative rounded-lg border bg-card p-3 shadow-float">
          <p className="font-mono text-[9px] text-muted-foreground">DUE TODAY</p>
          <p className="font-display text-[2rem] leading-none">14</p>
          <p className="mt-1 text-[10px] text-muted-foreground">cards</p>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[9px]">
            {["Again", "Hard", "Good", "Easy"].map((l) => (
              <span key={l} className="rounded bg-surface-2 px-1 py-0.5 text-center">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const formats = ["PDF", "PDF + annotations", "PNG", "SVG", "Markdown", "DOCX", "ZIP"];

function PresentArt() {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3" aria-hidden>
      <div className="relative h-40 overflow-hidden rounded-lg border border-[#2f3135] bg-chalkboard">
        <div className="absolute top-4 left-5">
          <p className="font-mono text-[9px] tracking-[0.12em] text-[#9a948a]">SLIDE 4 / 12</p>
          <p className="mt-1 font-display text-[1.25rem] text-chalk">Why local-first?</p>
        </div>
        <svg
          viewBox="0 0 320 180"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 h-full w-full"
        >
          <path
            d="M40 130 C 90 100, 130 150, 180 118 S 250 90, 270 112"
            fill="none"
            stroke="#ff7447"
            strokeWidth="6"
            strokeLinecap="round"
            opacity="0.18"
          />
          <path
            d="M120 130 C 150 128, 160 140, 180 118 S 250 90, 270 112"
            fill="none"
            stroke="#ff7447"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.45"
          />
          <circle cx="270" cy="112" r="6" fill="#ff7447" />
          <circle cx="270" cy="112" r="12" fill="#ff7447" opacity="0.25" />
        </svg>
        <span className="absolute right-3 bottom-3 rounded bg-[#141517] px-1.5 py-0.5 font-mono text-[9px] text-[#9a948a]">
          laser
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {formats.map((f) => (
          <span key={f} className="rounded-md border bg-card px-2 py-1 font-mono text-[10px]">
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
