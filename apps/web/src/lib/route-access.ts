import { NextResponse, type NextRequest } from "next/server";

/**
 * Which requests need a signed-in user (step 3):
 * - /app/* pages redirect to /sign-in
 * - /api/* returns 401 JSON, except /api/health and /api/auth/*
 * - everything else is public
 */
export type Access = "public" | "page" | "api";

export function accessFor(pathname: string): Access {
  if (pathname === "/api/health" || pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return "public";
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) return "api";
  if (pathname === "/app" || pathname.startsWith("/app/")) return "page";
  return "public";
}

export type SessionLookup = (headers: Headers) => Promise<unknown>;

/** Builds the request proxy around a session lookup, so tests can inject one. */
export function createProxy(getSession: SessionLookup) {
  return async function proxy(request: NextRequest): Promise<NextResponse> {
    const { pathname, search } = request.nextUrl;
    const access = accessFor(pathname);
    if (access === "public") return NextResponse.next();

    const session = await getSession(request.headers);
    if (session) return NextResponse.next();

    if (access === "api") {
      return NextResponse.json(
        { error: "unauthorized", message: "Sign in to continue." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    const signIn = request.nextUrl.clone();
    signIn.pathname = "/sign-in";
    signIn.search = "";
    signIn.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(signIn);
  };
}
