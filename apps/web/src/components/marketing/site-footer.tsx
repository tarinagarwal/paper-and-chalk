import Link from "next/link";

import { Logo } from "@/components/brand/logo";

import { navLinks } from "./nav-links";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="container-page grid gap-10 py-14 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex max-w-sm flex-col gap-4">
          <Link href="/" className="w-fit rounded-md" aria-label="Paper & Chalk home">
            <Logo />
          </Link>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            PDFs, notebooks and infinite whiteboards in one document, with ink that feels like a
            real pen.
          </p>
        </div>
        <nav aria-label="Product" className="flex flex-col gap-3">
          <p className="eyebrow">Product</p>
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="w-fit text-[0.9375rem] text-ink-2 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <nav aria-label="Account" className="flex flex-col gap-3">
          <p className="eyebrow">Account</p>
          <Link href="/sign-in" className="w-fit text-[0.9375rem] text-ink-2 hover:text-foreground">
            Sign in
          </Link>
          <Link href="/sign-in" className="w-fit text-[0.9375rem] text-ink-2 hover:text-foreground">
            Create an account
          </Link>
        </nav>
      </div>
      <div className="container-page">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t py-6 font-mono text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Paper &amp; Chalk</span>
          <span>Made for pens, fingers and keyboards.</span>
        </div>
      </div>
    </footer>
  );
}
