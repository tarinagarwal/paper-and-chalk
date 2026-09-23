import { audiences } from "@/content/home";

import { SectionIntro } from "./section";

export function Audiences() {
  return (
    <section aria-labelledby="audiences-title" className="py-section-sm sm:py-section">
      <div className="container-page flex flex-col gap-12">
        <SectionIntro
          id="audiences-title"
          eyebrow="Who it’s for"
          title="For anyone who thinks better with a pen in hand."
        />
        <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {audiences.map((a) => (
            <li key={a.who} className="flex flex-col gap-3 bg-card p-6 sm:p-7">
              <h3 className="font-display text-[1.5rem] leading-tight">{a.who}</h3>
              <p className="text-[0.9375rem] leading-relaxed text-ink-2">{a.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
