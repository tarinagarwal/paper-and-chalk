import { ChevronDown } from "lucide-react";

import { faqs } from "@/content/home";

import { SectionIntro } from "./section";

/** Native <details>: accessible, keyboard friendly and no JavaScript. */
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="py-section-sm sm:py-section">
      <div className="container-page grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <SectionIntro
          id="faq-title"
          eyebrow="FAQ"
          title="Questions, answered in the margin."
          className="lg:sticky lg:top-28 lg:self-start"
        />
        <div className="border-t">
          {faqs.map((f) => (
            <details key={f.q} className="group border-b">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-[1.1875rem] leading-snug transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pb-6 text-[0.9375rem] leading-relaxed text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
