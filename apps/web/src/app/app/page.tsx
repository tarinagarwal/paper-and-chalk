export default function AppHomePage() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-8">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Library</p>
        <h1 className="font-display text-[2.25rem] leading-tight tracking-[-0.015em]">Home</h1>
      </div>

      <section
        aria-label="Documents"
        className="flex min-h-[22rem] flex-1 flex-col items-center justify-center gap-5 rounded-2xl border border-dashed bg-canvas-dots p-8 text-center"
      >
        <div aria-hidden className="relative h-24 w-32">
          <div className="absolute top-2 left-3 h-20 w-16 -rotate-6 rounded-[2px] bg-paper-sheet shadow-paper" />
          <div className="absolute top-0 left-12 flex h-20 w-16 rotate-3 flex-col gap-1.5 rounded-[2px] bg-paper-sheet p-2.5 shadow-paper">
            <span className="h-1 w-8 rounded-full bg-paper-head" />
            <span className="h-0.5 w-full rounded-full bg-paper-line" />
            <span className="h-0.5 w-full rounded-full bg-paper-line" />
            <span className="h-0.5 w-3/4 rounded-full bg-paper-line" />
          </div>
        </div>
        <div className="flex max-w-sm flex-col gap-2">
          <h2 className="font-display text-[1.5rem] leading-tight">Nothing here yet</h2>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            Your notebooks, PDFs and boards will live here, along with anything people share with
            you.
          </p>
        </div>
      </section>
    </div>
  );
}
