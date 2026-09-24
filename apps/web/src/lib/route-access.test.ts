import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { accessFor, createProxy } from "./route-access";

const request = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

describe("accessFor", () => {
  it.each([
    ["/", "public"],
    ["/sign-in", "public"],
    ["/pricing", "public"],
    ["/application", "public"],
    ["/api/health", "public"],
    ["/api/auth/sign-in/magic-link", "public"],
    ["/api/auth", "public"],
    ["/app", "page"],
    ["/app/doc/123", "page"],
    ["/api/sync-token", "api"],
    ["/api/documents/1", "api"],
    ["/api/healthz", "api"],
    ["/api/authx", "api"],
  ] as const)("%s is %s", (path, access) => {
    expect(accessFor(path)).toBe(access);
  });
});

describe("proxy", () => {
  it("lets public routes through without looking up a session", async () => {
    const lookup = vi.fn(() => Promise.resolve(null));
    const res = await createProxy(lookup)(request("/"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("redirects signed-out page requests to /sign-in with the original URL", async () => {
    const res = await createProxy(() => Promise.resolve(null))(request("/app/doc/7?page=3"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("callbackUrl")).toBe("/app/doc/7?page=3");
  });

  it("answers signed-out API requests with 401 JSON", async () => {
    const res = await createProxy(() => Promise.resolve(null))(request("/api/sync-token"));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "unauthorized", message: "Sign in to continue." });
  });

  it("lets signed-in requests through", async () => {
    const proxy = createProxy(() => Promise.resolve({ user: { id: "u1" } }));
    for (const path of ["/app", "/api/sync-token"]) {
      const res = await proxy(request(path));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("passes the request headers to the session lookup", async () => {
    const lookup = vi.fn((_headers: Headers) => Promise.resolve(null));
    const req = new NextRequest(new URL("http://localhost:3000/app"), {
      headers: { cookie: "better-auth.session_token=abc" },
    });
    await createProxy(lookup)(req);
    expect(lookup.mock.calls[0]?.[0].get("cookie")).toContain("session_token=abc");
  });
});
