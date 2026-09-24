import { ping } from "./ping";
import type { JobHandlers } from "./types";
import { verifyAsset } from "./verify-asset";

/** One handler per job kind in @pc/schema. The type makes a missing handler a compile error. */
export const jobHandlers: JobHandlers = {
  ping,
  verifyAsset,
};

export type { JobContext, JobHandler, JobHandlers, WorkerServices } from "./types";
