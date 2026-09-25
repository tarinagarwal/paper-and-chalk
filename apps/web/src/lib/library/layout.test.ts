import { describe, expect, it } from "vitest";

import { gridLayout, itemsInRect, listLayout, navigate, normaliseRect, rowCount } from "./layout";

describe("library layout", () => {
  it("fits as many columns as the width allows, at least one", () => {
    expect(gridLayout(250).columns).toBe(1);
    // Phones: two smaller cards side by side.
    expect(gridLayout(300).columns).toBe(2);
    expect(gridLayout(600).columns).toBe(3);
    const wide = gridLayout(1200);
    expect(wide.columns).toBe(5);
    // Cards and gaps fill the width exactly.
    expect(wide.cardWidth * wide.columns + wide.gap * (wide.columns - 1)).toBeCloseTo(1200);
    expect(wide.rowHeight).toBe(wide.cardHeight + wide.gap);
    expect(rowCount(wide, 11)).toBe(3);
    expect(rowCount(listLayout, 11)).toBe(11);
  });

  it("navigates a grid with arrows, Home, End and pages", () => {
    // 4 columns, 10 items: rows [0-3] [4-7] [8-9].
    const go = (key: Parameters<typeof navigate>[0], from: number) => navigate(key, from, 10, 4, 2);
    expect(go("ArrowRight", 3)).toBe(4);
    expect(go("ArrowLeft", 0)).toBe(0);
    expect(go("ArrowDown", 1)).toBe(5);
    expect(go("ArrowDown", 6)).toBe(9); // above the short last row: to the last item
    expect(go("ArrowDown", 9)).toBe(9);
    expect(go("ArrowUp", 5)).toBe(1);
    expect(go("ArrowUp", 2)).toBe(2);
    expect(go("Home", 7)).toBe(0);
    expect(go("End", 0)).toBe(9);
    expect(go("PageDown", 0)).toBe(8);
    expect(go("PageUp", 9)).toBe(1);
    // Nothing focused yet: the first key lands on the first (or, for End, last) item.
    expect(go("ArrowDown", -1)).toBe(0);
    expect(go("End", -1)).toBe(9);
    expect(navigate("ArrowDown", 0, 0, 4, 2)).toBe(-1);
  });

  it("finds what a selection box touches in the grid", () => {
    const layout = gridLayout(820); // 4 columns of 190, gaps of 20
    expect(layout.columns).toBe(4);
    const { cardWidth, rowHeight } = layout;
    // A box over the gap between the first two cards touches neither.
    expect(
      itemsInRect(normaliseRect(cardWidth + 2, 10, cardWidth + 18, 40), layout, 820, 10),
    ).toEqual([]);
    // From the middle of card 1 down-right into card 6 (second row, third column).
    const box = normaliseRect(cardWidth * 1.5 + 20, rowHeight + 10, cardWidth / 2, 10);
    expect(itemsInRect(box, layout, 820, 10)).toEqual([0, 1, 4, 5]);
    // Past the last item there is nothing to hit.
    expect(
      itemsInRect(normaliseRect(0, rowHeight * 2 + 5, 820, rowHeight * 5), layout, 820, 10),
    ).toEqual([8, 9]);
  });

  it("finds rows a selection box touches in the list", () => {
    expect(itemsInRect(normaliseRect(10, 60, 200, 5), listLayout, 900, 100)).toEqual([0, 1]);
    expect(itemsInRect(normaliseRect(10, -50, 200, -5), listLayout, 900, 100)).toEqual([]);
  });
});
