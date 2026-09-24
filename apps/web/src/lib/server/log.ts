import "server-only";

import { env } from "@/env";

/**
 * One JSON line per event: Cloud Logging reads `severity` and `message`; `release` is the git SHA
 * of the running build.
 */
export function log(
  severity: "INFO" | "WARNING" | "ERROR",
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({ severity, message, release: env.RELEASE, ...fields });
  if (severity === "ERROR") console.error(line);
  else if (severity === "WARNING") console.warn(line);
  else console.info(line);
}
