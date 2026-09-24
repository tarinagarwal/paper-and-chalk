/** Where signed-in users land when no other destination was requested. */
export const DEFAULT_AFTER_SIGN_IN = "/app";

/**
 * Only same-site paths are allowed as post-sign-in destinations, so a crafted link can't bounce a
 * user to another site. Anything else falls back to the library.
 */
export function safeCallbackUrl(value: string | null | undefined): string {
  if (!value) return DEFAULT_AFTER_SIGN_IN;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
  const isRelativePath =
    decoded.startsWith("/") && !decoded.startsWith("//") && !decoded.startsWith("/\\");
  // eslint-disable-next-line no-control-regex -- rejects control characters in URLs
  const hasControlChars = /[\u0000-\u001f\u007f]/.test(decoded);
  if (!isRelativePath || hasControlChars || decoded.startsWith("/sign-in")) {
    return DEFAULT_AFTER_SIGN_IN;
  }
  return decoded;
}
