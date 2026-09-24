import { describe, expect, it } from "vitest";

import { compareByOrder, keyBetween, keysBetween, sortByOrder } from "./order";
import { fractionalIndexSchema } from "./primitives";

describe("fractional ordering", () => {
  it("creates keys at the start, end and between neighbours", () => {
    const first = keyBetween(null, null);
    const after = keyBetween(first, null);
    const before = keyBetween(null, first);
    const middle = keyBetween(first, after);
    expect([before, first, middle, after].sort()).toEqual([before, first, middle, after]);
  });

  it("keeps inserting between the same pair indefinitely", () => {
    let low = keyBetween(null, null);
    const high = keyBetween(low, null);
    for (let i = 0; i < 200; i++) {
      const next = keyBetween(low, high);
      expect(next > low && next < high).toBe(true);
      low = next;
    }
  });

  it("spreads N keys in order", () => {
    const keys = keysBetween("a0", "a1", 5);
    expect(keys).toHaveLength(5);
    expect([...keys].sort()).toEqual(keys);
    expect(keys.every((k) => k > "a0" && k < "a1")).toBe(true);
  });

  it("produces keys the element schema accepts", () => {
    for (const key of keysBetween(null, null, 20)) {
      expect(fractionalIndexSchema.safeParse(key).success).toBe(true);
    }
  });

  it("breaks ties by id so every client agrees", () => {
    const items = [
      { orderKey: "a1", id: "c" },
      { orderKey: "a0", id: "z" },
      { orderKey: "a1", id: "a" },
    ];
    expect(sortByOrder(items).map((i) => i.id)).toEqual(["z", "a", "c"]);
    const same = { orderKey: "a0", id: "x" };
    expect(compareByOrder(same, { ...same })).toBe(0);
  });

  it("rejects keys in the wrong order", () => {
    expect(() => keyBetween("a1", "a0")).toThrow();
  });
});
