/**
 * Title search without a search engine: documents store the trigrams of their title in an indexed
 * array, and queries rank candidates by trigram overlap (the same idea as Postgres pg_trgm).
 */

/** Lowercase, accents removed, anything that is not a letter or digit becomes a space. */
export function normaliseForSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The key documents are sorted by name with: lowercase, accents removed, and runs of digits
 * zero-padded so numbers sort by value ("lecture 9" before "lecture 10"). Plain byte order on this
 * key is the library's name order, so MongoDB needs no collation (which could not also order ids).
 */
export function titleSortKey(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\d+/g, (digits) => digits.replace(/^0+(?=\d)/, "").padStart(12, "0"))
    .slice(0, 400);
}

/** Distinct trigrams of each word, padded like pg_trgm ("  c", " ca", "cat", "at "). */
export function trigrams(text: string): string[] {
  const grams = new Set<string>();
  for (const word of normaliseForSearch(text).split(" ")) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) grams.add(padded.slice(i, i + 3));
  }
  return [...grams];
}

/** Jaccard similarity of two trigram sets, 0..1. */
export function trigramSimilarity(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const gram of new Set(a)) if (setB.has(gram)) shared++;
  return shared / (new Set(a).size + setB.size - shared);
}

/** Embedding model for semantic search (SPEC.md section 21). Changing either means re-embedding. */
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMENSIONS = 768;
