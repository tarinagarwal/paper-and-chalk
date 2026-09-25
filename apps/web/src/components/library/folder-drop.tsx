"use client";

import { useDroppable } from "@dnd-kit/core";

import type { DropData } from "./library-dnd";

/**
 * A drop target for dragged documents and folders: [ref callback, whether something is over it].
 * A tuple, so callers never hold an object with a ref in it (the React Compiler lint reads any
 * property of such an object as a ref access during render).
 */
export function useDropTarget(
  id: string,
  data: DropData,
  disabled = false,
): [(element: HTMLElement | null) => void, boolean] {
  const { setNodeRef, isOver, active } = useDroppable({ id, data, disabled });
  return [setNodeRef, isOver && active !== null];
}
