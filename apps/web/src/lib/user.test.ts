import { describe, expect, it } from "vitest";

import { displayName, initials, needsDisplayName } from "./user";

describe("needsDisplayName", () => {
  it("is true for missing or blank names only", () => {
    expect(needsDisplayName({ name: "" })).toBe(true);
    expect(needsDisplayName({ name: "   " })).toBe(true);
    expect(needsDisplayName({ name: null })).toBe(true);
    expect(needsDisplayName({})).toBe(true);
    expect(needsDisplayName({ name: "Maya" })).toBe(false);
  });
});

describe("displayName", () => {
  it("prefers the name, then the email local part", () => {
    expect(displayName({ name: "Maya Rao", email: "maya@example.com" })).toBe("Maya Rao");
    expect(displayName({ name: "  ", email: "jun.park@example.com" })).toBe("jun.park");
    expect(displayName({ name: null, email: "r@example.com" })).toBe("r");
  });
});

describe("initials", () => {
  it("uses first and last name parts", () => {
    expect(initials({ name: "Maya Rao", email: "m@example.com" })).toBe("MR");
    expect(initials({ name: "Maya", email: "m@example.com" })).toBe("M");
    expect(initials({ name: null, email: "jun.park@example.com" })).toBe("JP");
  });
});
