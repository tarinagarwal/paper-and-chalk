import type { FileRepositories, Repositories } from "@pc/db";
import type { JobKind, JobPayload } from "@pc/schema";
import type { Storage } from "@pc/storage";

import type { TaskMeta } from "../cloud-tasks";
import type { UrlFetcher } from "../fetch-url";

/** What job handlers may use. Built once per process in index.ts; tests pass their own. */
export interface WorkerServices {
  files: {
    verification: Pick<FileRepositories["verification"], "verify">;
    trash: Pick<FileRepositories["trash"], "purgeExpired">;
    imports: Pick<FileRepositories["imports"], "registerFetched" | "keyFor">;
  };
  /** Streams fetched files into S3 (URL imports). */
  storage: Pick<Storage, "putStream">;
  /** Downloads from web addresses, refusing private networks. */
  fetchUrl: UrlFetcher;
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
