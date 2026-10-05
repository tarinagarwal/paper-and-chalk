"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useStorageBreakdown, useStorageData } from "@/hooks/use-library-data";
import { formatBytes } from "@/lib/library/format";

function Row({ label, bytes }: { label: string; bytes: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{formatBytes(bytes)}</dd>
    </div>
  );
}

/** Where the storage goes: files in documents, files in none, and the largest documents. */
function StorageDetails({ onNavigate }: { onNavigate: () => void }) {
  const { data, isError } = useStorageBreakdown(true);
  if (isError) return <p className="text-sm">Couldn&apos;t load the details.</p>;
  if (!data) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-testid="storage-details">
      <dl className="flex flex-col gap-1.5">
        <Row label="In documents" bytes={data.inDocumentsBytes} />
        <Row label="Not in any document" bytes={data.unattachedBytes} />
      </dl>
      <div className="flex flex-col gap-1.5">
        <h3 className="eyebrow text-muted-foreground">Largest documents</h3>
        {data.largest.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files in your documents yet.</p>
        ) : (
          <ol className="flex flex-col">
            {data.largest.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/app/d/${doc.id}`}
                  onClick={onNavigate}
                  className="-mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1 text-sm hover:bg-muted"
                >
                  <span className="truncate">{doc.title}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {formatBytes(doc.bytes)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Link
        href="/app?sort=size"
        onClick={onNavigate}
        className="flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline"
      >
        Sort the library by size
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}

/** The sidebar's storage meter; its details open in a popover. */
export function StorageMeter() {
  const { data } = useStorageData();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const percent = Math.min(100, Math.round((data.usedBytes / data.limitBytes) * 100));
  return (
    <div
      className="flex flex-col gap-1.5 px-2 py-1 group-data-[collapsible=icon]:hidden"
      data-testid="storage-meter"
    >
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">Storage</span>
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(data.usedBytes)} of {formatBytes(data.limitBytes)}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={`Storage used: ${String(percent)}%`}
        className="h-1.5"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          data-testid="storage-details-trigger"
        >
          What is using it?
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-72">
          <StorageDetails
            onNavigate={() => {
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
