/**
 * Fractional ordering (SPEC.md sections 3 and 15). Pages, folders and layers carry an `orderKey`
 * string; inserting between two neighbours never renumbers anything else. Two people inserting at
 * the same spot can produce the same key, so every sort breaks ties by id, which makes the order
 * identical on every client.
 */
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/** A key that sorts after `before` and before `after`. Pass null for "start" or "end". */
export function keyBetween(before: string | null, after: string | null): string {
  assertOrdered(before, after);
  return generateKeyBetween(before, after);
}

/** `count` evenly spread keys between two neighbours, in order. */
export function keysBetween(before: string | null, after: string | null, count: number): string[] {
  assertOrdered(before, after);
  return generateNKeysBetween(before, after, count);
}

function assertOrdered(before: string | null, after: string | null): void {
  if (before !== null && after !== null && before >= after) {
    throw new RangeError(`order keys out of order: ${before} >= ${after}`);
  }
}

export interface Ordered {
  orderKey: string;
  id: string;
}

/** Plain byte order on keys, then ids: the same on every runtime and locale. */
export function compareByOrder(a: Ordered, b: Ordered): number {
  if (a.orderKey !== b.orderKey) return a.orderKey < b.orderKey ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function sortByOrder<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort(compareByOrder);
}
