import type { Metadata } from "next";
import { cookies } from "next/headers";

import { AppShell } from "@/components/shell/app-shell";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppTopbar } from "@/components/shell/app-topbar";

export const metadata: Metadata = {
  title: "Library",
  robots: { index: false, follow: false },
};

/** Shell for signed-in routes. Unprotected until auth lands. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <AppShell
      defaultOpen={defaultOpen}
      sidebar={<AppSidebar />}
      topbar={<AppTopbar title="Home" />}
    >
      {children}
    </AppShell>
  );
}
