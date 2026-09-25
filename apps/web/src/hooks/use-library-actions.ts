"use client";

import {
  MAX_BULK_IDS,
  type BulkAction,
  type BulkResult,
  type LibraryDocument,
  type TagView,
} from "@pc/schema";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { libraryApi, LibraryRequestError } from "@/lib/library/api";
import {
  changeView,
  libraryKeys,
  scopeOfKey,
  type LibraryData,
  type OptimisticChange,
} from "@/lib/library/cache";
import { countLabel } from "@/lib/library/format";

type Snapshot = [readonly unknown[], LibraryData | undefined][];

const messageOf = (error: unknown) =>
  error instanceof LibraryRequestError || error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Document actions for the library. Each one updates every cached view at once (optimistic),
 * then asks the server; on failure the views roll back and a toast says why. Views not on screen
 * are marked stale so they reload next time they are shown.
 */
export function useLibraryActions() {
  const qc = useQueryClient();

  function snapshot(): Snapshot {
    return qc.getQueriesData<LibraryData>({ queryKey: libraryKeys.all });
  }

  function rollback(snap: Snapshot) {
    for (const [key, data] of snap) qc.setQueryData(key, data);
  }

  function apply(ids: ReadonlySet<string> | "all", change: OptimisticChange) {
    for (const [key, data] of qc.getQueriesData<LibraryData>({ queryKey: libraryKeys.all })) {
      const scope = scopeOfKey(key);
      if (data && scope) qc.setQueryData<LibraryData>(key, changeView(data, scope, ids, change));
    }
  }

  function markStale() {
    void qc.invalidateQueries({ queryKey: libraryKeys.all, refetchType: "none" });
  }

  /** Runs a bulk action with an optimistic change; returns the ids that worked. */
  async function bulk(
    action: BulkAction,
    change: OptimisticChange | null,
    describe: { done: (count: number) => string; failed: string },
    undo?: () => void,
  ): Promise<string[]> {
    await qc.cancelQueries({ queryKey: libraryKeys.all });
    const snap = snapshot();
    if (change) apply(new Set(action.ids), change);
    const result: BulkResult = { done: [], failed: [] };
    try {
      for (const ids of chunks(action.ids, MAX_BULK_IDS)) {
        const part = await libraryApi.bulk({ ...action, ids });
        result.done.push(...part.done);
        result.failed.push(...part.failed);
      }
    } catch (error) {
      rollback(snap);
      toast.error(`${describe.failed}. ${messageOf(error)}`);
      return result.done;
    }
    if (result.failed.length > 0) {
      // Keep the change only where it worked.
      rollback(snap);
      if (change && result.done.length > 0) apply(new Set(result.done), change);
      const first = result.failed[0];
      toast.error(
        `${describe.failed}: ${countLabel(result.failed.length)}. ${first ? first.message : ""}`.trim(),
      );
    } else {
      toast.success(
        describe.done(result.done.length),
        undo ? { action: { label: "Undo", onClick: undo } } : undefined,
      );
    }
    markStale();
    return result.done;
  }

  const actions = {
    async rename(item: LibraryDocument, title: string) {
      const trimmed = title.trim();
      if (!trimmed || trimmed === item.title) return;
      await qc.cancelQueries({ queryKey: libraryKeys.all });
      const snap = snapshot();
      apply(new Set([item.id]), { kind: "rename", title: trimmed });
      try {
        await libraryApi.rename(item.id, trimmed);
        markStale();
      } catch (error) {
        rollback(snap);
        toast.error(`Couldn't rename. ${messageOf(error)}`);
      }
    },

    move(ids: string[], folderId: string | null, destination: string) {
      return bulk(
        { action: "move", ids, folderId },
        { kind: "move", folderId },
        { done: (n) => `Moved ${countLabel(n)} to ${destination}`, failed: "Couldn't move" },
      );
    },

    trash(ids: string[]) {
      return bulk(
        { action: "trash", ids },
        { kind: "trash" },
        {
          done: (n) => `Moved ${countLabel(n)} to the trash`,
          failed: "Couldn't move to the trash",
        },
        () => void actions.restore(ids),
      );
    },

    restore(ids: string[]) {
      return bulk(
        { action: "restore", ids },
        { kind: "restore" },
        { done: (n) => `Restored ${countLabel(n)}`, failed: "Couldn't restore" },
      );
    },

    async purge(ids: string[]) {
      const done = await bulk(
        { action: "purge", ids },
        { kind: "purge" },
        { done: (n) => `Deleted ${countLabel(n)} forever`, failed: "Couldn't delete" },
      );
      void qc.invalidateQueries({ queryKey: libraryKeys.storage });
      return done;
    },

    favourite(ids: string[], on: boolean) {
      return bulk(
        { action: "favourite", ids, on },
        { kind: "favourite", on },
        {
          done: (n) =>
            on
              ? `Added ${countLabel(n)} to favourites`
              : `Removed ${countLabel(n)} from favourites`,
          failed: "Couldn't change favourites",
        },
      );
    },

    addTag(ids: string[], tag: TagView) {
      return bulk(
        { action: "addTag", ids, tagId: tag.id },
        { kind: "addTag", tag },
        { done: (n) => `Tagged ${countLabel(n)} “${tag.name}”`, failed: "Couldn't add the tag" },
      );
    },

    removeTag(ids: string[], tag: TagView) {
      return bulk(
        { action: "removeTag", ids, tagId: tag.id },
        { kind: "removeTag", tagId: tag.id },
        {
          done: (n) => `Removed “${tag.name}” from ${countLabel(n)}`,
          failed: "Couldn't remove the tag",
        },
      );
    },

    async duplicate(item: LibraryDocument) {
      try {
        const copy = await libraryApi.duplicate(item.id);
        // Refetch what is on screen so the copy shows up in place; the rest reloads when shown.
        await qc.invalidateQueries({ queryKey: libraryKeys.all });
        toast.success(
          copy.workspaceId === item.workspaceId
            ? `Made “${copy.title}”`
            : `Made “${copy.title}” in your personal workspace`,
        );
      } catch (error) {
        toast.error(`Couldn't duplicate. ${messageOf(error)}`);
      }
    },

    /** Records the open (Recents). The editor comes later; until then a note says so. */
    async open(item: LibraryDocument) {
      try {
        await libraryApi.open(item.id);
        markStale();
        toast(`Opening “${item.title}”`, {
          description: "Documents open in the editor, which is on its way. Added to Recents.",
        });
      } catch (error) {
        toast.error(`Couldn't open. ${messageOf(error)}`);
      }
    },

    /** A tag was renamed or recoloured: show it everywhere at once. */
    tagChanged(tag: TagView) {
      apply("all", { kind: "tagChanged", tag });
    },

    tagDeleted(tagId: string) {
      apply("all", { kind: "tagDeleted", tagId });
      markStale();
    },

    markStale,
  };
  return actions;
}

export type LibraryActions = ReturnType<typeof useLibraryActions>;
