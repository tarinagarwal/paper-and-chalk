import { pingDb } from "@pc/db";
import { BUCKETS } from "@pc/storage";
import { NextResponse } from "next/server";

import { env } from "@/env";
import { runHealthChecks } from "@/lib/health";
import { getMongo, getStorage, getUpstash } from "@/lib/server/clients";

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
        BUCKETS.map(async (bucket) => ({ bucket, exists: await storage.bucketExists(bucket) })),
      );
      const missing = checks.filter((c) => !c.exists).map((c) => storage.config.buckets[c.bucket]);
      if (missing.length > 0) throw new Error(`missing buckets: ${missing.join(", ")}`);
    },
  });

  return NextResponse.json(
    { ...report, release: env.RELEASE },
    {
      status: report.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
