import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { AppTopbar } from "@/components/shell/app-topbar";
import { getSession } from "@/lib/auth";
import { displayName } from "@/lib/user";

// Per-user pages: never prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Library",
  robots: { index: false, follow: false },
};

/** Shell for signed-in routes. The proxy redirects signed-out requests; this checks again. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/sign-in?callbackUrl=%2Fapp");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const { user } = session;

  return (
    <AppShell
      defaultOpen={defaultOpen}
      sidebar={<AppSidebar />}
      topbar={
        <AppTopbar
          title="Home"
          user={{
            id: user.id,
            name: displayName(user),
            email: user.email,
            image: user.image ?? null,
          }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
