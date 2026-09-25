import { TRASH_RETENTION_DAYS, type DocumentType, type LibrarySort } from "@pc/schema";

export { formatBytes } from "@/lib/upload/format";

const DAY = 86_400_000;

export const TYPE_LABELS: Record<DocumentType, string> = {
  notebook: "Notebook",
  canvas: "Board",
  pdf: "PDF",
};

export const SORT_LABELS: Record<LibrarySort, string> = {
  modified: "Last modified",
  created: "Date created",
  name: "Name",
  size: "Size",
  lastOpened: "Last opened",
  relevance: "Best match",
};

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Short dates for the library: "14:05" today, "Yesterday", the weekday this week, "12 Sep" this
 * year, "12 Sep 2025" before that. British style, the user's time zone.
 */
export function formatShortDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (sameDay(date, now)) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  if (sameDay(date, new Date(now.getTime() - DAY))) return "Yesterday";
  if (now.getTime() - date.getTime() < 6 * DAY && date < now) {
    return date.toLocaleDateString("en-GB", { weekday: "long" });
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Full date and time for tooltips and screen readers. */
export function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" });
}

export function pagesLabel(type: DocumentType, pageCount: number): string {
  if (type === "canvas") return "Infinite canvas";
  return `${pageCount.toLocaleString("en-GB")} ${pageCount === 1 ? "page" : "pages"}`;
}

/** "Deleted forever in 12 days" for trashed documents. */
export function trashCountdown(deletedAtIso: string, now: Date = new Date()): string {
  const deletedAt = new Date(deletedAtIso).getTime();
  const left = Math.ceil((deletedAt + TRASH_RETENTION_DAYS * DAY - now.getTime()) / DAY);
  if (left <= 0) return "Deleted forever today";
  return `Deleted forever in ${String(left)} ${left === 1 ? "day" : "days"}`;
}

export function countLabel(count: number, noun = "document"): string {
  return `${count.toLocaleString("en-GB")} ${noun}${count === 1 ? "" : "s"}`;
}
