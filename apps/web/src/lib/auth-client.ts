"use client";

import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser client for Better Auth. Talks to /api/auth on the current origin. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
