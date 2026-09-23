import { docTypes, type DocTypeId } from "@/content/home";

import { SectionIntro } from "./section";

export function DocTypes() {
  return (
    <section aria-labelledby="doc-types-title" className="py-section-sm sm:py-section">
      <div className="container-page flex flex-col gap-12">
        <SectionIntro
          id="doc-types-title"
          eyebrow="One document system"
          title="Four kinds of document. One way of working."
          body="Every document uses the same pens, the same sharing and the same history, so you never pick the wrong app first."
        />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {docTypes.map((doc) => (
            <li key={doc.id} className="flex flex-col overflow-hidden rounded-xl border bg-card">
              <div className="flex h-40 items-center justify-center border-b bg-surface-2">
                <DocThumb id={doc.id} />
              </div>
              <div className="flex flex-col gap-2 p-5">
                <h3 className="font-display text-h3">{doc.name}</h3>
                <p className="text-[0.9375rem] leading-relaxed text-ink-2">{doc.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const ruled = {
  backgroundImage:
    "linear-gradient(to bottom, transparent 11px, color-mix(in oklab, var(--pen-cobalt) 28%, transparent) 11px, color-mix(in oklab, var(--pen-cobalt) 28%, transparent) 12px, transparent 12px)",
  backgroundSize: "100% 12px",
};

function Page({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`rounded-[2px] bg-paper-sheet shadow-paper ${className}`} style={style} />;
}

function DocThumb({ id }: { id: DocTypeId }) {
  switch (id) {
    case "notebook":
      return (
        <div className="relative h-28 w-40">
          <Page className="absolute top-1 left-4 h-26 w-20 rotate-[-4deg]" style={ruled} />
          <Page className="absolute top-0 left-16 h-26 w-20 rotate-[3deg]" style={ruled} />
        </div>
      );
    case "pdf":
      return (
        <div className="flex h-28 w-22 flex-col gap-1.5 rounded-[2px] bg-paper-sheet p-3 shadow-paper">
          <div className="h-1.5 w-10 rounded-full bg-paper-head" />
          <div className="mt-1 h-1 w-full rounded-full bg-paper-line" />
          <div className="relative h-1 w-full rounded-full bg-highlight">
            <div className="absolute inset-0 rounded-full bg-paper-line mix-blend-multiply" />
          </div>
          <div className="h-1 w-4/5 rounded-full bg-paper-line" />
          <div className="h-1 w-full rounded-full bg-paper-line" />
          <div className="mt-1 h-5 w-9 rounded-[50%] border-[1.5px] border-pen-vermilion" />
          <div className="h-1 w-3/4 rounded-full bg-paper-line" />
        </div>
      );
    case "canvas":
      return (
        <div className="relative h-28 w-44 overflow-hidden rounded-lg bg-chalkboard">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(var(--chalkboard-dot) 1px, transparent 1.2px)",
              backgroundSize: "10px 10px",
            }}
          />
          <div className="absolute top-5 left-4 h-7 w-12 rounded-md border border-chalk/80" />
          <div className="absolute top-14 left-24 h-7 w-14 rounded-md bg-chalk" />
          <svg className="absolute inset-0" viewBox="0 0 176 112" aria-hidden>
            <path
              d="M64 38 C 80 38, 84 60, 94 66"
              fill="none"
              stroke="#ece7dc"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute top-4 right-4 size-9 rotate-3 bg-sticky-butter" />
          <div className="absolute right-2 bottom-2 h-6 w-9 rounded-sm border border-chalk/40" />
        </div>
      );
    case "hybrid":
      return (
        <div className="flex h-28 items-end gap-1.5">
          <Page className="h-24 w-14" style={ruled} />
          <div className="flex h-24 w-14 flex-col gap-1 rounded-[2px] bg-paper-sheet p-2 shadow-paper">
            <div className="h-1 w-7 rounded-full bg-paper-head" />
            <div className="h-0.5 w-full rounded-full bg-paper-line" />
            <div className="h-0.5 w-full rounded-full bg-paper-line" />
            <div className="h-0.5 w-3/4 rounded-full bg-paper-line" />
          </div>
          <div className="h-24 w-14 rounded-[3px] bg-chalkboard p-2">
            <div className="h-4 w-7 rounded-sm border border-chalk/70" />
            <div className="mt-3 ml-3 size-5 bg-sticky-sage" />
          </div>
        </div>
      );
  }
}
