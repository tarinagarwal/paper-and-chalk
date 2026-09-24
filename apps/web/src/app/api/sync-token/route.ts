import { presenceColor } from "@pc/schema";
import { signSyncToken } from "@pc/sync-token";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { getAuth } from "@/lib/auth";
import { displayName } from "@/lib/user";

export const dynamic = "force-dynamic";

/**
 * A 10-minute token the browser hands to the sync server, which verifies it without calling us.
 * The proxy already requires a session; this checks again so the route is safe on its own.
 */
export async function GET(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized", message: "Sign in to continue." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { user } = session;
  const { token, expiresAt } = await signSyncToken(
    {
      userId: user.id,
      name: displayName(user),
      avatar: user.image ?? null,
      color: presenceColor(user.id),
    },
    env.SYNC_JWT_SECRET,
  );

  return NextResponse.json(
    { token, expiresAt: expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
