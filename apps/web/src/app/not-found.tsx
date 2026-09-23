import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas-dots">
      <div className="container-page flex h-16 items-center">
        <Link href="/" aria-label="Paper & Chalk home" className="rounded-md">
          <Logo />
        </Link>
      </div>
      <div className="container-page flex flex-1 flex-col items-center justify-center gap-8 pb-24 text-center">
        <div className="relative">
          <p className="font-display text-[7rem] leading-none tracking-[-0.04em] sm:text-[10rem]">
            404
          </p>
          <svg
            viewBox="0 0 320 160"
            className="pointer-events-none absolute -inset-x-10 -inset-y-6 h-[calc(100%+3rem)] w-[calc(100%+5rem)]"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d="M 292 58 C 286 16, 60 10, 26 64 C 0 110, 150 150, 262 128 C 320 116, 318 60, 250 36"
              fill="none"
              className="stroke-primary"
              strokeWidth="3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="flex max-w-md flex-col gap-3">
          <h1 className="font-display text-[2rem] leading-tight">
            This page isn&rsquo;t in the notebook.
          </h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            The link may be old, or the page may have been moved. Nothing you wrote is lost.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild className="h-11 px-5 text-[0.9375rem]">
            <Link href="/">Back to the home page</Link>
          </Button>
          <Button asChild variant="outline" className="h-11 bg-card px-5 text-[0.9375rem]">
            <Link href="/app">Open your library</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
