/**
 * One JSON line per event. Cloud Logging and CloudWatch both pick up `severity` and `message`;
 * `release` (the git SHA baked into the image) says which build wrote the line.
 */
export function log(
  severity: "INFO" | "WARNING" | "ERROR",
  message: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    severity,
    message,
    release: process.env.RELEASE ?? "dev",
    ...fields,
  });
  if (severity === "ERROR") console.error(line);
  else if (severity === "WARNING") console.warn(line);
  else console.info(line);
}
