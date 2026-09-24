import { describe, expect, it } from "vitest";

import { normaliseForSearch, trigrams, trigramSimilarity } from "./search";

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
});
