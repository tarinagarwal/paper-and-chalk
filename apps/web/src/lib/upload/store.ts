"use client";

import { MAX_UPLOAD_BYTES, resolveUploadMime, uploadKind } from "@pc/schema";
import { create } from "zustand";

import { browserUploadDeps } from "./browser";
import { UploadTask, type UploadDeps, type UploadSnapshot, type UploadTarget } from "./engine";

/** Files uploading at once; the rest wait their turn. */
export const FILE_CONCURRENCY = 2;

interface UploadStore {
  items: UploadSnapshot[];
  add: (files: readonly File[], target: UploadTarget) => string[];
  pause: (id: string) => void;
  resume: (id: string) => void;
  retry: (id: string) => void;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
  clearFinished: () => void;
}

const FINISHED = new Set(["done", "failed", "cancelled"]);
const ACTIVE = new Set(["hashing", "starting", "uploading", "finishing", "verifying"]);

/** Builds the store; the app uses the browser dependencies, tests pass fakes. */
export function createUploadStore(deps: UploadDeps = browserUploadDeps) {
  const tasks = new Map<string, UploadTask>();
  const waiting: string[] = [];
  let counter = 0;

  return create<UploadStore>()((set, get) => {
    const put = (snapshot: UploadSnapshot) => {
      set((state) => ({
        items: state.items.some((i) => i.id === snapshot.id)
          ? state.items.map((i) => (i.id === snapshot.id ? snapshot : i))
          : [...state.items, snapshot],
      }));
    };

    /** Starts queued uploads while there is room. */
    const pump = () => {
      const running = get().items.filter((i) => ACTIVE.has(i.state)).length;
      for (let slots = FILE_CONCURRENCY - running; slots > 0 && waiting.length > 0; slots--) {
        const task = tasks.get(waiting.shift() ?? "");
        if (task) void task.start().finally(pump);
      }
    };

    const refused = (file: File, id: string, error: string): UploadSnapshot => ({
      id,
      fileName: file.name,
      size: file.size,
      mime: null,
      state: "failed",
      hashedBytes: 0,
      uploadedBytes: 0,
      error,
      asset: null,
      duplicate: false,
    });

    return {
      items: [],

      add(files, target) {
        const ids: string[] = [];
        for (const file of files) {
          const id = `upload-${String(++counter)}`;
          ids.push(id);
          const mime = resolveUploadMime(file.name, file.type);
          if (!mime) {
            put(refused(file, id, "This type of file can't be uploaded."));
            continue;
          }
          const limit = MAX_UPLOAD_BYTES[uploadKind(mime)];
          if (file.size > limit) {
            put(
              refused(
                file,
                id,
                `Too large: the limit is ${String(Math.round(limit / 1024 / 1024))} MB.`,
              ),
            );
            continue;
          }
          if (file.size === 0) {
            put(refused(file, id, "This file is empty."));
            continue;
          }
          const task = new UploadTask(file, mime, target, deps, put, id);
          tasks.set(id, task);
          put(task.current);
          waiting.push(id);
        }
        pump();
        return ids;
      },

      pause(id) {
        tasks.get(id)?.pause();
      },
      resume(id) {
        const task = tasks.get(id);
        if (task) void task.resume().finally(pump);
      },
      retry(id) {
        const task = tasks.get(id);
        if (task) void task.retry().finally(pump);
      },
      cancel(id) {
        const task = tasks.get(id);
        const queued = waiting.indexOf(id);
        if (queued >= 0) waiting.splice(queued, 1);
        if (task) void task.cancel().finally(pump);
      },
      dismiss(id) {
        const item = get().items.find((i) => i.id === id);
        if (item && !FINISHED.has(item.state)) return;
        tasks.delete(id);
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
      },
      clearFinished() {
        for (const item of get().items) if (FINISHED.has(item.state)) tasks.delete(item.id);
        set((state) => ({ items: state.items.filter((i) => !FINISHED.has(i.state)) }));
      },
    };
  });
}

/** The app-wide upload queue shown in the tray. */
export const useUploadStore = createUploadStore();
