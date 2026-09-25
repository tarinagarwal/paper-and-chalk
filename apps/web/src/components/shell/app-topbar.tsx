import { LibrarySearch } from "@/components/library/library-search";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { UserMenu, type UserMenuUser } from "./user-menu";

export function AppTopbar({ user }: { user: UserMenuUser }) {
  return (
    <>
      <SidebarTrigger className="size-9" data-testid="sidebar-trigger" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
      <div className="flex min-w-0 flex-1 items-center">
        <LibrarySearch />
      </div>
      <UserMenu user={user} />
    </>
  );
}
