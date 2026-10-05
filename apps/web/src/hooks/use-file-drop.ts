"use client";

import { useEffect, useState } from "react";

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

/**
 * Files dragged from the desktop anywhere onto the page. Returns whether files are over the
 * window (for an overlay) and hands dropped files to `onFiles`. Off while `enabled` is false.
 */
export function useFileDrop(enabled: boolean, onFiles: (files: File[]) => void): boolean {
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // dragenter/dragleave fire for every child crossed; count them to know when files leave.
    let depth = 0;
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setOver(true);
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const overWindow = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setOver(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) onFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overWindow);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overWindow);
      window.removeEventListener("drop", drop);
    };
  }, [enabled, onFiles]);

  return enabled && over;
}
