import type { JobKind, JobPayload } from "@pc/schema";

import type { TaskMeta } from "../cloud-tasks";

export interface JobContext {
  task: TaskMeta;
}

export type JobHandler<K extends JobKind> = (
  payload: JobPayload<K>,
  ctx: JobContext,
) => Promise<unknown>;

export type JobHandlers = { [K in JobKind]: JobHandler<K> };
