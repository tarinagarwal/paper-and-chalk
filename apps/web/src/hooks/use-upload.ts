"use client";

import { useShallow } from "zustand/react/shallow";

import { useUploadStore } from "@/lib/upload/store";

/**
 * Upload files from anywhere in the app. Uploads run in the global queue (so they survive
 * navigation) and show in the upload tray. Returns the ids of the queued uploads.
 */
export function useUpload() {
  return useUploadStore(
    useShallow((store) => ({
      uploads: store.items,
      upload: store.add,
      pause: store.pause,
      resume: store.resume,
      retry: store.retry,
      cancel: store.cancel,
      dismiss: store.dismiss,
      clearFinished: store.clearFinished,
    })),
  );
}
