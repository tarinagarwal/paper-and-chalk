"use client";

import {
  canvasBackgroundCommands,
  commandsHash,
  drawCommands,
  pageCommands,
  type DrawCommand,
} from "@pc/engine";
import type { CanvasBackground, PageBackground } from "@pc/schema";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface PaperPage {
  widthPt: number;
  heightPt: number;
  background: PageBackground;
}

/** The CSS size that fits a page inside a box, keeping its proportions exactly. */
export function fitPage(
  page: { widthPt: number; heightPt: number },
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / page.widthPt, maxHeight / page.heightPt);
  return { width: page.widthPt * scale, height: page.heightPt * scale, scale };
}

function useLoadedImage(url: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
    };
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [url]);
  return url ? image : null;
}

/**
 * One page drawn from its spec with the paper engine: the New dialog's previews and the document
 * page run the same commands, and `data-commands-hash` fingerprints them for tests.
 */
export function PaperCanvas({
  page,
  maxWidth,
  maxHeight,
  imageUrl = null,
  draw = true,
  className,
  label,
  testId = "paper-canvas",
}: {
  page: PaperPage;
  maxWidth: number;
  maxHeight: number;
  /** A signed URL for image pages. */
  imageUrl?: string | null;
  /** False until the page scrolls into view (long documents draw lazily). */
  draw?: boolean;
  className?: string;
  label: string;
  testId?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { width, height, scale } = fitPage(page, maxWidth, maxHeight);
  const commands = useMemo(() => pageCommands(page), [page]);
  const hash = useMemo(() => commandsHash(commands), [commands]);
  const image = useLoadedImage(page.background.kind === "image" ? imageUrl : null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !draw) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawCommands(ctx, commands, {
      scale: scale * ratio,
      widthPt: page.widthPt,
      heightPt: page.heightPt,
    });
    if (image && page.background.kind === "image") {
      const box = { w: page.widthPt, h: page.heightPt };
      const fit =
        page.background.fit === "fill"
          ? { w: box.w, h: box.h }
          : (() => {
              const s = Math.min(box.w / image.naturalWidth, box.h / image.naturalHeight);
              return { w: image.naturalWidth * s, h: image.naturalHeight * s };
            })();
      ctx.save();
      ctx.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0);
      ctx.drawImage(image, (box.w - fit.w) / 2, (box.h - fit.h) / 2, fit.w, fit.h);
      ctx.restore();
    }
  }, [commands, draw, width, height, scale, page, image]);

  return (
    <canvas
      ref={ref}
      // An empty label marks a decorative thumbnail (its button already names it).
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      data-testid={testId}
      data-commands-hash={hash}
      data-width-pt={page.widthPt}
      data-height-pt={page.heightPt}
      style={{ width, height }}
      className={cn("block bg-white shadow-paper", className)}
    />
  );
}

/** An infinite canvas background at a fixed zoom, for the New dialog's preview. */
export function CanvasBackgroundPreview({
  background,
  width,
  height,
  className,
}: {
  background: CanvasBackground;
  width: number;
  height: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const commands: DrawCommand[] = useMemo(
    () => canvasBackgroundCommands(background, { x: 0, y: 0, width, height }),
    [background, width, height],
  );
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (ctx) drawCommands(ctx, commands, { scale: ratio, widthPt: width, heightPt: height });
  }, [commands, width, height]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`${background.pattern === "none" ? "Plain" : background.pattern} background preview`}
      data-testid="canvas-preview"
      data-commands-hash={commandsHash(commands)}
      style={{ width, height }}
      className={cn("block rounded-md border", className)}
    />
  );
}
