import type { DocumentType } from "@pc/schema";
import { FileText, NotebookPen, Shapes } from "lucide-react";

import { cn } from "@/lib/utils";

/** Small icon for a document type (list rows, drag chips, search results). */
export function DocumentTypeIcon({ type, className }: { type: DocumentType; className?: string }) {
  const Icon = type === "pdf" ? FileText : type === "canvas" ? Shapes : NotebookPen;
  return <Icon aria-hidden className={cn("size-4 shrink-0", className)} />;
}

/**
 * Placeholder thumbnail until real page renders exist: a ruled sheet for notebooks, a sheet with a
 * PDF label for PDFs, a dotted board for canvases. Paper stays paper in both themes.
 */
export function DocumentThumb({ type, className }: { type: DocumentType; className?: string }) {
  if (type === "canvas") {
    return (
      <div
        aria-hidden
        className={cn(
          "flex items-center justify-center rounded-md border bg-canvas-dots text-muted-foreground",
          className,
        )}
      >
        <Shapes className="size-8 opacity-70" strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div
      aria-hidden
      className={cn("flex items-center justify-center rounded-md border bg-canvas p-3", className)}
    >
      <div className="relative flex aspect-3/4 h-full max-h-full flex-col gap-[9%] rounded-[2px] bg-paper-sheet p-[12%] shadow-paper">
        {type === "pdf" ? (
          <>
            <span className="h-[6%] w-3/4 rounded-full bg-paper-head" />
            <span className="h-[3%] w-full rounded-full bg-paper-line" />
            <span className="h-[3%] w-5/6 rounded-full bg-paper-line" />
            <span className="h-[3%] w-full rounded-full bg-paper-line" />
            <span className="absolute right-[10%] bottom-[8%] rounded-[2px] bg-primary px-1 text-[0.5625rem] leading-4 font-semibold tracking-wide text-primary-foreground">
              PDF
            </span>
          </>
        ) : (
          <>
            <span className="h-[4%] w-1/2 rounded-full bg-paper-head" />
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="h-[2%] w-full rounded-full bg-paper-line" />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
