"use client";

import type { WorkspaceSidebar } from "@pc/schema";
import { useQuery } from "@tanstack/react-query";

import { libraryApi } from "@/lib/library/api";
import { libraryKeys } from "@/lib/library/cache";

const EMPTY_SIDEBAR: WorkspaceSidebar = { folders: [], tags: [], smartFolders: [] };

/** Folders, tags and smart folders of a workspace (null = not needed yet). */
export function useSidebarData(workspaceId: string | null) {
  const query = useQuery({
    queryKey: libraryKeys.sidebar(workspaceId ?? "none"),
    queryFn: () => libraryApi.sidebar(workspaceId ?? ""),
    enabled: workspaceId !== null,
    staleTime: 60_000,
  });
  return { ...query, sidebar: query.data ?? EMPTY_SIDEBAR };
}

export function useStorageData() {
  return useQuery({
    queryKey: libraryKeys.storage,
    queryFn: libraryApi.storage,
    staleTime: 60_000,
  });
}
