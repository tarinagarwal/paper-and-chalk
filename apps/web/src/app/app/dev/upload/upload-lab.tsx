"use client";

import { DownloadIcon, ExternalLinkIcon, UploadIcon } from "lucide-react";
import { cn } from "cn";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { useUpload } from "@/hooks/use-upload";
import { assetUrl } from "@/lib/upload/api";
import type { UploadSnapshot } from "@/lib/upload/engine";
import { formatBytes } from "@/lib/upload/format";

interface WorkspaceOption {
  id: string;
  name: string;
  canUpload: boolean;
}

/** Picks files (button or drop), uploads them into a workspace, and lists what finished. */
export function UploadLab({ workspaces }: { workspaces: WorkspaceOption[] }) {
  const writable = workspaces.filter((w) => w.canUpload);
  const [workspaceId, setWorkspaceId] = useState(writable[0]?.id ?? "");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { uploads, upload } = useUpload();
  const inputId = useId();
  const selectId = useId();
  // Kept here so closing the upload tray does not empty this list (updated during render when
  // the uploads change, the React-recommended alternative to an effect).
  const [finished, setFinished] = useState<UploadSnapshot[]>([]);
  const [seen, setSeen] = useState(uploads);
  if (seen !== uploads) {
    setSeen(uploads);
    const known = new Set(finished.map((u) => u.id));
    const added = uploads.filter((u) => u.state === "done" && u.asset && !known.has(u.id));
    if (added.length > 0) setFinished([...finished, ...added]);
  }
  const shown = finished.filter((u) => u.asset?.workspaceId === workspaceId);

  const start = (files: FileList | null) => {
    if (!files || files.length === 0 || !workspaceId) return;
    upload([...files], { workspaceId });
  };

  const open = async (assetId: string, download: boolean) => {
    setError(null);
    try {
      const url = await assetUrl(assetId, download);
      if (download) window.location.assign(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not open the file.");
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-8 p-4 sm:p-8">
      <div className="flex flex-col gap-2">
        <p className="eyebrow">Temporary · step 5</p>
        <h1 className="font-display text-[2.25rem] leading-tight tracking-[-0.015em]">
          Upload test
        </h1>
        <p className="max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
          Files go straight from this browser to storage. Try a large video to see parts, pause and
          resume from the tray, upload the same file twice, or rename a text file to{" "}
          <span className="font-mono text-[0.8125rem]">.pdf</span> to see it rejected.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={selectId} className="text-sm font-medium">
          Workspace
        </label>
        <select
          id={selectId}
          value={workspaceId}
          onChange={(event) => {
            setWorkspaceId(event.target.value);
          }}
          className="h-9 w-full max-w-xs rounded-md border bg-background px-2.5 text-sm"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id} disabled={!w.canUpload}>
              {w.name}
              {w.canUpload ? "" : " (view only)"}
            </option>
          ))}
        </select>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          start(event.dataTransfer.files);
        }}
        className={cn(
          "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-canvas-dots p-8 text-center transition-colors",
          "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <UploadIcon aria-hidden className="size-6 text-muted-foreground" />
        <span className="text-[0.9375rem]">Drop files here, or choose files</span>
        <span className="font-mono text-[0.7rem] text-muted-foreground">
          PDF, images, audio, video, ZIP and Office files
        </span>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          data-testid="upload-input"
          onChange={(event) => {
            start(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      <section aria-labelledby="finished-title" className="flex flex-col gap-3">
        <h2 id="finished-title" className="font-display text-[1.5rem] leading-tight">
          Uploaded here
        </h2>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet in this session.</p>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="uploaded-list">
            {shown.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{item.fileName}</p>
                  <p className="font-mono text-[0.7rem] text-muted-foreground">
                    {formatBytes(item.size)} · {item.asset?.status}
                    {item.duplicate ? " · already here" : ""} · {item.asset?.sha256.slice(0, 12)}
                  </p>
                </div>
                {item.asset?.status === "ready" && (
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void open(item.asset?.id ?? "", false)}
                    >
                      <ExternalLinkIcon data-icon="inline-start" /> Open
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void open(item.asset?.id ?? "", true)}
                    >
                      <DownloadIcon data-icon="inline-start" /> Download
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
