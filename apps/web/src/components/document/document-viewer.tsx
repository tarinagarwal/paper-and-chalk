"use client";

import type { CanvasBackground, DocumentSource, DocumentType, PageBackground } from "@pc/schema";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, FileText, ImageIcon, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CanvasBackgroundPreview, PaperCanvas } from "@/components/paper/paper-canvas";
import { libraryApi } from "@/lib/library/api";
import { pagesLabel, TYPE_LABELS } from "@/lib/library/format";
import { pageSizeName } from "@/lib/new-document/spec";

export interface ViewerPage {
  id: string;
  widthPt: number;
  heightPt: number;
  background: PageBackground;
}

export interface ViewerDocument {
  id: string;
  title: string;
  type: DocumentType;
  workspaceId: string;
  folderId: string | null;
  trashed: boolean;
  canvasBackground: CanvasBackground | null;
  sources: DocumentSource[];
  pages: ViewerPage[];
}

/** CSS pixels per point at 100 %: pages show at their real size when there is room. */
const ACTUAL_SIZE = 96 / 72;

/** The width of an element, followed as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width] as const;
}

/** One page, drawn once it comes near the screen; image pages fetch their signed URL then. */
function DocumentPage({
  page,
  index,
  documentId,
  scale,
}: {
  page: ViewerPage;
  index: number;
  documentId: string;
  scale: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [near]);

  const assetId = page.background.kind === "image" ? page.background.assetId : null;
  const imageUrl = useQuery({
    queryKey: ["asset-url", documentId, assetId],
    queryFn: () => libraryApi.assetUrl(assetId ?? "", documentId).then((r) => r.url),
    enabled: near && assetId !== null,
    // Signed URLs last 15 minutes.
    staleTime: 10 * 60_000,
  });

  const label = `Page ${String(index + 1)} · ${pageSizeName(page.widthPt, page.heightPt)}`;
  return (
    <figure ref={ref} className="flex flex-col items-center gap-2">
      <PaperCanvas
        testId="document-page"
        page={page}
        maxWidth={page.widthPt * scale}
        maxHeight={page.heightPt * scale}
        imageUrl={imageUrl.data ?? null}
        draw={near}
        label={label}
      />
      <figcaption className="text-xs text-muted-foreground tabular-nums">{label}</figcaption>
    </figure>
  );
}

function SourceList({ sources }: { sources: DocumentSource[] }) {
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Imported files">
      {sources.map((source) => {
        const Icon = source.kind === "pdf" ? FileText : ImageIcon;
        return (
          <li key={source.assetId} className="flex items-center gap-2 text-sm">
            <Icon aria-hidden className="size-4 text-muted-foreground" />
            <span className="truncate">{source.fileName}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A document's pages at their real proportions, drawn with the paper engine (the New dialog's
 * previews use the same commands). View only: drawing arrives with the editor.
 */
export function DocumentViewer({ document }: { document: ViewerDocument }) {
  const [areaRef, areaWidth] = useWidth<HTMLDivElement>();
  const widest = Math.max(1, ...document.pages.map((p) => p.widthPt));
  // One scale for the whole document, so pages of different sizes compare truthfully.
  const scale = areaWidth > 0 ? Math.min(ACTUAL_SIZE, areaWidth / widest) : 0;
  const pdfSources = document.sources.filter((s) => s.kind === "pdf");
  const back = document.folderId ? `/app/folders/${document.folderId}` : "/app";

  return (
    <div className="flex flex-1 flex-col px-4 pb-16 sm:px-8" data-testid="document-viewer">
      <header className="flex flex-col gap-2 pt-6 pb-6 sm:pt-8">
        <Link
          href={back}
          className="-ml-1 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Library
        </Link>
        <h1 className="font-display text-h2 leading-tight">{document.title}</h1>
        <p className="eyebrow text-muted-foreground" data-testid="document-meta">
          {TYPE_LABELS[document.type]}
          {document.type === "canvas"
            ? null
            : ` · ${pagesLabel(document.type, document.pages.length)}`}
        </p>
      </header>

      {document.trashed ? (
        <div
          className="flex max-w-lg flex-col items-start gap-3 rounded-lg border p-5"
          role="status"
        >
          <Trash2 aria-hidden className="size-5 text-muted-foreground" />
          <p>This document is in the trash. Restore it to open it again.</p>
          <Link href="/app/trash" className="text-sm font-medium text-primary hover:underline">
            Go to the trash
          </Link>
        </div>
      ) : (
        <div ref={areaRef} className="flex flex-col gap-8">
          {pdfSources.length > 0 ? (
            <div
              className="flex max-w-xl flex-col gap-3 rounded-lg border p-4"
              data-testid="pdf-pending"
              role="status"
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <Loader2 aria-hidden className="size-4 animate-spin" />
                {pdfSources.length === 1
                  ? "PDF pages appear here once the file has been processed."
                  : "PDF pages appear here once the files have been processed."}
              </p>
              <SourceList sources={document.sources} />
            </div>
          ) : null}

          {document.type === "canvas" && document.canvasBackground && areaWidth > 0 ? (
            <CanvasBackgroundPreview
              background={document.canvasBackground}
              width={areaWidth}
              height={Math.round(Math.min(640, areaWidth * 0.62))}
            />
          ) : null}

          {scale > 0 ? (
            <ol className="flex flex-col items-center gap-8" aria-label="Pages">
              {document.pages.map((page, index) => (
                <li key={page.id}>
                  <DocumentPage page={page} index={index} documentId={document.id} scale={scale} />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}
    </div>
  );
}
