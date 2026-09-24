import "server-only";

import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import type { JobKind, JobMessage, JobPayload } from "@pc/schema";
import { awsCredentialsFromEnv } from "@pc/storage";
import { after } from "next/server";

import { env } from "@/env";
import { getRepositories } from "@/lib/server/clients";
import { log } from "@/lib/server/log";

/** Long local jobs (hashing a 1 GB video) finish well within this. */
const DISPATCH_TIMEOUT_MS = 15 * 60 * 1000;

const cache = globalThis as typeof globalThis & { __pcSqs?: SQSClient };

function sqs(): SQSClient {
  cache.__pcSqs ??= new SQSClient({
    region: env.S3_REGION,
    credentials: awsCredentialsFromEnv(env),
  });
  return cache.__pcSqs;
}

/** Local dev: straight to the workers over HTTP, after the response (the call waits for the job). */
function dispatchOverHttp(message: JobMessage): void {
  after(async () => {
    try {
      const response = await fetch(new URL(`/jobs/${message.kind}`, env.WORKERS_URL), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-PC-Job-Id": message.jobId },
        body: JSON.stringify(message.payload),
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        log("ERROR", "job dispatch failed", {
          kind: message.kind,
          job: message.jobId,
          status: response.status,
        });
      }
    } catch (error) {
      log("ERROR", "job dispatch failed", {
        kind: message.kind,
        job: message.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

/**
 * Records a job and hands it to the workers. Deployed: onto the SQS queue before the response is
 * sent (Cloud Run throttles CPU once a response is out, so nothing runs "after"); the queue then
 * retries failures and parks repeated ones in its dead-letter queue. Locally: HTTP to the workers.
 * A job whose local dispatch fails stays `queued` in the jobs collection.
 */
export async function enqueueJob<K extends JobKind>(kind: K, payload: JobPayload<K>) {
  const job = await getRepositories().jobs.create(kind, payload);
  const message: JobMessage = { jobId: job._id, kind, payload };
  if (env.JOBS_QUEUE_URL) {
    await sqs().send(
      new SendMessageCommand({
        QueueUrl: env.JOBS_QUEUE_URL,
        MessageBody: JSON.stringify(message),
      }),
    );
  } else {
    dispatchOverHttp(message);
  }
  return job;
}
