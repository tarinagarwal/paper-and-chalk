import { importFromUrl } from "./import-from-url";
import { ping } from "./ping";
import { purgeTrash } from "./purge-trash";
import type { JobHandlers } from "./types";
import { verifyAsset } from "./verify-asset";

/** One handler per job kind in @pc/schema. The type makes a missing handler a compile error. */
export const jobHandlers: JobHandlers = {
  ping,
  verifyAsset,
  purgeTrash,
  importFromUrl,
};

export type { JobContext, JobHandler, JobHandlers, WorkerServices } from "./types";
