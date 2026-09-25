/** The folder tree, as pure functions over the flat list the sidebar loads. */
import type { FolderView } from "@pc/schema";

/** A folder's children (or the top level) in tree order. */
export function childrenOf(folders: readonly FolderView[], parentId: string | null): FolderView[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) =>
      a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : a.id < b.id ? -1 : 1,
    );
}

/** Folders in tree order with their depth (pickers, keyboard lists). */
export function flattenTree(
  folders: readonly FolderView[],
): { folder: FolderView; depth: number }[] {
  const out: { folder: FolderView; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childrenOf(folders, parentId)) {
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** The folder and every folder under it. */
export function descendantIds(folders: readonly FolderView[], folderId: string): Set<string> {
  const ids = new Set([folderId]);
  for (let grew = true; grew;) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Where a folder may move: anywhere except into itself or its own subfolders. */
export function moveTargets(
  folders: readonly FolderView[],
  folderId: string,
): { folder: FolderView; depth: number }[] {
  const excluded = descendantIds(folders, folderId);
  return flattenTree(folders).filter((entry) => !excluded.has(entry.folder.id));
}

/** The sibling right after a folder (its "before" position when it stays put), or null if last. */
export function nextSibling(folders: readonly FolderView[], folder: FolderView): string | null {
  const siblings = childrenOf(folders, folder.parentId);
  return siblings[siblings.findIndex((f) => f.id === folder.id) + 1]?.id ?? null;
}
