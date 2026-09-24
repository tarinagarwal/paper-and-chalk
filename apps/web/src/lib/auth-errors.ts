export interface AuthErrorMessage {
  kind: "expired" | "cancelled" | "error";
  title: string;
  body: string;
}

/**
 * Human messages for the `?error=` codes Better Auth adds when it redirects back to /sign-in.
 * A magic link that was already used and one that timed out look the same to the server
 * (the token is consumed or gone), so both show the "expired" message.
 */
export function authErrorMessage(code: string | null | undefined): AuthErrorMessage | null {
  if (!code) return null;
  switch (code) {
    case "INVALID_TOKEN":
    case "EXPIRED_TOKEN":
      return {
        kind: "expired",
        title: "That link has expired",
        body: "Sign-in links work once and last 15 minutes. Send yourself a new one below.",
      };
    case "access_denied":
      return {
        kind: "cancelled",
        title: "Google sign-in was cancelled",
        body: "Try again, or use your email instead.",
      };
    case "account_not_linked":
    case "email_doesn't_match":
    case "email_not_found":
      return {
        kind: "error",
        title: "We couldn't use that Google account",
        body: "Try signing in with a magic link to the same email address.",
      };
    default:
      return {
        kind: "error",
        title: "Something went wrong signing you in",
        body: "Please try again. If it keeps happening, use a magic link instead.",
      };
  }
}
