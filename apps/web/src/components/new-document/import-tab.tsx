"use client";

import {
  importedFileSchema,
  orient,
  PAGE_SIZE_PRESETS,
  PAPER_COLOR_PRESETS,
  resolveUploadMime,
  uploadKind,
  type ImageFit,
  type JobView,
  type NewDocument,
  type PageSizePresetId,
} from "@pc/schema";
import { useQueries } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileText, ImageIcon, Link2, Loader2, Upload, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpload } from "@/hooks/use-upload";
import { libraryApi } from "@/lib/library/api";
import { formatBytes } from "@/lib/library/format";
import type { UploadSnapshot } from "@/lib/upload/engine";
import { cn } from "@/lib/utils";

import { ColorChoice, selectClass } from "./fields";

/** A file to import: uploading from this device, or fetched from a web address. */
export interface ImportEntry {
  key: string;
  name: string;
  kind: "pdf" | "image";
  file: File | null;
  uploadId: string | null;
  jobId: string | null;
}

let counter = 0;

type UploadFiles = ReturnType<typeof useUpload>["upload"];

/**
 * Starts uploading the PDFs and images among `files` (the rest are refused with a reason) and
 * returns them as import entries. Used by the tab and by dropping files on the library.
 */
export function startImport(
  files: readonly File[],
  upload: UploadFiles,
  workspaceId: string,
): { entries: ImportEntry[]; refused: string[] } {
  const entries: ImportEntry[] = [];
  const refused: string[] = [];
  for (const file of files) {
    const mime = resolveUploadMime(file.name, file.type);
    const kind = mime ? uploadKind(mime) : null;
    if (
      !mime ||
      (kind !== "pdf" && kind !== "image") ||
      mime === "image/heic" ||
      mime === "image/gif"
    ) {
      refused.push(file.name);
      continue;
    }
    const [uploadId] = upload([file], { workspaceId, documentId: null });
    entries.push({
      key: `import-${String(++counter)}`,
      name: file.name,
      kind,
      file,
      uploadId: uploadId ?? null,
      jobId: null,
    });
  }
  return { entries, refused };
}

const FIT_SIZES: PageSizePresetId[] = ["a4", "a5", "letter", "legal", "a3", "b5"];

interface EntryState {
  status: "working" | "ready" | "failed";
  detail: string;
  assetId: string | null;
  bytes: number | null;
  name: string;
  kind: "pdf" | "image";
}

function uploadState(entry: ImportEntry, snapshot: UploadSnapshot | undefined): EntryState {
  const base = { name: entry.name, kind: entry.kind, bytes: entry.file?.size ?? null };
  if (!snapshot) return { ...base, status: "working", detail: "Waiting", assetId: null };
  if (snapshot.state === "done" && snapshot.asset) {
    return {
      ...base,
      status: "ready",
      detail: snapshot.duplicate ? "Already uploaded" : "Uploaded",
      assetId: snapshot.asset.id,
    };
  }
  if (snapshot.state === "failed" || snapshot.state === "cancelled") {
    return { ...base, status: "failed", detail: snapshot.error ?? "Cancelled", assetId: null };
  }
  const percent =
    snapshot.size > 0 ? Math.round((snapshot.uploadedBytes / snapshot.size) * 100) : 0;
  const detail =
    snapshot.state === "uploading"
      ? `Uploading ${String(percent)}%`
      : snapshot.state === "verifying"
        ? "Checking"
        : "Preparing";
  return { ...base, status: "working", detail, assetId: null };
}

/** An image's pixel size: read from the local file, or loaded from the stored copy. */
async function imageSize(
  file: File | null,
  assetId: string | null,
): Promise<{ widthPx: number; heightPx: number }> {
  if (file) {
    const bitmap = await createImageBitmap(file);
    const size = { widthPx: bitmap.width, heightPx: bitmap.height };
    bitmap.close();
    return size;
  }
  const { url } = await libraryApi.assetUrl(assetId ?? "", null);
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ widthPx: img.naturalWidth, heightPx: img.naturalHeight });
    };
    img.onerror = () => {
      reject(new Error("image did not load"));
    };
    img.src = url;
  });
}

export function ImportTab({
  workspaceId,
  folderId,
  busy,
  onCreate,
  initialEntries,
}: {
  workspaceId: string;
  folderId: string | null;
  busy: boolean;
  onCreate: (input: NewDocument) => void;
  initialEntries: ImportEntry[];
}) {
  const { uploads, upload, cancel } = useUpload();
  const [entries, setEntries] = useState<ImportEntry[]>(initialEntries);
  const [refused, setRefused] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fitMode, setFitMode] = useState<ImageFit["mode"]>("image");
  const [fitSize, setFitSize] = useState<PageSizePresetId>("a4");
  const [fitPaper, setFitPaper] = useState<string>(PAPER_COLOR_PRESETS.white.paperColor);

  // URL imports: the worker's job, polled until it finishes.
  const jobs = useQueries({
    queries: entries.map((entry) => ({
      queryKey: ["import-job", entry.jobId ?? "none"],
      queryFn: () => libraryApi.job(entry.jobId ?? ""),
      enabled: entry.jobId !== null,
      refetchInterval: (query: { state: { data?: JobView } }) =>
        query.state.data?.status === "succeeded" || query.state.data?.status === "failed"
          ? false
          : 1000,
    })),
  });

  const states: EntryState[] = entries.map((entry, i) => {
    if (entry.uploadId) {
      return uploadState(
        entry,
        uploads.find((u) => u.id === entry.uploadId),
      );
    }
    const job = jobs[i];
    const fetched =
      job?.data?.status === "succeeded" ? importedFileSchema.safeParse(job.data.output) : null;
    const base = { assetId: null, bytes: null, name: entry.name, kind: entry.kind };
    if (fetched?.success) {
      return {
        status: "ready",
        detail: "Fetched",
        assetId: fetched.data.assetId,
        bytes: fetched.data.bytes,
        name: fetched.data.fileName,
        kind: fetched.data.kind,
      };
    }
    if (job?.data?.status === "failed" || job?.isError) {
      return { ...base, status: "failed", detail: job.data?.error ?? "Couldn't fetch it" };
    }
    return { ...base, status: "working", detail: "Fetching" };
  });

  // Image pixel sizes: from the local file, or from the fetched file once it is ready.
  const sizes = useQueries({
    queries: entries.map((entry, i) => {
      const assetId = states[i]?.assetId ?? null;
      const isImage = states[i]?.kind === "image";
      return {
        queryKey: ["import-image-size", entry.key, assetId],
        enabled: isImage && (entry.file !== null || assetId !== null),
        staleTime: Infinity,
        queryFn: () => imageSize(entry.file, assetId),
      };
    }),
  });

  const add = (files: readonly File[]) => {
    const started = startImport(files, upload, workspaceId);
    setEntries((current) => [...current, ...started.entries]);
    setRefused(started.refused);
  };

  const fetchUrl = async () => {
    setUrlError(null);
    const trimmed = url.trim();
    if (!/^https:\/\//i.test(trimmed)) {
      setUrlError("Use an https:// address");
      return;
    }
    try {
      const { jobId } = await libraryApi.importFromUrl(workspaceId, trimmed);
      const name =
        decodeURIComponent(new URL(trimmed).pathname.split("/").pop() ?? "") || "download";
      setEntries((current) => [
        ...current,
        {
          key: `import-${String(++counter)}`,
          name,
          kind: /\.(png|jpe?g|webp)$/i.test(name) ? "image" : "pdf",
          file: null,
          uploadId: null,
          jobId,
        },
      ]);
      setUrl("");
    } catch (error) {
      setUrlError(error instanceof Error ? error.message : "Couldn't fetch that address");
    }
  };

  const move = (index: number, by: -1 | 1) => {
    setEntries((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item) next.splice(index + by, 0, item);
      return next;
    });
  };

  const remove = (entry: ImportEntry) => {
    if (entry.uploadId) cancel(entry.uploadId);
    setEntries((current) => current.filter((e) => e.key !== entry.key));
  };

  const ready = entries.length > 0 && states.every((s) => s.status === "ready");
  const firstName = states[0]?.name.replace(/\.[a-z0-9]+$/i, "") ?? "";
  const shownTitle = title ?? firstName;
  const hasImages = states.some((s) => s.kind === "image");
  const fitPreset = PAGE_SIZE_PRESETS[fitSize];

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        const imageFit: ImageFit =
          fitMode === "image"
            ? { mode: "image" }
            : {
                mode: "paper",
                sizePreset: fitSize,
                ...orient(fitPreset, "portrait"),
                paperColor: fitPaper,
              };
        onCreate({
          kind: "import",
          workspaceId,
          folderId,
          title: shownTitle.trim() || "Imported document",
          imageFit,
          items: states.map((state, i) => ({
            assetId: state.assetId ?? "",
            widthPx: sizes[i]?.data?.widthPx ?? null,
            heightPx: sizes[i]?.data?.heightPx ?? null,
          })),
        });
      }}
    >
      <div
        data-testid="import-dropzone"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add([...event.dataTransfer.files]);
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed bg-canvas-dots p-6 text-center",
          dragging && "border-primary bg-primary/5",
        )}
      >
        <Upload aria-hidden className="size-6 text-muted-foreground" />
        <p className="text-sm">
          Drop PDFs or images here, or{" "}
          <label className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline has-focus-visible:ring-2 has-focus-visible:ring-ring">
            choose files
            <input
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="sr-only"
              data-testid="import-input"
              onChange={(event) => {
                add([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
          </label>
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, JPG, PNG or WebP. Several PDFs are merged in the order below.
        </p>
      </div>
      {refused.length > 0 ? (
        <p className="text-sm text-destructive" role="alert">
          Not imported (only PDF, JPG, PNG and WebP): {refused.join(", ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="import-url">From a web address</Label>
        <div className="flex gap-2">
          <Input
            id="import-url"
            type="url"
            placeholder="https://example.com/paper.pdf"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
            }}
            aria-invalid={urlError !== null}
            aria-describedby={urlError ? "import-url-error" : undefined}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!url.trim()}
            onClick={() => void fetchUrl()}
            data-testid="import-url-fetch"
          >
            <Link2 aria-hidden />
            Fetch
          </Button>
        </div>
        {urlError ? (
          <p id="import-url-error" className="text-sm text-destructive">
            {urlError}
          </p>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <ol
          aria-label="Files to import, in page order"
          className="flex flex-col gap-1.5"
          data-testid="import-list"
        >
          {entries.map((entry, i) => {
            const state = states[i];
            if (!state) return null;
            const Icon = state.kind === "pdf" ? FileText : ImageIcon;
            return (
              <li
                key={entry.key}
                data-testid="import-item"
                data-status={state.status}
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{state.name}</p>
                  <p
                    className={cn(
                      "text-xs",
                      state.status === "failed" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {state.status === "working" ? (
                      <Loader2 aria-hidden className="mr-1 inline size-3 animate-spin" />
                    ) : null}
                    {state.detail}
                    {state.bytes ? ` · ${formatBytes(state.bytes)}` : ""}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${state.name} up`}
                  disabled={i === 0}
                  onClick={() => {
                    move(i, -1);
                  }}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${state.name} down`}
                  disabled={i === entries.length - 1}
                  onClick={() => {
                    move(i, 1);
                  }}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${state.name}`}
                  onClick={() => {
                    remove(entry);
                  }}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
      ) : null}

      {hasImages ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">Images become pages</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="image-fit"
              checked={fitMode === "image"}
              onChange={() => {
                setFitMode("image");
              }}
            />
            Each page the size of its image
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="image-fit"
              checked={fitMode === "paper"}
              onChange={() => {
                setFitMode("paper");
              }}
            />
            Fitted on paper
          </label>
          {fitMode === "paper" ? (
            <div className="grid gap-3 pl-6 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fit-size">Paper size</Label>
                <select
                  id="fit-size"
                  className={selectClass}
                  value={fitSize}
                  onChange={(event) => {
                    setFitSize(event.target.value as PageSizePresetId);
                  }}
                >
                  {FIT_SIZES.map((id) => (
                    <option key={id} value={id}>
                      {PAGE_SIZE_PRESETS[id].label}
                    </option>
                  ))}
                </select>
              </div>
              <ColorChoice
                label="Paper colour"
                name="fit-paper"
                value={fitPaper}
                options={[
                  { color: PAPER_COLOR_PRESETS.white.paperColor, label: "White" },
                  { color: PAPER_COLOR_PRESETS.dark.paperColor, label: "Dark" },
                ]}
                onChange={setFitPaper}
                allowCustom={false}
              />
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="import-title">Title</Label>
          <Input
            id="import-title"
            value={shownTitle}
            maxLength={200}
            placeholder="Imported document"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </div>
        <Button type="submit" disabled={!ready || busy} data-testid="create-import">
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
          Import {entries.length > 1 ? `${String(entries.length)} files` : ""}
        </Button>
      </div>
      {states.some((s) => s.kind === "pdf") ? (
        <p className="text-xs text-muted-foreground">
          PDF pages appear once the PDF has been processed.
        </p>
      ) : null}
    </form>
  );
}
