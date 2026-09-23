import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { HeroInk } from "./hero-ink";

const imports = ["PDF", "PowerPoint", "Word", "Images", "Excalidraw", "GoodNotes exports"];

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden border-b bg-canvas-dots"
    >
      <div className="container-page grid items-center gap-12 pt-14 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-10 lg:pt-24 lg:pb-24">
        <div className="flex max-w-xl flex-col items-start">
          <p className="mb-6 flex flex-wrap items-center gap-x-2.5 gap-y-1 eyebrow">
            <span>PDFs</span>
            <span aria-hidden className="text-line-strong">
              /
            </span>
            <span>Notebooks</span>
            <span aria-hidden className="text-line-strong">
              /
            </span>
            <span>Infinite canvas</span>
          </p>
          <h1
            id="hero-title"
            className="font-display text-[2.75rem] leading-[1.02] tracking-[-0.025em] text-balance sm:text-h1 xl:text-display"
          >
            Paper for notes,
            <br />
            <span className="italic">chalk for ideas.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-[1.0625rem] leading-relaxed text-ink-2 sm:text-lead">
            Mark up PDFs, fill notebooks and sketch on an infinite board, all in one document. The
            ink feels like a real pen, and everyone can be on the page at once.
          </p>
          <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button asChild className="h-12 px-6 text-base">
              <Link href="/sign-in">
                Start writing, free
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12 bg-card px-6 text-base">
              <a href="#features">See what&rsquo;s inside</a>
            </Button>
          </div>
          <p className="mt-5 font-mono text-xs leading-relaxed text-muted-foreground">
            Ink and PDF markup are free. Works offline. Nothing to install.
          </p>
        </div>

        <div className="relative -mx-2 sm:mx-0">
          {/* The page's shadow lives outside the SVG so animation frames don't repaint a filter. */}
          <div
            aria-hidden
            className="absolute top-[6.43%] left-[3.33%] h-[83.57%] w-[49.44%] rounded-[3px] shadow-paper"
          />
          <HeroInk className="relative" />
        </div>
      </div>

      <div className="border-t">
        <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-3 py-5">
          <span className="eyebrow">Opens</span>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
            {imports.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <span aria-hidden className="size-1 rounded-full bg-line-strong" />
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
