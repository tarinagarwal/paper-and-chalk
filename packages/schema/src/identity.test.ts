import { describe, expect, it } from "vitest";

import { displayNameSchema, PRESENCE_COLORS, presenceColor, syncIdentitySchema } from "./identity";

/** WCAG relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

describe("presenceColor", () => {
  it("is stable for the same id", () => {
    expect(presenceColor("user-123")).toBe(presenceColor("user-123"));
  });

  it("always returns a palette colour", () => {
    for (let i = 0; i < 500; i++) {
      expect(PRESENCE_COLORS).toContain(presenceColor(`user-${i}`));
    }
  });

  it("spreads ids across the palette", () => {
    const used = new Set(Array.from({ length: 500 }, (_, i) => presenceColor(`id-${i}`)));
    expect(used.size).toBe(PRESENCE_COLORS.length);
  });

  it.each(PRESENCE_COLORS)("%s keeps white text at 4.5:1 or better", (color) => {
    expect(contrastWithWhite(color)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("displayNameSchema", () => {
  it("trims and collapses whitespace", () => {
    expect(displayNameSchema.parse("  Maya   Rao ")).toBe("Maya Rao");
  });

  it("accepts names in any script, and digits", () => {
    for (const name of ["Maya", "मीरा", "李雷", "Zoë O'Neil", "R2"]) {
      expect(displayNameSchema.safeParse(name).success, name).toBe(true);
    }
  });

  it.each([
    ["", "Enter a name"],
    ["    ", "Enter a name"],
    ["---", "Use at least one letter or number"],
    ["a".repeat(51), "Keep it under 50 characters"],
    ["Maya\u0000", "Remove special characters"],
  ])("rejects %j", (value, message) => {
    const result = displayNameSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});

describe("syncIdentitySchema", () => {
  const valid = { userId: "u1", name: "Maya", avatar: null, color: "#3f7d4e" };

  it("accepts a valid identity", () => {
    expect(syncIdentitySchema.parse(valid)).toEqual(valid);
  });

  it("rejects extra fields and bad values", () => {
    expect(syncIdentitySchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
    expect(syncIdentitySchema.safeParse({ ...valid, color: "green" }).success).toBe(false);
    expect(syncIdentitySchema.safeParse({ ...valid, userId: "" }).success).toBe(false);
    expect(syncIdentitySchema.safeParse({ ...valid, avatar: "not a url" }).success).toBe(false);
  });
});
