import { pricingNotes } from "@/content/pricing";

import { PricingPlans } from "./pricing-plans";
import { SectionIntro } from "./section";

export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="border-y bg-surface-2 py-section-sm sm:py-section"
    >
      <div className="container-page flex flex-col gap-10">
        <SectionIntro
          id="pricing-title"
          eyebrow="Pricing"
          title="Free for ink and PDFs. Pay for room to grow."
          body="You pay for storage, collaboration at scale, AI and audio. Writing never costs anything."
        />
        <PricingPlans />
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-8">
          {pricingNotes.map((note) => (
            <li key={note} className="flex items-center gap-2">
              <span aria-hidden className="size-1 rounded-full bg-line-strong" />
              {note}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
