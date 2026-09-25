/**
 * The library's React Query cache: keys, and how an action changes each cached view before the
 * server answers (optimistic updates). Pure functions, so every view's rule is unit-tested.
 */
import type { LibraryDocument, LibraryPage, LibraryScope, LibraryView, TagView } from "@pc/schema";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";

export type LibraryData = InfiniteData<LibraryPage>;

export const libraryKeys = {
  all: ["library"] as const,
  view: (scope: LibraryScope, view: LibraryView) => ["library", scope, view] as const,
  sidebar: (workspaceId: string) => ["sidebar", workspaceId] as const,
  storage: ["storage"] as const,
  search: (workspaceId: string, q: string) => ["search", workspaceId, q] as const,
};

/** The scope a cached library view was loaded for. */
export function scopeOfKey(key: QueryKey): LibraryScope | null {
  const scope = key[1];
  return typeof scope === "object" && scope !== null && "kind" in scope
    ? (scope as LibraryScope)
    : null;
}

/** What an action does to a document, as far as the library can tell before the server says. */
export type OptimisticChange =
  | { kind: "rename"; title: string }
  | { kind: "move"; folderId: string | null }
  | { kind: "trash" }
  | { kind: "restore" }
  | { kind: "purge" }
  | { kind: "favourite"; on: boolean }
  | { kind: "addTag"; tag: TagView }
  | { kind: "removeTag"; tagId: string }
  | { kind: "tagChanged"; tag: TagView }
  | { kind: "tagDeleted"; tagId: string };

/** The document after the change in this view, or null when it leaves the view. */
export function applyChange(
  scope: LibraryScope,
  item: LibraryDocument,
  change: OptimisticChange,
): LibraryDocument | null {
  const inTrash = scope.kind === "trash";
  switch (change.kind) {
    case "rename":
      return { ...item, title: change.title };
    case "move":
      if (scope.kind === "folder" && scope.folderId !== change.folderId) return null;
      return { ...item, folderId: change.folderId };
    case "trash":
      return inTrash ? item : null;
    case "restore":
    case "purge":
      return inTrash ? null : item;
    case "favourite":
      if (scope.kind === "favourites" && !change.on) return null;
      return { ...item, favourite: change.on };
    case "addTag":
      return item.tags.some((t) => t.id === change.tag.id)
        ? item
        : { ...item, tags: [...item.tags, change.tag] };
    case "removeTag":
    case "tagDeleted":
      if (scope.kind === "tag" && scope.tagId === change.tagId) return null;
      return { ...item, tags: item.tags.filter((t) => t.id !== change.tagId) };
    case "tagChanged":
      return { ...item, tags: item.tags.map((t) => (t.id === change.tag.id ? change.tag : t)) };
  }
}

/**
 * Applies a change to the listed documents in one cached view. Documents that leave the view are
 * removed and the view's total goes down with them.
 */
export function changeView(
  data: LibraryData,
  scope: LibraryScope,
  ids: ReadonlySet<string> | "all",
  change: OptimisticChange,
): LibraryData {
  let removed = 0;
  const pages = data.pages.map((page) => {
    const items: LibraryDocument[] = [];
    for (const item of page.items) {
      if (ids !== "all" && !ids.has(item.id)) {
        items.push(item);
        continue;
      }
      const next = applyChange(scope, item, change);
      if (next) items.push(next);
      else removed++;
    }
    return { ...page, items };
  });
  if (removed === 0 && pages.every((p, i) => p.items.length === data.pages[i]?.items.length)) {
    // Nothing left the view; still return new pages so changed items re-render.
    return { ...data, pages };
  }
  const [first, ...rest] = pages;
  if (!first) return { ...data, pages };
  return {
    ...data,
    pages: [
      { ...first, total: first.total === null ? null : Math.max(0, first.total - removed) },
      ...rest,
    ],
  };
}

export function itemsOf(data: LibraryData | undefined): LibraryDocument[] {
  return data ? data.pages.flatMap((p) => p.items) : [];
}
