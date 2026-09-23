"use client";

import { Menu } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const MobileNavSheet = dynamic(() => import("./mobile-nav-sheet"), { ssr: false });

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon-lg"
        className="md:hidden"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="mobile-menu"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        <Menu className="size-5" aria-hidden />
      </Button>
      {loaded ? <MobileNavSheet open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
