import type { SQSEvent, SQSRecord } from "aws-lambda";
import { describe, expect, it } from "vitest";

import { jobHandlers, type WorkerServices } from "./jobs";
import { createSqsHandler } from "./sqs";

const JOB = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

function record(id: string, body: unknown, received = 1): SQSRecord {
  return {
    messageId: id,
    receiptHandle: "r",
    body: typeof body === "string" ? body : JSON.stringify(body),
    attributes: {
      ApproximateReceiveCount: String(received),
      SentTimestamp: "0",
      SenderId: "s",
      ApproximateFirstReceiveTimestamp: "0",
    },
    messageAttributes: {},
    md5OfBody: "",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:ap-south-1:1:paper-chalk-staging-jobs",
    awsRegion: "ap-south-1",
  };
}

function services(log: string[]): WorkerServices {
  return {
    files: { verification: { verify: () => Promise.resolve({ status: "ready" }) } },
    jobs: {
      start: (id) => {
        log.push(`start ${id}`);
        return Promise.resolve();
      },
      succeed: (id) => {
        log.push(`succeed ${id}`);
        return Promise.resolve();
      },
      fail: (id, error) => {
        log.push(`fail ${id} ${error}`);
        return Promise.resolve();
      },
    },
  };
}

describe("SQS handler", () => {
  it("runs each job and records it", async () => {
    const calls: string[] = [];
    const handle = createSqsHandler(() => Promise.resolve(services(calls)));
    const event: SQSEvent = {
      Records: [record("m1", { jobId: JOB, kind: "ping", payload: { message: "hi" } })],
    };
    expect(await handle(event)).toEqual({ batchItemFailures: [] });
    expect(calls).toEqual([`start ${JOB}`, `succeed ${JOB}`]);
  });

  it("reports only jobs worth retrying, and drops malformed or invalid ones", async () => {
    const calls: string[] = [];
    const handle = createSqsHandler(() => Promise.resolve(services(calls)), {
      ...jobHandlers,
      ping: (payload) =>
        payload.message === "boom" ? Promise.reject(new Error("boom")) : Promise.resolve("ok"),
    });
    const result = await handle({
      Records: [
        record("ok", { jobId: JOB, kind: "ping", payload: { message: "fine" } }),
        record("retry", { jobId: JOB, kind: "ping", payload: { message: "boom" } }, 2),
        record("invalid", { jobId: JOB, kind: "ping", payload: { message: "" } }),
        record("garbage", "{not json"),
        record("unknown", { jobId: JOB, kind: "nope", payload: {} }),
      ],
    });
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "retry" }]);
    expect(calls.filter((c) => c.startsWith("fail"))).toEqual([
      `fail ${JOB} boom`,
      `fail ${JOB} invalid job payload`,
    ]);
  });
});
