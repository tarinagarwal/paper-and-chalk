import { describe, expect, it } from "vitest";

import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it("returns nothing when there is no error", () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage("")).toBeNull();
  });

  it("treats invalid and expired magic links as expired", () => {
    expect(authErrorMessage("INVALID_TOKEN")?.kind).toBe("expired");
    expect(authErrorMessage("EXPIRED_TOKEN")?.kind).toBe("expired");
  });

  it("recognises a cancelled Google sign-in", () => {
    expect(authErrorMessage("access_denied")?.kind).toBe("cancelled");
  });

  it("falls back to a generic error for unknown codes", () => {
    expect(authErrorMessage("something_new")).toMatchObject({ kind: "error" });
  });
});
