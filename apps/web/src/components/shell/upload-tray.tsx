"use client";

import {
  ChevronDownIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  MusicIcon,
  PaperclipIcon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useUpload } from "@/hooks/use-upload";
import type { UploadSnapshot } from "@/lib/upload/engine";
import { uploadPercent, uploadStatus } from "@/lib/upload/format";
import { uploadKind } from "@pc/schema";

const KIND_ICON = {
  pdf: FileTextIcon,
  image: ImageIcon,
  audio: MusicIcon,
  video: VideoIcon,
  attachment: PaperclipIcon,
} as const;

const FINISHED = new Set(["done", "failed", "cancelled"]);

function summary(items: readonly UploadSnapshot[]): string {
  const active = items.filter((i) => !FINISHED.has(i.state)).length;
  const failed = items.filter((i) => i.state === "failed").length;
  if (active > 0) return `Uploading ${String(active)} ${active === 1 ? "file" : "files"}`;
  if (failed > 0) return `${String(failed)} ${failed === 1 ? "upload" : "uploads"} need attention`;
  return `${String(items.length)} ${items.length === 1 ? "upload" : "uploads"} complete`;
}

function Row({ item }: { item: UploadSnapshot }) {
  const { pause, resume, retry, cancel, dismiss } = useUpload();
  const Icon = item.mime ? KIND_ICON[uploadKind(item.mime)] : FileIcon;
  const percent = uploadPercent(item);
  const finished = FINISHED.has(item.state);
  const canPause = ["hashing", "starting", "uploading"].includes(item.state);

  return (
    <li
      className="flex items-start gap-2.5 px-3 py-2.5"
      data-testid="upload-row"
      data-state={item.state}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={item.fileName}>
          {item.fileName}
        </p>
        <p
          className={cn(
            "font-mono text-[0.7rem] leading-5 text-muted-foreground",
            item.state === "failed" && "text-destructive",
          )}
          data-testid="upload-status"
        >
          {uploadStatus(item)}
        </p>
        {percent !== null && (
          <Progress
            value={percent}
            className={cn("mt-1", item.state === "paused" && "opacity-60")}
            aria-label={`${item.fileName}: ${String(percent)}%`}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {canPause && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Pause ${item.fileName}`}
            onClick={() => {
              pause(item.id);
            }}
          >
            <PauseIcon />
          </Button>
        )}
        {item.state === "paused" && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Resume ${item.fileName}`}
            onClick={() => {
              resume(item.id);
            }}
          >
            <PlayIcon />
          </Button>
        )}
        {item.state === "failed" && item.mime && (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Retry ${item.fileName}`}
            onClick={() => {
              retry(item.id);
            }}
          >
            <RotateCwIcon />
          </Button>
        )}
        {finished ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Dismiss ${item.fileName}`}
            onClick={() => {
              dismiss(item.id);
            }}
          >
            <XIcon />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Cancel ${item.fileName}`}
            onClick={() => {
              cancel(item.id);
            }}
          >
            <XIcon />
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Every upload in progress, wherever it was started. Bottom right, collapsible, hidden when empty.
 * Status changes are announced politely to screen readers.
 */
export function UploadTray() {
  const { uploads, clearFinished } = useUpload();
  const [open, setOpen] = useState(true);
  if (uploads.length === 0) return null;
  const heading = summary(uploads);
  const allFinished = uploads.every((u) => FINISHED.has(u.state));

  return (
    <section
      aria-labelledby="upload-tray-title"
      data-testid="upload-tray"
      className="fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <header className="flex items-center gap-1 border-b py-1.5 pr-1.5 pl-3">
        <h2
          id="upload-tray-title"
          className="flex-1 truncate text-sm font-medium"
          aria-live="polite"
        >
          {heading}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={open}
          aria-controls="upload-tray-list"
          aria-label={open ? "Collapse uploads" : "Expand uploads"}
          onClick={() => {
            setOpen((value) => !value);
          }}
        >
          <ChevronDownIcon className={cn("transition-transform", !open && "rotate-180")} />
        </Button>
        {allFinished && (
          <Button variant="ghost" size="icon-sm" aria-label="Close uploads" onClick={clearFinished}>
            <XIcon />
          </Button>
        )}
      </header>
      <ul
        id="upload-tray-list"
        hidden={!open}
        className="max-h-72 divide-y overflow-y-auto overscroll-contain"
      >
        {uploads.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
