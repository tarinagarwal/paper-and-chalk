import { pingDb } from "@pc/db";
import { NextResponse } from "next/server";

import { runHealthChecks } from "@/lib/health";
import { buckets, getDb, getRedis, getStorage } from "@/lib/server/clients";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runHealthChecks({
    db: () => pingDb(getDb().sql),
    redis: async () => {
      const redis = getRedis();
      if (redis.status === "wait" || redis.status === "end") await redis.connect();
      await redis.ping();
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
