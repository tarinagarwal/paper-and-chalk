"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * False on the server and during hydration, true afterwards. Anything that depends on the
 * browser (its time zone, "now") renders only once this is true, so the server's HTML and the
 * first client render always match: the server runs in UTC, people do not.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
