import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppTopbar({ title }: { title: React.ReactNode }) {
  return (
    <>
      <SidebarTrigger className="size-9" data-testid="sidebar-trigger" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
      <ThemeToggle />
      <Avatar className="size-8">
        <AvatarFallback className="bg-surface-2 font-mono text-[11px] text-ink-2">
          You
        </AvatarFallback>
      </Avatar>
    </>
  );
}
