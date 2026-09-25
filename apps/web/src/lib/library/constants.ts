/** Cookie holding the workspace the library shows (set by the workspace switcher). */
export const ACTIVE_WORKSPACE_COOKIE = "pc_workspace";

/** Cookie holding grid or list, so the server renders the same view the user left. */
export const VIEW_MODE_COOKIE = "pc_library_view";

export type ViewMode = "grid" | "list";

/** A year: both cookies are preferences, not secrets. */
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
