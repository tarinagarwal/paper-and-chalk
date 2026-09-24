import { describe, expect, it } from "vitest";

import { safeCallbackUrl } from "./callback-url";

describe("safeCallbackUrl", () => {
  it("keeps same-site paths with query strings", () => {
    expect(safeCallbackUrl("/app")).toBe("/app");
    expect(safeCallbackUrl("/app/doc/123?page=4")).toBe("/app/doc/123?page=4");
    expect(safeCallbackUrl(encodeURIComponent("/app/doc/1?x=y"))).toBe("/app/doc/1?x=y");
  });

  it.each([
    [undefined],
    [""],
    ["https://evil.example.com/app"],
    ["//evil.example.com"],
    ["/\\evil.example.com"],
    ["javascript:alert(1)"],
    ["app"],
    ["/app\u0000"],
    ["%E0%A4%A"],
    ["/sign-in"],
    ["/sign-in/verify"],
  ])("falls back to /app for %j", (value) => {
    expect(safeCallbackUrl(value)).toBe("/app");
  });
});
