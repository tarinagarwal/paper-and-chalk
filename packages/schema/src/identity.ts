/**
 * Collaborator identity shared by the web app (which issues sync tokens) and the sync server
 * (which verifies them). SPEC.md sections 4 and 17.
 */
import { z } from "zod";

import { hexColorSchema } from "./primitives";

/**
 * Presence colours for cursors, name tags and selection outlines. Every colour keeps white text
 * at WCAG AA contrast (4.5:1) and stays distinct next to its neighbours.
 */
export const PRESENCE_COLORS = [
  "#3f7d4e", // moss
  "#7a3e8f", // plum
  "#2f5bd3", // cobalt
  "#c43e18", // vermilion
  "#1d7474", // teal
  "#8f5e00", // amber
  "#ad3462", // rose
  "#4a4fb3", // indigo
  "#52606d", // slate
  "#8a4b2b", // sienna
] as const;

export type PresenceColor = (typeof PRESENCE_COLORS)[number];

/** FNV-1a 32-bit: fast, stable across runtimes, good spread for short ids. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The same user always gets the same colour, on every device and server. */
export function presenceColor(userId: string): PresenceColor {
  const index = fnv1a(userId) % PRESENCE_COLORS.length;
  return PRESENCE_COLORS[index] ?? PRESENCE_COLORS[0];
}

/** Who a collaborator is, as carried in a sync token. */
export const syncIdentitySchema = z.strictObject({
  userId: z.string().min(1).max(128),
  name: z.string().max(200),
  avatar: z.url().nullable(),
  color: hexColorSchema,
});
export type SyncIdentity = z.infer<typeof syncIdentitySchema>;

/** Issuer and audience of sync tokens. */
export const SYNC_TOKEN_ISSUER = "paper-chalk-web";
export const SYNC_TOKEN_AUDIENCE = "paper-chalk-sync";
/** SPEC step 3: sync tokens live for 10 minutes. */
export const SYNC_TOKEN_TTL_SECONDS = 10 * 60;
