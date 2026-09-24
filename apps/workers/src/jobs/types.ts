import type { FileRepositories, Repositories } from "@pc/db";
import type { JobKind, JobPayload } from "@pc/schema";

import type { TaskMeta } from "../cloud-tasks";

/** What job handlers may use. Built once per process in index.ts; tests pass their own. */
export interface WorkerServices {
  files: Pick<FileRepositories, "verification">;
  /** Job records; the server updates them when a request carries a job id. */
  jobs: Pick<Repositories["jobs"], "start" | "succeed" | "fail">;
}

export interface JobContext {
  task: TaskMeta;
  services: WorkerServices;
}

export type JobHandler<K extends JobKind> = (
  payload: JobPayload<K>,
  ctx: JobContext,
) => Promise<unknown>;

export type JobHandlers = { [K in JobKind]: JobHandler<K> };
