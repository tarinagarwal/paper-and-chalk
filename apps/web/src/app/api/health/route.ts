import { pingDb } from "@pc/db";
import { NextResponse } from "next/server";

import { runHealthChecks } from "@/lib/health";
import { buckets, getMongo, getStorage, getUpstash } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runHealthChecks({
    db: () => pingDb(getMongo().db),
    redis: async () => {
      const reply = await getUpstash().ping();
      if (reply !== "PONG") throw new Error(`unexpected PING reply: ${reply}`);
    },
    storage: async () => {
      const storage = getStorage();
      const checks = await Promise.all(
        Object.values(buckets).map(async (name) => {
          const [exists] = await storage.bucket(name).exists();
          return { name, exists };
        }),
      );
      const missing = checks.filter((c) => !c.exists).map((c) => c.name);
      if (missing.length > 0) throw new Error(`missing buckets: ${missing.join(", ")}`);
    },
  });

  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
