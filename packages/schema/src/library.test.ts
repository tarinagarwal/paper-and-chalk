import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  bulkActionSchema,
  EMPTY_FILTERS,
  libraryQueryFromParams,
  libraryQueryToParams,
  sortsFor,
  viewFromParams,
  viewToParams,
  type LibraryQuery,
} from "./library";

const ws = "0196b3a0-0000-7000-8000-000000000001";
const tagA = "0196b3a0-0000-7000-8000-00000000000a";
const tagB = "0196b3a0-0000-7000-8000-00000000000b";

describe("library view parameters", () => {
  it("leaves defaults out of the URL", () => {
    const params = viewToParams({ sort: "modified", dir: "desc", filters: EMPTY_FILTERS }, "home");
    expect(params.toString()).toBe("");
  });

  it("round-trips every sort, direction and filter", () => {
    const view = {
      sort: "name" as const,
      dir: "desc" as const,
      filters: {
        types: ["pdf" as const, "canvas" as const],
        owner: "others" as const,
        tagIds: [tagA, tagB],
        shared: "shared" as const,
      },
    };
    const params = viewToParams(view, "home");
    expect(params.get("sort")).toBe("name");
    expect(params.get("types")).toBe("pdf,canvas");
    expect(viewFromParams(params, "home")).toEqual(view);
  });

  it("falls back to defaults for anything malformed", () => {
    const params = new URLSearchParams(
      "sort=bogus&dir=sideways&types=pdf,poster,pdf&owner=him&tags=nope," + tagA + "&shared=x",
    );
    expect(viewFromParams(params, "home")).toEqual({
      sort: "modified",
      dir: "desc",
      filters: { types: ["pdf"], owner: "anyone", tagIds: [tagA], shared: "any" },
    });
  });

  it("opens recents by last opened and search by relevance, in their only direction", () => {
    expect(viewFromParams(new URLSearchParams(), "recents").sort).toBe("lastOpened");
    expect(viewFromParams(new URLSearchParams("dir=asc"), "search")).toMatchObject({
      sort: "relevance",
      dir: "desc",
    });
    // Relevance means nothing outside search.
    expect(viewFromParams(new URLSearchParams("sort=relevance"), "home").sort).toBe("modified");
    expect(sortsFor("home")).not.toContain("relevance");
    expect(sortsFor("search")).toContain("relevance");
  });

  it("counts active filters", () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ types: ["pdf"], owner: "me", tagIds: [tagA], shared: "private" }),
    ).toBe(4);
  });
});

describe("library API query", () => {
  it("round-trips a folder query with a cursor", () => {
    const query: LibraryQuery = {
      scope: { kind: "folder", folderId: tagA },
      sort: "size",
      dir: "asc",
      filters: { ...EMPTY_FILTERS, types: ["notebook"] },
      cursor: "abc",
      limit: 20,
    };
    expect(libraryQueryFromParams(libraryQueryToParams(query))).toEqual(query);
  });

  it("round-trips search and workspace scopes", () => {
    for (const scope of [
      { kind: "search", workspaceId: ws, q: "lecture 7" },
      { kind: "home", workspaceId: ws },
      { kind: "trash", workspaceId: ws },
      { kind: "recents" },
      { kind: "shared" },
    ] as const) {
      const parsed = libraryQueryFromParams(
        libraryQueryToParams({
          scope,
          sort: scope.kind === "search" ? "relevance" : "modified",
          dir: "desc",
          filters: EMPTY_FILTERS,
          cursor: null,
          limit: 60,
        }),
      );
      expect(parsed.scope).toEqual(scope);
    }
  });

  it("rejects a scope without its id", () => {
    expect(() => libraryQueryFromParams(new URLSearchParams("scope=folder"))).toThrow();
    expect(() => libraryQueryFromParams(new URLSearchParams("scope=everything"))).toThrow();
  });
});

describe("bulk actions", () => {
  it("accepts each action with its fields and refuses empty or oversized id lists", () => {
    expect(bulkActionSchema.parse({ action: "move", ids: [tagA], folderId: null })).toEqual({
      action: "move",
      ids: [tagA],
      folderId: null,
    });
    expect(bulkActionSchema.safeParse({ action: "trash", ids: [] }).success).toBe(false);
    expect(
      bulkActionSchema.safeParse({ action: "trash", ids: Array.from({ length: 501 }, () => tagA) })
        .success,
    ).toBe(false);
    expect(bulkActionSchema.safeParse({ action: "addTag", ids: [tagA] }).success).toBe(false);
  });
});
