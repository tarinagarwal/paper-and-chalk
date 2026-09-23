"use client";

import { Clock3, Folder, Home, Star, Tag, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark, Wordmark } from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

/** Library sections from SPEC.md section 5. Routes arrive with the library step. */
const primary = [
  { label: "Home", href: "/app", icon: Home },
  { label: "Recents", href: null, icon: Clock3 },
  { label: "Shared with me", href: null, icon: Users },
  { label: "Favourites", href: null, icon: Star },
] as const;

const organise = [
  { label: "Folders", icon: Folder },
  { label: "Tags", icon: Tag },
] as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" aria-label="Library">
      <SidebarHeader className="h-14 justify-center border-b">
        <Link
          href="/app"
          className="flex items-center gap-2.5 rounded-md px-1.5"
          aria-label="Paper & Chalk library"
        >
          <LogoMark className="size-6" compact />
          <Wordmark className="text-[1.1875rem] leading-none group-data-[collapsible=icon]:hidden" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {primary.map((item) => (
                <SidebarMenuItem key={item.label}>
                  {item.href ? (
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      tooltip={`${item.label} (coming soon)`}
                      aria-disabled
                      className="opacity-60"
                    >
                      <item.icon aria-hidden />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="eyebrow">Organise</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {organise.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    tooltip={`${item.label} (coming soon)`}
                    aria-disabled
                    className="opacity-60"
                  >
                    <item.icon aria-hidden />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Trash (coming soon)" aria-disabled className="opacity-60">
              <Trash2 aria-hidden />
              <span>Trash</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
