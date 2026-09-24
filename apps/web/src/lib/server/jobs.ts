import "server-only";

import type { JobKind, JobPayload } from "@pc/schema";
import { after } from "next/server";

import { env } from "@/env";
import { getRepositories } from "@/lib/server/clients";

/** Long jobs (hashing a 1 GB video) finish well within this. */
const DISPATCH_TIMEOUT_MS = 15 * 60 * 1000;

function log(severity: "INFO" | "ERROR", message: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ severity, message, ...fields });
  if (severity === "ERROR") console.error(line);
  else console.info(line);
}

/**
 * Records a job and sends it to the workers once the response has gone out. For now the
 * dispatch is a direct HTTP call; a queue takes its place when the workers are deployed. A job
 * whose dispatch fails stays `queued` in the jobs collection, where it can be found and re-sent.
 */
export async function enqueueJob<K extends JobKind>(kind: K, payload: JobPayload<K>) {
  const job = await getRepositories().jobs.create(kind, payload);
  after(async () => {
    try {
      const response = await fetch(new URL(`/jobs/${kind}`, env.WORKERS_URL), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-PC-Job-Id": job._id },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        log("ERROR", "job dispatch failed", { kind, job: job._id, status: response.status });
      }
    } catch (error) {
      log("ERROR", "job dispatch failed", {
        kind,
        job: job._id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  return job;
}
