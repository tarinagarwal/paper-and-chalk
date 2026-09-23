"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70dvh] flex-1 flex-col items-center justify-center gap-6 bg-canvas-dots p-6 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="max-w-lg font-display text-[2.25rem] leading-tight tracking-[-0.015em]">
        This page smudged. Try it again.
      </h1>
      <p className="max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
        The error has been logged. If it keeps happening, reloading the page usually clears it.
      </p>
      {error.digest ? (
        <p className="rounded-md border bg-card px-2.5 py-1 font-mono text-xs text-muted-foreground">
          ref {error.digest}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset} className="h-11 px-5 text-[0.9375rem]">
          Try again
        </Button>
        <Button asChild variant="outline" className="h-11 bg-card px-5 text-[0.9375rem]">
          <Link href="/">Back to the home page</Link>
        </Button>
      </div>
    </main>
  );
}
