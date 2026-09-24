import { jobMessageSchema } from "@pc/schema";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";

import type { TaskMeta } from "./cloud-tasks";
import { jobHandlers, type JobHandlers, type WorkerServices } from "./jobs";
import { log } from "./log";
import { executeJob, InvalidJobError } from "./run-job";

function taskMeta(record: SQSRecord): TaskMeta {
  const received = Number(record.attributes.ApproximateReceiveCount) || 1;
  return {
    taskName: record.messageId,
    queueName: record.eventSourceARN.split(":").at(-1) ?? null,
    retryCount: received - 1,
    executionCount: received,
  };
}

/**
 * Handles a batch of SQS job messages. Only the jobs that failed for a reason worth retrying
 * are reported back, so SQS redelivers just those (and moves them to the dead-letter queue after
 * the queue's max receives). Malformed messages and invalid payloads are dropped with an error log.
 */
export function createSqsHandler(
  getServices: () => Promise<WorkerServices>,
  handlers: JobHandlers = jobHandlers,
) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const services = await getServices();
    const batchItemFailures: SQSBatchResponse["batchItemFailures"] = [];
    for (const record of event.Records) {
      let message;
      try {
        message = jobMessageSchema.parse(JSON.parse(record.body));
      } catch (error) {
        log("ERROR", "dropped malformed job message", {
          messageId: record.messageId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      try {
        await executeJob({
          kind: message.kind,
          payload: message.payload,
          jobId: message.jobId,
          ctx: { task: taskMeta(record), services },
          handlers,
        });
      } catch (error) {
        if (!(error instanceof InvalidJobError)) {
          batchItemFailures.push({ itemIdentifier: record.messageId });
        }
      }
    }
    return { batchItemFailures };
  };
}
