import Link from "next/link";

import { Logo } from "@/components/brand/logo";

/** Full-page frame for sign-in screens: dotted desk, logo, one card. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-canvas-dots">
      <div className="container-page flex h-16 items-center">
        <Link href="/" aria-label="Paper & Chalk home" className="rounded-md">
          <Logo />
        </Link>
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:items-center sm:pt-0">
        <div className="w-full max-w-[26rem] rounded-2xl border bg-card p-7 shadow-float sm:p-9">
          {children}
        </div>
      </div>
    </main>
  );
}
