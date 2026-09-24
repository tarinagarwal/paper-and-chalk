import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { UserMenu, type UserMenuUser } from "./user-menu";

export function AppTopbar({ title, user }: { title: React.ReactNode; user: UserMenuUser }) {
  return (
    <>
      <SidebarTrigger className="size-9" data-testid="sidebar-trigger" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
      <UserMenu user={user} />
    </>
  );
}
