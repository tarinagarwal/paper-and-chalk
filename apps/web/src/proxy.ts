import { getAuth } from "@/lib/auth";
import { createProxy } from "@/lib/route-access";

/** Guards /app and /api (see lib/route-access.ts). Runs on the Node.js runtime. */
export const proxy = createProxy((headers) => getAuth().api.getSession({ headers }));

export const config = {
  matcher: ["/app/:path*", "/api/:path*"],
};
