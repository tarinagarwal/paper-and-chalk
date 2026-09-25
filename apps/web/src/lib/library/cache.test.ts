import type { LibraryDocument, LibraryScope } from "@pc/schema";
import { describe, expect, it } from "vitest";

import { applyChange, changeView, scopeOfKey, libraryKeys, type LibraryData } from "./cache";
import { formatShortDate, pagesLabel, trashCountdown } from "./format";

const WS = "0196b3a0-0000-7000-8000-000000000001";
const FOLDER = "0196b3a0-0000-7000-8000-0000000000f1";
const TAG = {
  id: "0196b3a0-0000-7000-8000-0000000000a1",
  workspaceId: WS,
  name: "Exam",
  color: "#c43e18",
};

function doc(id: string, overrides: Partial<LibraryDocument> = {}): LibraryDocument {
  return {
    id,
    workspaceId: WS,
    folderId: FOLDER,
    type: "notebook",
    title: id,
    pageCount: 1,
    bytes: 0,
    isShared: false,
    tags: [],
    owner: { id: "u", name: "U" },
    createdAt: "2026-09-25T10:00:00.000Z",
    updatedAt: "2026-09-25T10:00:00.000Z",
    deletedAt: null,
    lastOpenedAt: null,
    favourite: false,
    role: "owner",
    can: { edit: true, delete: true, restore: false, purge: false, duplicate: true },
    ...overrides,
  };
}

const home: LibraryScope = { kind: "home", workspaceId: WS };
const folder: LibraryScope = { kind: "folder", folderId: FOLDER };

describe("optimistic library changes", () => {
  it("moves documents out of a folder view but keeps them at home", () => {
    const d = doc("a");
    expect(applyChange(folder, d, { kind: "move", folderId: null })).toBeNull();
    expect(applyChange(folder, d, { kind: "move", folderId: FOLDER })?.folderId).toBe(FOLDER);
    expect(applyChange(home, d, { kind: "move", folderId: null })?.folderId).toBeNull();
  });

  it("takes trashed documents out of every view but the trash, and the reverse for restore", () => {
    const trash: LibraryScope = { kind: "trash", workspaceId: WS };
    expect(applyChange(home, doc("a"), { kind: "trash" })).toBeNull();
    expect(applyChange(trash, doc("a"), { kind: "restore" })).toBeNull();
    expect(applyChange(trash, doc("a"), { kind: "purge" })).toBeNull();
    expect(applyChange(home, doc("a"), { kind: "restore" })).not.toBeNull();
  });

  it("drops unfavourited documents from Favourites and untagged ones from the tag view", () => {
    const favourites: LibraryScope = { kind: "favourites" };
    const tagView: LibraryScope = { kind: "tag", tagId: TAG.id };
    const tagged = doc("a", { tags: [TAG], favourite: true });
    expect(applyChange(favourites, tagged, { kind: "favourite", on: false })).toBeNull();
    expect(applyChange(home, tagged, { kind: "favourite", on: false })?.favourite).toBe(false);
    expect(applyChange(tagView, tagged, { kind: "removeTag", tagId: TAG.id })).toBeNull();
    expect(applyChange(home, tagged, { kind: "removeTag", tagId: TAG.id })?.tags).toEqual([]);
    expect(applyChange(home, doc("b"), { kind: "addTag", tag: TAG })?.tags).toEqual([TAG]);
    const renamed = { ...TAG, name: "Finals" };
    expect(applyChange(home, tagged, { kind: "tagChanged", tag: renamed })?.tags).toEqual([
      renamed,
    ]);
  });

  it("updates only the listed documents and keeps the total in step", () => {
    const data: LibraryData = {
      pageParams: [null, "c1"],
      pages: [
        { items: [doc("a"), doc("b")], nextCursor: "c1", total: 3 },
        { items: [doc("c")], nextCursor: null, total: null },
      ],
    };
    const moved = changeView(data, folder, new Set(["a", "c"]), { kind: "move", folderId: null });
    expect(moved.pages.map((p) => p.items.map((i) => i.id))).toEqual([["b"], []]);
    expect(moved.pages[0]?.total).toBe(1);
    const renamed = changeView(data, folder, new Set(["b"]), { kind: "rename", title: "New" });
    expect(renamed.pages[0]?.items.map((i) => i.title)).toEqual(["a", "New"]);
    expect(renamed.pages[0]?.total).toBe(3);
  });

  it("reads the scope back from a cache key", () => {
    const key = libraryKeys.view(folder, {
      sort: "name",
      dir: "asc",
      filters: { types: [], owner: "anyone", tagIds: [], shared: "any" },
    });
    expect(scopeOfKey(key)).toEqual(folder);
    expect(scopeOfKey(libraryKeys.storage)).toBeNull();
  });
});

describe("library formatting", () => {
  const now = new Date("2026-09-25T15:00:00");

  it("formats dates relative to today", () => {
    expect(formatShortDate(new Date("2026-09-25T09:05:00").toISOString(), now)).toBe("09:05");
    expect(formatShortDate(new Date("2026-09-24T09:05:00").toISOString(), now)).toBe("Yesterday");
    expect(formatShortDate(new Date("2026-09-22T09:05:00").toISOString(), now)).toBe("Tuesday");
    expect(formatShortDate(new Date("2026-03-02T09:05:00").toISOString(), now)).toBe("2 Mar");
    expect(formatShortDate(new Date("2025-03-02T09:05:00").toISOString(), now)).toBe("2 Mar 2025");
  });

  it("counts pages and trash days", () => {
    expect(pagesLabel("notebook", 1)).toBe("1 page");
    expect(pagesLabel("pdf", 1200)).toBe("1,200 pages");
    expect(pagesLabel("canvas", 0)).toBe("Infinite canvas");
    expect(trashCountdown(new Date("2026-09-24T15:00:00").toISOString(), now)).toBe(
      "Deleted forever in 29 days",
    );
    expect(trashCountdown(new Date("2026-08-01T15:00:00").toISOString(), now)).toBe(
      "Deleted forever today",
    );
  });
});
