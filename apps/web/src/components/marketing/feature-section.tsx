import type { Feature } from "@/content/home";
import { cn } from "@/lib/utils";

import { Tick } from "./section";

export function FeatureSection({
  feature,
  illustration,
  flip = false,
}: {
  feature: Feature;
  illustration: React.ReactNode;
  flip?: boolean;
}) {
  const titleId = `feature-${feature.id}-title`;
  return (
    <section
      id={`feature-${feature.id}`}
      aria-labelledby={titleId}
      className="border-t py-section-sm sm:py-section"
    >
      <div className="container-page grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className={cn("flex max-w-xl flex-col", flip && "lg:order-2")}>
          <p className="flex items-center gap-3 eyebrow">
            <span className="text-primary">{feature.number}</span>
            <span aria-hidden className="h-px w-8 bg-line-strong" />
            <span>{feature.label}</span>
          </p>
          <h2
            id={titleId}
            className="mt-5 font-display text-[2.125rem] leading-[1.08] tracking-[-0.018em] text-balance sm:text-h2"
          >
            {feature.title}
          </h2>
          <p className="mt-5 text-[1.0625rem] leading-relaxed text-pretty text-ink-2">
            {feature.body}
          </p>
          <ul className="mt-8 flex flex-col gap-3.5 border-t pt-7">
            {feature.points.map((point) => (
              <li key={point} className="flex gap-3 text-[0.9375rem] leading-snug">
                <Tick className="mt-0.5 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={cn("min-w-0", flip && "lg:order-1")}>{illustration}</div>
      </div>
    </section>
  );
}
