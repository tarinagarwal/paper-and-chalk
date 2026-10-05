"use client";

import {
  CANVAS_PATTERNS,
  DEFAULT_CANVAS_BACKGROUND,
  fromPoints,
  PAPER_COLOR_PRESETS,
  toPoints,
  type CanvasBackground,
  type NewDocument,
} from "@pc/schema";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { CanvasBackgroundPreview } from "@/components/paper/paper-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { ColorChoice, NumberField } from "./fields";

const PATTERN_LABELS: Record<CanvasBackground["pattern"], string> = {
  none: "None",
  dots: "Dots",
  grid: "Grid",
  lines: "Lines",
};

const MARK_OPTIONS = [
  { color: DEFAULT_CANVAS_BACKGROUND.color, label: "Pencil" },
  { color: PAPER_COLOR_PRESETS.white.lineColor, label: "Blue" },
  { color: "#9aa3ad", label: "Slate" },
];
const PAPER_OPTIONS = [
  { color: DEFAULT_CANVAS_BACKGROUND.paperColor, label: "Paper" },
  { color: "#ffffff", label: "White" },
  { color: "#1d1e21", label: "Chalkboard" },
];

/** An infinite canvas: background pattern, spacing and colours; it starts blank. */
export function CanvasTab({
  workspaceId,
  folderId,
  busy,
  onCreate,
}: {
  workspaceId: string;
  folderId: string | null;
  busy: boolean;
  onCreate: (input: NewDocument) => void;
}) {
  const [title, setTitle] = useState("Untitled board");
  const [background, setBackground] = useState<CanvasBackground>(DEFAULT_CANVAS_BACKGROUND);
  const [spacingMm, setSpacingMm] = useState(
    String(Math.round(fromPoints(DEFAULT_CANVAS_BACKGROUND.spacingPt, "mm") * 10) / 10),
  );
  const spacingPt = toPoints(Number.parseFloat(spacingMm), "mm");
  const valid = spacingPt >= 2 && spacingPt <= 400;
  const effective: CanvasBackground = valid ? { ...background, spacingPt } : background;

  return (
    <form
      className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        onCreate({
          kind: "canvas",
          workspaceId,
          folderId,
          title: title.trim() || "Untitled board",
          canvasBackground: effective,
        });
      }}
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="canvas-title">Title</Label>
          <Input
            id="canvas-title"
            value={title}
            maxLength={200}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium" id="pattern-label">
            Background
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby="pattern-label"
            value={background.pattern}
            onValueChange={(value) => {
              const pattern = CANVAS_PATTERNS.find((p) => p === value);
              if (pattern) setBackground((b) => ({ ...b, pattern }));
            }}
          >
            {CANVAS_PATTERNS.map((pattern) => (
              <ToggleGroupItem key={pattern} value={pattern}>
                {PATTERN_LABELS[pattern]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="max-w-40">
          <NumberField
            id="canvas-spacing"
            label="Spacing"
            unit="mm"
            value={spacingMm}
            min={1}
            max={140}
            onChange={setSpacingMm}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorChoice
            label="Mark colour"
            name="canvas-marks"
            value={background.color}
            options={MARK_OPTIONS}
            onChange={(color) => {
              setBackground((b) => ({ ...b, color }));
            }}
          />
          <ColorChoice
            label="Background colour"
            name="canvas-paper"
            value={background.paperColor}
            options={PAPER_OPTIONS}
            onChange={(paperColor) => {
              setBackground((b) => ({ ...b, paperColor }));
            }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Starts blank: an empty board you can pan and zoom in any direction.
        </p>
      </div>
      <aside className="flex flex-col gap-3">
        <CanvasBackgroundPreview background={effective} width={272} height={200} />
        {valid ? null : (
          <p className="text-sm text-destructive" role="alert">
            Spacing must be between 1 and 140 mm
          </p>
        )}
        <Button type="submit" disabled={!valid || busy} data-testid="create-canvas">
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
          Create board
        </Button>
      </aside>
    </form>
  );
}
