export type Probe = () => Promise<void>;

export interface HealthReport {
  ok: boolean;
  db: boolean;
  redis: boolean;
  storage: boolean;
}

export interface Probes {
  db: Probe;
  redis: Probe;
  storage: Probe;
}

function withTimeout(probe: Probe, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${ms} ms`));
    }, ms);
    probe().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/** Runs every probe in parallel. A probe that throws or exceeds the timeout counts as down. */
export async function runHealthChecks(probes: Probes, timeoutMs = 2_000): Promise<HealthReport> {
  const names = ["db", "redis", "storage"] as const;
  const results = await Promise.allSettled(names.map((n) => withTimeout(probes[n], timeoutMs)));

  const status = { db: false, redis: false, storage: false };
  results.forEach((result, i) => {
    const name = names[i];
    if (name === undefined) return;
    status[name] = result.status === "fulfilled";
    if (result.status === "rejected") {
      console.error(`health: ${name} is down:`, result.reason);
    }
  });

  return { ok: status.db && status.redis && status.storage, ...status };
}
