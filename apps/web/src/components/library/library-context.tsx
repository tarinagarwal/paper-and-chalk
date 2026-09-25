"use client";

import type { WorkspaceView } from "@pc/schema";
import { createContext, useContext } from "react";

import type { ViewMode } from "@/lib/library/constants";

export interface LibraryContextValue {
  userId: string;
  workspaces: WorkspaceView[];
  /** The workspace the sidebar shows (and where new things go). */
  activeWorkspaceId: string;
  /** Shows this workspace in the sidebar and remembers it for the next visit. */
  showWorkspace: (workspaceId: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const LibraryContext = createContext<LibraryContextValue | null>(null);

export function useLibrary(): LibraryContextValue {
  const value = useContext(LibraryContext);
  if (!value) throw new Error("useLibrary needs a LibraryProvider");
  return value;
}

export function useActiveWorkspace(): WorkspaceView {
  const { workspaces, activeWorkspaceId } = useLibrary();
  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];
  if (!active) throw new Error("no workspace");
  return active;
}
