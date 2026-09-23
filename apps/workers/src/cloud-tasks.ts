import type { IncomingHttpHeaders } from "node:http";

/** Metadata Cloud Tasks attaches to every HTTP target request. Absent for local/manual calls. */
export interface TaskMeta {
  taskName: string | null;
  queueName: string | null;
  /** Times this task has been retried (0 on the first attempt). */
  retryCount: number;
  /** Times the task actually reached the handler. */
  executionCount: number;
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function count(headers: IncomingHttpHeaders, name: string): number {
  const n = Number(header(headers, name));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function readTaskMeta(headers: IncomingHttpHeaders): TaskMeta {
  return {
    taskName: header(headers, "x-cloudtasks-taskname"),
    queueName: header(headers, "x-cloudtasks-queuename"),
    retryCount: count(headers, "x-cloudtasks-taskretrycount"),
    executionCount: count(headers, "x-cloudtasks-taskexecutioncount"),
  };
}
