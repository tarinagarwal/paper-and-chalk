"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { WorkspaceSidebar } from "@pc/schema";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Folder } from "lucide-react";
import { useState } from "react";

import { useLibraryActions } from "@/hooks/use-library-actions";
import { useSidebarActions } from "@/hooks/use-sidebar-actions";
import { libraryKeys } from "@/lib/library/cache";
import { descendantIds } from "@/lib/library/folders";

import { useLibrary } from "./library-context";

/** What is being dragged. */
export type DragData =
  | { type: "documents"; ids: string[]; label: string; workspaceId: string }
  | { type: "folder"; folderId: string; label: string; workspaceId: string };

/** Where it can be dropped. */
export type DropData =
  /** Into a folder (documents move there; a folder nests inside). */
  | { type: "folder"; folderId: string; workspaceId: string; label: string }
  /** Home: the top level of the workspace. */
  | { type: "root"; workspaceId: string }
  | { type: "trash" }
  /** Between folders in the tree: reorder. */
  | { type: "gap"; workspaceId: string; parentId: string | null; beforeId: string | null };

/** True when `folderId` is `of` or inside it (a folder can't move into its own subtree). */
function isDescendant(sidebar: WorkspaceSidebar | undefined, folderId: string, of: string) {
  return descendantIds(sidebar?.folders ?? [], of).has(folderId);
}

/**
 * Drag and drop across the library: documents onto sidebar folders, Home (top level) or Trash;
 * folders within the tree to reorder or nest. Mouse drags start after 6 px so clicks and box
 * selection still work; touch drags start on a long press so scrolling still works.
 */
export function LibraryDnd({ children }: { children: React.ReactNode }) {
  const { activeWorkspaceId } = useLibrary();
  const qc = useQueryClient();
  const documents = useLibraryActions();
  const folders = useSidebarActions(activeWorkspaceId);
  const [dragging, setDragging] = useState<DragData | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  function onDragStart(event: DragStartEvent) {
    setDragging((event.active.data.current as DragData | undefined) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const drag = event.active.data.current as DragData | undefined;
    const drop = event.over?.data.current as DropData | undefined;
    if (!drag || !drop) return;
    const sameWorkspace = (id: string) => id === drag.workspaceId;

    if (drag.type === "documents") {
      if (drop.type === "trash") void documents.trash(drag.ids);
      else if (drop.type === "folder" && sameWorkspace(drop.workspaceId)) {
        void documents.move(drag.ids, drop.folderId, drop.label);
      } else if (drop.type === "root" && sameWorkspace(drop.workspaceId)) {
        void documents.move(drag.ids, null, "the top level");
      }
      return;
    }

    const sidebar = qc.getQueryData<WorkspaceSidebar>(libraryKeys.sidebar(drag.workspaceId));
    if (drop.type === "folder" && sameWorkspace(drop.workspaceId)) {
      if (!isDescendant(sidebar, drop.folderId, drag.folderId)) {
        void folders.moveFolder(drag.folderId, drop.folderId, null);
      }
    } else if (drop.type === "gap" && sameWorkspace(drop.workspaceId)) {
      const intoSelf =
        drop.parentId !== null && isDescendant(sidebar, drop.parentId, drag.folderId);
      if (!intoSelf && drop.beforeId !== drag.folderId) {
        void folders.moveFolder(drag.folderId, drop.parentId, drop.beforeId);
      }
    } else if (drop.type === "root" && sameWorkspace(drop.workspaceId)) {
      void folders.moveFolder(drag.folderId, null, null);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
      }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="pointer-events-none flex w-max items-center gap-2 rounded-lg border bg-popover px-3 py-2 text-sm font-medium shadow-popover">
            {dragging.type === "folder" ? (
              <Folder aria-hidden className="size-4 text-muted-foreground" />
            ) : (
              <FileText aria-hidden className="size-4 text-muted-foreground" />
            )}
            {dragging.label}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
