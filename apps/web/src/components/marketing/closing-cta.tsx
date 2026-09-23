import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/** A sheet of ruled paper, in both themes. */
export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="pb-section-sm sm:pb-section">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-2xl border bg-paper-sheet px-6 py-14 text-center text-[#1c1b19] shadow-paper sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, transparent 31px, rgb(47 91 211 / 0.14) 31px, rgb(47 91 211 / 0.14) 32px, transparent 32px)",
              backgroundSize: "100% 32px",
              maskImage: "radial-gradient(ellipse 60% 70% at 50% 50%, transparent 30%, black 75%)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-y-0 left-10 w-px bg-[rgb(196_62_24/0.3)] sm:left-16"
          />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
            <LogoMark className="size-14" />
            <h2
              id="cta-title"
              className="font-display text-[2.25rem] leading-[1.05] tracking-[-0.02em] text-balance sm:text-h1"
            >
              Open a PDF. Start writing.
            </h2>
            <p className="max-w-md text-[1.0625rem] leading-relaxed text-[#46423b]">
              No install and no card. Your first notebook is a click away.
            </p>
            <Button
              asChild
              className="h-12 bg-[#c43e18] px-6 text-base text-white hover:bg-[#a9340f]"
            >
              <Link href="/sign-in">
                Get started free
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
