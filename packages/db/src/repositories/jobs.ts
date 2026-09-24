/**
 * Background job records (the `jobs` collection). System code: the web app records a job when it
 * enqueues it, the worker records how it went. Lets us see stuck or failed jobs.
 */
import { jobRecordSchema, type JobKind, type JobPayload, type JobRecord } from "@pc/schema";

import { newId } from "../ids";
import type { RepoContext } from "./context";

export function jobsRepository(r: RepoContext) {
  const { c } = r;
  async function finish(id: string, set: Partial<JobRecord>): Promise<void> {
    await c.jobs.updateOne(
      { _id: id },
      { $set: { ...set, finishedAt: r.now(), updatedAt: r.now() } },
    );
  }

  return {
    async create<K extends JobKind>(kind: K, input: JobPayload<K>): Promise<JobRecord> {
      const now = r.now();
      const job = jobRecordSchema.parse({
        _id: newId(),
        kind,
        status: "queued",
        input,
        output: null,
        error: null,
        attempts: 0,
        startedAt: null,
        finishedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await c.jobs.insertOne(job);
      return job;
    },

    get: (id: string) => c.jobs.findOne({ _id: id }),

    async start(id: string): Promise<void> {
      await c.jobs.updateOne(
        { _id: id },
        {
          $set: { status: "running", startedAt: r.now(), updatedAt: r.now() },
          $inc: { attempts: 1 },
        },
      );
    },

    succeed: (id: string, output: unknown) =>
      finish(id, { status: "succeeded", output, error: null }),

    fail: (id: string, error: string) =>
      finish(id, { status: "failed", error: error.slice(0, 10_000) }),
  };
}
