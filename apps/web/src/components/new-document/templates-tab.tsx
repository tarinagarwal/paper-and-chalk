"use client";

import type { NewDocument, TemplateView } from "@pc/schema";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CanvasBackgroundPreview, PaperCanvas } from "@/components/paper/paper-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { libraryApi } from "@/lib/library/api";
import { sizeLabel } from "@/lib/new-document/spec";
import { cn } from "@/lib/utils";

export const templatesKey = ["templates"] as const;

function TemplatePreview({ template }: { template: TemplateView }) {
  if (template.firstPage) {
    return (
      <PaperCanvas
        testId="template-preview"
        page={template.firstPage}
        maxWidth={96}
        maxHeight={120}
        label=""
      />
    );
  }
  if (template.canvasBackground) {
    return (
      <CanvasBackgroundPreview background={template.canvasBackground} width={120} height={96} />
    );
  }
  return <span className="h-24 w-20 rounded-sm bg-muted" />;
}

function detail(template: TemplateView) {
  if (template.type === "canvas" || !template.firstPage) return "Infinite canvas";
  const pages = `${String(template.pageCount)} ${template.pageCount === 1 ? "page" : "pages"}`;
  return `${sizeLabel(template.firstPage.widthPt, template.firstPage.heightPt)} · ${pages}`;
}

/** System templates plus the user's own ("My templates"), saved from the document menu. */
export function TemplatesTab({
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
  const templates = useQuery({ queryKey: templatesKey, queryFn: () => libraryApi.templates() });
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);

  const all = [...(templates.data?.mine ?? []), ...(templates.data?.system ?? [])];
  const chosen = all.find((t) => t.id === chosenId) ?? null;

  const remove = async (template: TemplateView) => {
    try {
      await libraryApi.deleteTemplate(template.id);
      if (chosenId === template.id) setChosenId(null);
      await qc.invalidateQueries({ queryKey: templatesKey });
      toast.success(`Deleted the template “${template.name}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the template");
    }
  };

  const section = (label: string, list: TemplateView[], testId: string) => (
    <section aria-label={label} className="flex flex-col gap-2">
      <h3 className="eyebrow text-muted-foreground">{label}</h3>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        data-testid={testId}
      >
        {list.map((template) => {
          const checked = template.id === chosenId;
          return (
            <div key={template.id} className="relative">
              <button
                type="button"
                role="radio"
                aria-checked={checked}
                data-template-id={template.id}
                onClick={() => {
                  setChosenId(template.id);
                  setTitle(null);
                }}
                className={cn(
                  "flex h-full w-full flex-col items-center gap-2 rounded-lg border p-3 text-center hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  checked && "border-primary bg-primary/5 ring-1 ring-primary",
                )}
              >
                <span className="flex h-30 items-center justify-center">
                  <TemplatePreview template={template} />
                </span>
                <span className="text-sm leading-tight font-medium">{template.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {detail(template)}
                </span>
              </button>
              {template.system ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1 right-1"
                  aria-label={`Delete the template ${template.name}`}
                  onClick={() => void remove(template)}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  if (templates.isPending) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-busy>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    );
  }
  if (templates.isError) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p>Couldn&apos;t load templates.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void templates.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const mine = templates.data.mine;
  const shownTitle = title ?? chosen?.name ?? "";

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!chosen) return;
        onCreate({
          kind: "template",
          workspaceId,
          folderId,
          title: shownTitle.trim() || chosen.name,
          templateId: chosen.id,
        });
      }}
    >
      {mine.length > 0 ? (
        section("My templates", mine, "my-templates")
      ) : (
        <p className="text-sm text-muted-foreground">
          Save any notebook or board as a template from its menu in the library, and it shows up
          here.
        </p>
      )}
      {section("Templates", templates.data.system, "system-templates")}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="template-title">Title</Label>
          <Input
            id="template-title"
            value={shownTitle}
            maxLength={200}
            disabled={!chosen}
            placeholder="Choose a template"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </div>
        <Button type="submit" disabled={!chosen || busy} data-testid="create-from-template">
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : null}
          Use template
        </Button>
      </div>
    </form>
  );
}
