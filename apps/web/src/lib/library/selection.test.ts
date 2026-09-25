import { describe, expect, it } from "vitest";

import {
  boxSelect,
  clickItem,
  EMPTY_SELECTION,
  moveFocus,
  pruneSelection,
  selectAll,
  targetsFor,
  toggleFocused,
  type Selection,
} from "./selection";

const order = ["a", "b", "c", "d", "e"];
const ids = (s: Selection) => [...s.ids].sort();

describe("library selection", () => {
  it("selects one item on a plain click", () => {
    const s = clickItem(EMPTY_SELECTION, "c", {}, order);
    expect(ids(s)).toEqual(["c"]);
    expect(s).toMatchObject({ anchor: "c", focus: "c" });
    expect(ids(clickItem(s, "a", {}, order))).toEqual(["a"]);
  });

  it("toggles with cmd/ctrl and selects ranges with shift, from the anchor", () => {
    let s = clickItem(EMPTY_SELECTION, "b", {}, order);
    s = clickItem(s, "d", { shift: true }, order);
    expect(ids(s)).toEqual(["b", "c", "d"]);
    // Shift ranges always start at the anchor, both ways.
    s = clickItem(s, "a", { shift: true }, order);
    expect(ids(s)).toEqual(["a", "b"]);
    s = clickItem(s, "e", { toggle: true }, order);
    expect(ids(s)).toEqual(["a", "b", "e"]);
    s = clickItem(s, "a", { toggle: true }, order);
    expect(ids(s)).toEqual(["b", "e"]);
    // cmd+shift adds the range to what is selected.
    s = clickItem(s, "c", { shift: true, toggle: true }, order);
    expect(ids(s)).toEqual(["a", "b", "c", "e"]);
  });

  it("moves focus with the keyboard, extending with shift", () => {
    let s = clickItem(EMPTY_SELECTION, "b", {}, order);
    s = moveFocus(s, "c", {}, order);
    expect(ids(s)).toEqual(["c"]);
    s = moveFocus(s, "e", { shift: true }, order);
    expect(ids(s)).toEqual(["c", "d", "e"]);
    expect(s.focus).toBe("e");
    // ctrl+arrow moves focus only; space then toggles.
    s = moveFocus(s, "a", { toggle: true }, order);
    expect(ids(s)).toEqual(["c", "d", "e"]);
    s = toggleFocused(s);
    expect(ids(s)).toEqual(["a", "c", "d", "e"]);
  });

  it("selects all, box-selects, and prunes what left the view", () => {
    expect(ids(selectAll(order, null))).toEqual(order);
    const start = clickItem(EMPTY_SELECTION, "a", {}, order);
    expect(ids(boxSelect(start, ["c", "d"], false))).toEqual(["c", "d"]);
    expect(ids(boxSelect(start, ["c", "d"], true))).toEqual(["a", "c", "d"]);
    const pruned = pruneSelection(selectAll(order, "e"), ["a", "b"]);
    expect(ids(pruned)).toEqual(["a", "b"]);
    expect(pruned.focus).toBeNull();
  });

  it("acts on the whole selection only when the item is part of it", () => {
    const s = selectAll(["a", "b"], "a");
    expect(targetsFor(s, "a").sort()).toEqual(["a", "b"]);
    expect(targetsFor(s, "z")).toEqual(["z"]);
  });
});
