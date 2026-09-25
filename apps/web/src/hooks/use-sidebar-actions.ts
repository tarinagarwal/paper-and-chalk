"use client";

import {
  keyBetween,
  type FolderIcon,
  type FolderView,
  type LibraryView,
  type SmartFolderView,
  type TagView,
  type WorkspaceSidebar,
} from "@pc/schema";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useLibraryActions } from "@/hooks/use-library-actions";
import { libraryApi } from "@/lib/library/api";
import { libraryKeys } from "@/lib/library/cache";
import { countLabel } from "@/lib/library/format";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Try again.";

/** Siblings of a folder in tree order. */
export function childrenOf(folders: readonly FolderView[], parentId: string | null): FolderView[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) =>
      a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : a.id < b.id ? -1 : 1,
    );
}

/**
 * Folder, tag and smart-folder changes for one workspace's sidebar. Renames, colours, moves and
 * deletes show at once and roll back on failure; creations wait for the server's id.
 */
export function useSidebarActions(workspaceId: string) {
  const qc = useQueryClient();
  const library = useLibraryActions();
  const key = libraryKeys.sidebar(workspaceId);

  async function optimistic(
    change: (sidebar: WorkspaceSidebar) => WorkspaceSidebar,
    run: () => Promise<unknown>,
    failed: string,
  ): Promise<boolean> {
    await qc.cancelQueries({ queryKey: key });
    const before = qc.getQueryData<WorkspaceSidebar>(key);
    if (before) qc.setQueryData(key, change(before));
    try {
      await run();
      return true;
    } catch (error) {
      qc.setQueryData(key, before);
      toast.error(`${failed}. ${messageOf(error)}`);
      return false;
    } finally {
      void qc.invalidateQueries({ queryKey: key });
    }
  }

  const mapFolders = (fn: (f: FolderView) => FolderView) => (s: WorkspaceSidebar) => ({
    ...s,
    folders: s.folders.map(fn),
  });

  return {
    async createFolder(input: {
      parentId: string | null;
      name: string;
      color: string | null;
      icon: FolderIcon | null;
    }): Promise<FolderView | null> {
      try {
        const { folder } = await libraryApi.createFolder({ workspaceId, ...input });
        qc.setQueryData<WorkspaceSidebar>(key, (s) =>
          s ? { ...s, folders: [...s.folders, folder] } : s,
        );
        void qc.invalidateQueries({ queryKey: key });
        return folder;
      } catch (error) {
        toast.error(`Couldn't create the folder. ${messageOf(error)}`);
        return null;
      }
    },

    updateFolder(
      id: string,
      input: { name?: string; color?: string | null; icon?: FolderIcon | null },
    ) {
      return optimistic(
        mapFolders((f) => (f.id === id ? { ...f, ...input } : f)),
        () => libraryApi.updateFolder(id, input),
        "Couldn't change the folder",
      );
    },

    /** Puts a folder under `parentId`, before the sibling `beforeId` (or last). */
    moveFolder(id: string, parentId: string | null, beforeId: string | null) {
      return optimistic(
        (s) => {
          const siblings = childrenOf(s.folders, parentId).filter((f) => f.id !== id);
          const at = beforeId ? siblings.findIndex((f) => f.id === beforeId) : siblings.length;
          const index = at < 0 ? siblings.length : at;
          const orderKey = keyBetween(
            siblings[index - 1]?.orderKey ?? null,
            siblings[index]?.orderKey ?? null,
          );
          return mapFolders((f) => (f.id === id ? { ...f, parentId, orderKey } : f))(s);
        },
        () => libraryApi.moveFolder(id, parentId, beforeId),
        "Couldn't move the folder",
      );
    },

    async trashFolder(folder: FolderView) {
      const descendants = new Set([folder.id]);
      const all = qc.getQueryData<WorkspaceSidebar>(key)?.folders ?? [];
      for (let grew = true; grew;) {
        grew = false;
        for (const f of all) {
          if (f.parentId && descendants.has(f.parentId) && !descendants.has(f.id)) {
            descendants.add(f.id);
            grew = true;
          }
        }
      }
      let moved = { folders: 0, documents: 0 };
      const ok = await optimistic(
        (s) => ({ ...s, folders: s.folders.filter((f) => !descendants.has(f.id)) }),
        async () => {
          moved = await libraryApi.trashFolder(folder.id);
        },
        "Couldn't delete the folder",
      );
      if (ok) {
        library.markStale();
        void qc.invalidateQueries({ queryKey: libraryKeys.all });
        toast.success(
          `Moved “${folder.name}” to the trash` +
            (moved.documents > 0 ? ` with ${countLabel(moved.documents)}` : ""),
        );
      }
      return ok;
    },

    async createTag(input: { name: string; color: string }): Promise<TagView | null> {
      try {
        const { tag } = await libraryApi.createTag({ workspaceId, ...input });
        qc.setQueryData<WorkspaceSidebar>(key, (s) => (s ? { ...s, tags: [...s.tags, tag] } : s));
        void qc.invalidateQueries({ queryKey: key });
        return tag;
      } catch (error) {
        toast.error(`Couldn't create the tag. ${messageOf(error)}`);
        return null;
      }
    },

    async updateTag(tag: TagView, input: { name?: string; color?: string }) {
      const next = { ...tag, ...input };
      const ok = await optimistic(
        (s) => ({ ...s, tags: s.tags.map((t) => (t.id === tag.id ? next : t)) }),
        () => libraryApi.updateTag(tag.id, input),
        "Couldn't change the tag",
      );
      if (ok) library.tagChanged(next);
      return ok;
    },

    async deleteTag(tag: TagView) {
      const ok = await optimistic(
        (s) => ({ ...s, tags: s.tags.filter((t) => t.id !== tag.id) }),
        () => libraryApi.deleteTag(tag.id),
        "Couldn't delete the tag",
      );
      if (ok) {
        library.tagDeleted(tag.id);
        toast.success(`Deleted the tag “${tag.name}”`);
      }
      return ok;
    },

    async createSmartFolder(name: string, view: LibraryView): Promise<SmartFolderView | null> {
      try {
        const { smartFolder } = await libraryApi.createSmartFolder({ workspaceId, name, ...view });
        qc.setQueryData<WorkspaceSidebar>(key, (s) =>
          s ? { ...s, smartFolders: [...s.smartFolders, smartFolder] } : s,
        );
        void qc.invalidateQueries({ queryKey: key });
        toast.success(`Saved the smart folder “${smartFolder.name}”`);
        return smartFolder;
      } catch (error) {
        toast.error(`Couldn't save the smart folder. ${messageOf(error)}`);
        return null;
      }
    },

    updateSmartFolder(id: string, input: Partial<LibraryView> & { name?: string }) {
      return optimistic(
        (s) => ({
          ...s,
          smartFolders: s.smartFolders.map((f) => (f.id === id ? { ...f, ...input } : f)),
        }),
        () => libraryApi.updateSmartFolder(id, input),
        "Couldn't save the smart folder",
      );
    },

    deleteSmartFolder(id: string) {
      return optimistic(
        (s) => ({ ...s, smartFolders: s.smartFolders.filter((f) => f.id !== id) }),
        () => libraryApi.deleteSmartFolder(id),
        "Couldn't delete the smart folder",
      );
    },
  };
}

export type SidebarActions = ReturnType<typeof useSidebarActions>;
