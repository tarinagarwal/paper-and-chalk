import type { FolderView } from "@pc/schema";
import { describe, expect, it } from "vitest";

import { childrenOf, descendantIds, flattenTree, moveTargets, nextSibling } from "./folders";

const WS = "0196b3a0-0000-7000-8000-000000000001";
const folder = (id: string, parentId: string | null, orderKey: string): FolderView => ({
  id,
  workspaceId: WS,
  parentId,
  name: id,
  color: null,
  icon: null,
  orderKey,
});

// maths (a0) > [algebra (a0) > linear (a0)], [geometry (a1)]; physics (a1); art (Zz, sorts first)
const tree = [
  folder("physics", null, "a1"),
  folder("maths", null, "a0"),
  folder("geometry", "maths", "a1"),
  folder("algebra", "maths", "a0"),
  folder("linear", "algebra", "a0"),
  folder("art", null, "Zz"),
];

describe("folder tree", () => {
  it("orders siblings by order key and flattens the tree depth first", () => {
    expect(childrenOf(tree, null).map((f) => f.id)).toEqual(["art", "maths", "physics"]);
    expect(flattenTree(tree).map((e) => `${"-".repeat(e.depth)}${e.folder.id}`)).toEqual([
      "art",
      "maths",
      "-algebra",
      "--linear",
      "-geometry",
      "physics",
    ]);
  });

  it("never offers a folder itself or its subfolders as a place to move it", () => {
    expect([...descendantIds(tree, "maths")].sort()).toEqual([
      "algebra",
      "geometry",
      "linear",
      "maths",
    ]);
    expect(moveTargets(tree, "maths").map((e) => e.folder.id)).toEqual(["art", "physics"]);
    expect(moveTargets(tree, "linear").map((e) => e.folder.id)).toEqual([
      "art",
      "maths",
      "algebra",
      "geometry",
      "physics",
    ]);
  });

  it("finds the sibling after a folder, or none when it is last", () => {
    const find = (id: string) => {
      const found = tree.find((f) => f.id === id);
      if (!found) throw new Error(id);
      return found;
    };
    expect(nextSibling(tree, find("algebra"))).toBe("geometry");
    expect(nextSibling(tree, find("physics"))).toBeNull();
  });
});
