import { describe, expect, it } from "vitest";

import { normaliseForSearch, titleSortKey, trigrams, trigramSimilarity } from "./search";

describe("title search", () => {
  it("normalises case, accents and punctuation", () => {
    expect(normaliseForSearch("  Café—Notes: Q3!  ")).toBe("cafe notes q3");
  });

  it("builds padded word trigrams like pg_trgm", () => {
    expect(trigrams("Cat").sort()).toEqual(["  c", " ca", "at ", "cat"].sort());
  });

  it("is empty for text with no letters or digits", () => {
    expect(trigrams("—  !!")).toEqual([]);
  });

  it("ranks close titles above unrelated ones, tolerating typos", () => {
    const query = trigrams("thermodynamcs lecture");
    const close = trigramSimilarity(query, trigrams("Thermodynamics lecture 7"));
    const far = trigramSimilarity(query, trigrams("Vendor contract review"));
    expect(close).toBeGreaterThan(0.4);
    expect(far).toBeLessThan(0.1);
    expect(trigramSimilarity([], query)).toBe(0);
  });

  it("sorts titles by name ignoring case and accents, with numbers in numeric order", () => {
    const titles = ["lecture 10", "Lecture 9", "Émile", "apple", "Lecture 09b", "zebra", "Apple 2"];
    const sorted = [...titles].sort((a, b) => {
      const ka = titleSortKey(a);
      const kb = titleSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    expect(sorted).toEqual([
      "apple",
      "Apple 2",
      "Émile",
      "Lecture 9",
      "Lecture 09b",
      "lecture 10",
      "zebra",
    ]);
  });
});
