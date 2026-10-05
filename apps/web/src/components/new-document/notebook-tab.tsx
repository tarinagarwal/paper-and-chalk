"use client";

import {
  LIBRARY_COLORS,
  PAGE_SIZE_PRESETS,
  PAPER_COLOR_PRESETS,
  PAPER_TEMPLATES,
  TEMPLATE_DEFAULTS,
  toPoints,
  type DocumentCover,
  type NewDocument,
  type PageSizePresetView,
  type PaperTemplate,
} from "@pc/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { COLOR_NAMES } from "@/components/library/folder-icon";
import { PaperCanvas } from "@/components/paper/paper-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useUpload } from "@/hooks/use-upload";
import { libraryApi } from "@/lib/library/api";
import {
  defaultNotebookForm,
  notebookSpec,
  sizeLabel,
  withTemplate,
  type CustomUnit,
  type NotebookForm,
} from "@/lib/new-document/spec";
import { cn } from "@/lib/utils";

import { ColorChoice, NumberField, selectClass } from "./fields";

const SIZE_GROUPS: { id: string; label: string }[] = [
  { id: "iso-a", label: "ISO A" },
  { id: "iso-b", label: "ISO B" },
  { id: "iso-c", label: "ISO C" },
  { id: "us", label: "US" },
  { id: "other", label: "Other" },
  { id: "screen", label: "Screens" },
];

const PAPER_OPTIONS = [
  { color: PAPER_COLOR_PRESETS.white.paperColor, label: "White" },
  { color: PAPER_COLOR_PRESETS.cream.paperColor, label: "Cream" },
  { color: PAPER_COLOR_PRESETS.dark.paperColor, label: "Dark" },
];
const LINE_OPTIONS = [
  { color: PAPER_COLOR_PRESETS.white.lineColor, label: "Blue" },
  { color: PAPER_COLOR_PRESETS.grey.lineColor, label: "Grey" },
  { color: PAPER_COLOR_PRESETS.cream.lineColor, label: "Sepia" },
  { color: PAPER_COLOR_PRESETS.dark.lineColor, label: "Slate" },
];

export const pageSizesKey = ["page-sizes"] as const;

/** A cover that is an uploaded image: shown from the local file until the page is created. */
interface ImageCover {
  uploadId: string;
  previewUrl: string;
}

export function NotebookTab({
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
  const qc = useQueryClient();
  const [form, setForm] = useState<NotebookForm>(defaultNotebookForm);
  const [cover, setCover] = useState<string | null>(null);
  const [imageCover, setImageCover] = useState<ImageCover | null>(null);
  const [saveName, setSaveName] = useState("");
  const { uploads, upload } = useUpload();
  const sizes = useQuery({
    queryKey: pageSizesKey,
    queryFn: () => libraryApi.pageSizes().then((r) => r.sizes),
    staleTime: 60_000,
  });
  const saved: PageSizePresetView[] = useMemo(() => sizes.data ?? [], [sizes.data]);
  const result = useMemo(() => notebookSpec(form, saved), [form, saved]);
  const set = (patch: Partial<NotebookForm>) => {
    setForm((f) => ({ ...f, ...patch }));
  };

  const coverUpload = imageCover ? uploads.find((u) => u.id === imageCover.uploadId) : undefined;
  const coverAsset = coverUpload?.state === "done" ? coverUpload.asset : null;
  const coverPending =
    imageCover !== null && coverAsset === null && coverUpload?.state !== "failed";

  const submit = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (!result.ok || coverPending) return;
    const chosenCover: DocumentCover | null =
      imageCover && coverAsset
        ? { kind: "image", assetId: coverAsset.id }
        : cover
          ? { kind: "color", color: cover }
          : null;
    onCreate({
      kind: "notebook",
      workspaceId,
      folderId,
      title: form.title.trim() || "Untitled notebook",
      pageSpec: result.spec,
      pageCount: result.pageCount,
      cover: chosenCover,
    });
  };

  const saveSize = async () => {
    const width = Number.parseFloat(form.customWidth);
    const height = Number.parseFloat(form.customHeight);
    const name = saveName.trim() || `${form.customWidth} × ${form.customHeight} ${form.unit}`;
    try {
      const { size } = await libraryApi.savePageSize({
        name,
        widthPt: toPoints(width, form.unit),
        heightPt: toPoints(height, form.unit),
        unit: form.unit,
      });
      await qc.invalidateQueries({ queryKey: pageSizesKey });
      set({ size: `saved:${size.id}` });
      setSaveName("");
      toast.success(`Saved the page size “${size.name}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the size");
    }
  };

  const previewPage = result.ok
    ? {
        widthPt: result.spec.widthPt,
        heightPt: result.spec.heightPt,
        background: result.spec.background,
      }
    : null;
  const thumbBase = result.ok ? result.spec : null;

  return (
    <form onSubmit={submit} className="grid gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notebook-title">Title</Label>
          <Input
            id="notebook-title"
            value={form.title}
            maxLength={200}
            onChange={(event) => {
              set({ title: event.target.value });
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notebook-size">Page size</Label>
            <select
              id="notebook-size"
              data-testid="notebook-size"
              className={selectClass}
              value={form.size}
              onChange={(event) => {
                set({ size: event.target.value });
              }}
            >
              {SIZE_GROUPS.map((group) => (
                <optgroup key={group.id} label={group.label}>
                  {Object.entries(PAGE_SIZE_PRESETS)
                    .filter(([, preset]) => preset.group === group.id)
                    .map(([id, preset]) => (
                      <option key={id} value={id}>
                        {preset.label} (
                        {sizeLabel(
                          preset.widthPt,
                          preset.heightPt,
                          group.id === "us" ? "in" : "mm",
                        )}
                        )
                      </option>
                    ))}
                </optgroup>
              ))}
              {saved.length > 0 ? (
                <optgroup label="My sizes">
                  {saved.map((p) => (
                    <option key={p.id} value={`saved:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <option value="custom">Custom size…</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium" id="orientation-label">
              Orientation
            </span>
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="orientation-label"
              value={form.orientation}
              onValueChange={(value) => {
                if (value === "portrait" || value === "landscape") set({ orientation: value });
              }}
            >
              <ToggleGroupItem value="portrait">Portrait</ToggleGroupItem>
              <ToggleGroupItem value="landscape">Landscape</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {form.size === "custom" ? (
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_6rem]">
            <NumberField
              id="custom-width"
              label="Width"
              value={form.customWidth}
              onChange={(v) => {
                set({ customWidth: v });
              }}
              min={0}
            />
            <NumberField
              id="custom-height"
              label="Height"
              value={form.customHeight}
              onChange={(v) => {
                set({ customHeight: v });
              }}
              min={0}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="custom-unit">Unit</Label>
              <select
                id="custom-unit"
                className={selectClass}
                value={form.unit}
                onChange={(event) => {
                  set({ unit: event.target.value as CustomUnit });
                }}
              >
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="in">in</option>
                <option value="px">px</option>
              </select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="custom-name">Save as</Label>
                <Input
                  id="custom-name"
                  placeholder="e.g. Pocket notebook"
                  value={saveName}
                  maxLength={40}
                  onChange={(event) => {
                    setSaveName(event.target.value);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!result.ok}
                onClick={() => void saveSize()}
              >
                Save size
              </Button>
            </div>
          </div>
        ) : null}

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Paper</legend>
          <div
            role="radiogroup"
            aria-label="Paper template"
            className="grid grid-cols-3 gap-2 sm:grid-cols-6"
            data-testid="template-picker"
          >
            {PAPER_TEMPLATES.map((template: PaperTemplate) => {
              const checked = form.template === template;
              return (
                <button
                  key={template}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  data-template={template}
                  onClick={() => {
                    setForm((f) => withTemplate(f, template));
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center text-[0.6875rem] leading-tight hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    checked && "border-primary bg-primary/5 ring-1 ring-primary",
                  )}
                >
                  {thumbBase ? (
                    <PaperCanvas
                      testId="template-thumb"
                      label=""
                      maxWidth={56}
                      maxHeight={72}
                      page={{
                        widthPt: thumbBase.widthPt,
                        heightPt: thumbBase.heightPt,
                        background: {
                          kind: "paper",
                          template,
                          paperColor: form.paperColor,
                          lineColor: form.lineColor,
                          spacingPt: TEMPLATE_DEFAULTS[template].spacingPt,
                          marginPt: TEMPLATE_DEFAULTS[template].marginPt,
                        },
                      }}
                    />
                  ) : (
                    <span className="h-18 w-14 rounded-sm bg-muted" />
                  )}
                  {TEMPLATE_DEFAULTS[template].label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorChoice
            label="Paper colour"
            name="paper-colour"
            value={form.paperColor}
            options={PAPER_OPTIONS}
            onChange={(paperColor) => {
              set({ paperColor });
            }}
          />
          <ColorChoice
            label="Line colour"
            name="line-colour"
            value={form.lineColor}
            options={LINE_OPTIONS}
            onChange={(lineColor) => {
              set({ lineColor });
            }}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mt-2 self-start"
          onClick={() => {
            set({
              paperColor: PAPER_COLOR_PRESETS.dark.paperColor,
              lineColor: PAPER_COLOR_PRESETS.dark.lineColor,
            });
          }}
        >
          Use dark paper
        </Button>

        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="spacing"
            label="Line spacing"
            unit="mm"
            value={form.spacingMm}
            min={1}
            max={70}
            onChange={(v) => {
              set({ spacingMm: v });
            }}
          />
          <NumberField
            id="margin"
            label="Margin"
            unit="mm"
            value={form.marginMm}
            min={0}
            onChange={(v) => {
              set({ marginMm: v });
            }}
          />
          <NumberField
            id="page-count"
            label="Pages"
            value={form.pageCount}
            min={1}
            max={500}
            step={1}
            onChange={(v) => {
              set({ pageCount: v });
            }}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Cover</legend>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-7 cursor-pointer items-center rounded-full border px-2.5 text-xs has-checked:ring-2 has-checked:ring-ring has-focus-visible:ring-2 has-focus-visible:ring-ring">
              <input
                type="radio"
                name="cover"
                className="sr-only"
                checked={cover === null && imageCover === null}
                onChange={() => {
                  setCover(null);
                  setImageCover(null);
                }}
              />
              None
            </label>
            {LIBRARY_COLORS.map((color) => (
              <label
                key={color}
                title={COLOR_NAMES[color]}
                className="size-7 cursor-pointer rounded-full border has-checked:ring-2 has-checked:ring-ring has-checked:ring-offset-2 has-checked:ring-offset-background has-focus-visible:ring-2 has-focus-visible:ring-ring"
                style={{ background: color }}
              >
                <input
                  type="radio"
                  name="cover"
                  className="sr-only"
                  checked={cover === color && imageCover === null}
                  onChange={() => {
                    setCover(color);
                    setImageCover(null);
                  }}
                />
                <span className="sr-only">{COLOR_NAMES[color]} cover</span>
              </label>
            ))}
            <label className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs has-focus-visible:ring-2 has-focus-visible:ring-ring">
              <ImagePlus aria-hidden className="size-3.5" />
              Image…
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                data-testid="cover-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const [uploadId] = upload([file], { workspaceId, documentId: null });
                  if (uploadId) setImageCover({ uploadId, previewUrl: URL.createObjectURL(file) });
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {imageCover ? (
            <div className="flex items-center gap-3 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob URL), not a site image */}
              <img
                src={imageCover.previewUrl}
                alt="Cover preview"
                className="h-12 w-9 rounded-sm object-cover shadow-paper"
              />
              <span className="text-muted-foreground">
                {coverUpload?.state === "failed"
                  ? coverUpload.error
                  : coverAsset
                    ? "Cover ready"
                    : "Uploading cover…"}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove cover image"
                onClick={() => {
                  setImageCover(null);
                }}
              >
                <X aria-hidden />
              </Button>
            </div>
          ) : null}
        </fieldset>
      </div>

      <aside className="flex flex-col gap-3 md:sticky md:top-0 md:self-start">
        <div
          className="flex min-h-72 items-center justify-center rounded-lg border bg-canvas p-4"
          data-testid="notebook-preview"
        >
          {previewPage ? (
            <PaperCanvas
              testId="paper-preview"
              page={previewPage}
              maxWidth={232}
              maxHeight={300}
              label="Preview of the first page"
            />
          ) : (
            <p className="text-center text-sm text-destructive" role="alert">
              {result.ok ? null : result.error}
            </p>
          )}
        </div>
        {result.ok ? (
          <p
            className="text-center text-xs text-muted-foreground tabular-nums"
            data-testid="preview-size"
          >
            {sizeLabel(result.spec.widthPt, result.spec.heightPt)} · {result.pageCount}{" "}
            {result.pageCount === 1 ? "page" : "pages"}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={!result.ok || busy || coverPending}
          data-testid="create-notebook"
        >
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
          Create notebook
        </Button>
      </aside>
    </form>
  );
}
