"use client";

import { useEffect, useState } from "react";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/** Tablet widths get the sidebar collapsed to its icon rail. Below 768 px it becomes a sheet. */
const TABLET = "(min-width: 768px) and (max-width: 1279px)";

/**
 * Layout for authenticated routes: a sidebar slot, a top bar slot and the content area.
 * The sidebar remembers the user's choice (cookie) and collapses itself on tablet widths.
 */
export function AppShell({
  sidebar,
  topbar,
  children,
  defaultOpen = true,
}: {
  sidebar: React.ReactNode;
  topbar: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const query = window.matchMedia(TABLET);
    const apply = () => {
      if (query.matches) setOpen(false);
    };
    apply();
    query.addEventListener("change", apply);
    return () => {
      query.removeEventListener("change", apply);
    };
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider open={open} onOpenChange={setOpen}>
        {sidebar}
        <SidebarInset className="min-w-0 bg-background">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md sm:px-4">
            {topbar}
          </header>
          <div id="content" className="flex min-w-0 flex-1 flex-col">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
