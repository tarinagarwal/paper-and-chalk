"use client";

import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { navLinks } from "./nav-links";

/** Loaded on first tap of the menu button, so Radix Dialog stays out of the initial bundle. */
export default function MobileNavSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const close = () => {
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(20rem,100vw)] gap-0 p-0">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle asChild>
            <div>
              <Logo />
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">Site navigation</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 p-3">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={close}
              className="rounded-lg px-3 py-3 font-display text-2xl hover:bg-accent"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t p-5">
          <Button asChild variant="outline" className="h-11 text-base">
            <Link href="/sign-in" onClick={close}>
              Sign in
            </Link>
          </Button>
          <Button asChild className="h-11 text-base">
            <Link href="/sign-in" onClick={close}>
              Get started
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
