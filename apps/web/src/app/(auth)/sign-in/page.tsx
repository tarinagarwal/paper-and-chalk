import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

/** Placeholder until the auth step builds real sign-in. */
export default function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas-dots p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border bg-card p-8 text-center shadow-float">
        <Link href="/" aria-label="Paper & Chalk home" className="rounded-md">
          <Logo />
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[2rem] leading-tight">Sign in</h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            Accounts open soon. Google and email sign-in are on their way.
          </p>
        </div>
        <Button asChild variant="outline" className="h-11 w-full text-[0.9375rem]">
          <Link href="/">
            <ArrowLeft className="size-4" aria-hidden />
            Back to the home page
          </Link>
        </Button>
      </div>
    </main>
  );
}
