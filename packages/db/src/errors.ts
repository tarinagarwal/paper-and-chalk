import type { Decision, Denied, DenyReason } from "./permissions/decide";

/** Thrown by repositories when `can()` says no. Carries the reason for the API layer. */
export class AccessDeniedError extends Error {
  readonly reason: DenyReason;

  constructor(decision: Denied) {
    super(decision.message);
    this.name = "AccessDeniedError";
    this.reason = decision.reason;
  }
}

/** Invalid input or an impossible change (e.g. moving a folder into itself). */
export class InvalidRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InvalidRequestError";
  }
}

export function assertAllowed(
  decision: Decision,
): asserts decision is Extract<Decision, { allowed: true }> {
  if (!decision.allowed) throw new AccessDeniedError(decision);
}
