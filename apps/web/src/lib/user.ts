interface NamedUser {
  name?: string | null;
  email: string;
}

/** True until the user has chosen a display name (magic-link accounts start without one). */
export function needsDisplayName(user: { name?: string | null }): boolean {
  return !user.name?.trim();
}

/** Magic-link users start without a name; fall back to the part of the email before the @. */
export function displayName(user: NamedUser): string {
  const name = user.name?.trim();
  if (name) return name;
  return user.email.split("@")[0] ?? user.email;
}

/** One or two initials for avatar fallbacks. */
export function initials(user: NamedUser): string {
  const parts = displayName(user)
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters = (parts.length > 1 ? [parts[0], parts.at(-1)] : [parts[0]])
    .map((p) => p?.[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}
