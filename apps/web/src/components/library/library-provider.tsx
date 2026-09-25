"use client";

import type { StorageView, WorkspaceSidebar, WorkspaceView } from "@pc/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { libraryApi } from "@/lib/library/api";
import { libraryKeys } from "@/lib/library/cache";
import {
  PREFERENCE_COOKIE_MAX_AGE,
  VIEW_MODE_COOKIE,
  type ViewMode,
} from "@/lib/library/constants";

import { LibraryContext, type LibraryContextValue } from "./library-context";
import { LibraryDnd } from "./library-dnd";

/**
 * Client state for the signed-in app: the React Query cache (seeded with what the server already
 * loaded), the workspace the sidebar shows, grid or list, and drag and drop.
 */
export function LibraryProvider({
  userId,
  workspaces,
  activeWorkspaceId,
  initialSidebar,
  initialStorage,
  initialViewMode,
  children,
}: {
  userId: string;
  workspaces: WorkspaceView[];
  activeWorkspaceId: string;
  initialSidebar: WorkspaceSidebar;
  initialStorage: StorageView | null;
  initialViewMode: ViewMode;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
      },
    });
    client.setQueryData(libraryKeys.sidebar(activeWorkspaceId), initialSidebar);
    if (initialStorage) client.setQueryData(libraryKeys.storage, initialStorage);
    return client;
  });
  const [active, setActive] = useState(activeWorkspaceId);
  const [viewMode, setViewModeState] = useState(initialViewMode);
  // A server refresh (after switching workspace) brings a new remembered workspace.
  const [lastActiveProp, setLastActiveProp] = useState(activeWorkspaceId);
  if (lastActiveProp !== activeWorkspaceId) {
    setLastActiveProp(activeWorkspaceId);
    setActive(activeWorkspaceId);
  }

  const value = useMemo<LibraryContextValue>(
    () => ({
      userId,
      workspaces,
      activeWorkspaceId: workspaces.some((w) => w.id === active) ? active : activeWorkspaceId,
      showWorkspace(workspaceId) {
        if (workspaceId === active) return;
        setActive(workspaceId);
        void libraryApi.setActiveWorkspace(workspaceId).catch(() => undefined);
      },
      viewMode,
      setViewMode(mode) {
        setViewModeState(mode);
        document.cookie = `${VIEW_MODE_COOKIE}=${mode}; path=/; max-age=${String(PREFERENCE_COOKIE_MAX_AGE)}; samesite=lax`;
      },
    }),
    [userId, workspaces, active, activeWorkspaceId, viewMode],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LibraryContext.Provider value={value}>
        <LibraryDnd>{children}</LibraryDnd>
      </LibraryContext.Provider>
    </QueryClientProvider>
  );
}
