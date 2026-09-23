import { ping } from "./ping";
import type { JobHandlers } from "./types";

/** One handler per job kind in @pc/schema. The type makes a missing handler a compile error. */
export const jobHandlers: JobHandlers = {
  ping,
};

export type { JobContext, JobHandler, JobHandlers } from "./types";
