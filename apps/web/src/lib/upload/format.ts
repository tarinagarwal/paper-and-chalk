import type { UploadSnapshot } from "./engine";

/** 1 KB = 1024 bytes, like every file manager. One decimal below 10. */
export function formatBytes(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  if (unit === 0) return `${String(bytes)} ${bytes === 1 ? "byte" : "bytes"}`;
  const rounded = value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${rounded} ${units[unit] ?? "GB"}`;
}

/** 0 to 100 for the progress bar, or null when there is nothing to measure. */
export function uploadPercent(item: UploadSnapshot): number | null {
  if (item.size === 0) return null;
  if (item.state === "hashing") return Math.round((item.hashedBytes / item.size) * 100);
  if (["uploading", "paused"].includes(item.state)) {
    return Math.round((item.uploadedBytes / item.size) * 100);
  }
  return null;
}

/** The short status line under a file name. */
export function uploadStatus(item: UploadSnapshot): string {
  const of = `${formatBytes(item.uploadedBytes)} of ${formatBytes(item.size)}`;
  switch (item.state) {
    case "queued":
      return "Waiting";
    case "hashing":
      return `Reading file, ${String(uploadPercent(item) ?? 0)}%`;
    case "starting":
      return "Starting";
    case "uploading":
      return `Uploading ${of}`;
    case "paused":
      return `Paused at ${of}`;
    case "finishing":
      return "Finishing";
    case "verifying":
      return "Checking the file";
    case "done":
      return item.duplicate ? "Already in this workspace" : `Uploaded, ${formatBytes(item.size)}`;
    case "failed":
      return item.error ?? "Upload failed";
    case "cancelled":
      return "Cancelled";
  }
}
