"use client";

import type { NewDocument } from "@pc/schema";
import { FileUp, LayoutTemplate, NotebookPen, Shapes } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { libraryApi } from "@/lib/library/api";

import { CanvasTab } from "./canvas-tab";
import { ImportTab, type ImportEntry } from "./import-tab";
import { NotebookTab } from "./notebook-tab";
import { TemplatesTab } from "./templates-tab";

export type NewDocumentTab = "notebook" | "canvas" | "import" | "templates";

const TABS: { id: NewDocumentTab; label: string; icon: typeof NotebookPen }[] = [
  { id: "notebook", label: "Notebook", icon: NotebookPen },
  { id: "canvas", label: "Infinite canvas", icon: Shapes },
  { id: "import", label: "Import", icon: FileUp },
  { id: "templates", label: "Templates", icon: LayoutTemplate },
];

/**
 * The New dialog (SPEC.md section 6). Mounted fresh each time it opens, so every tab starts from
 * its defaults. Creating writes the document and opens it.
 */
export function NewDocumentDialog({
  workspaceId,
  folderId,
  initialTab = "notebook",
  initialEntries = [],
  onClose,
  onCreated,
}: {
  workspaceId: string;
  folderId: string | null;
  initialTab?: NewDocumentTab;
  /** Files dropped on the library, already uploading. */
  initialEntries?: ImportEntry[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<NewDocumentTab>(initialTab);
  const [busy, setBusy] = useState(false);

  const create = async (input: NewDocument) => {
    setBusy(true);
    try {
      const { id, url } = await libraryApi.createDocument(input);
      onCreated(id);
      router.push(url);
    } catch (error) {
      setBusy(false);
      toast.error(error instanceof Error ? error.message : "Couldn't create the document");
    }
  };

  const props = {
    workspaceId,
    folderId,
    busy,
    onCreate: (input: NewDocument) => void create(input),
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto sm:max-w-3xl"
        data-testid="new-document-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-[1.5rem] leading-tight font-normal tracking-[-0.01em]">
            New document
          </DialogTitle>
          <DialogDescription>
            A notebook of pages, an infinite canvas, files you already have, or a template.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab}
          onValueChange={(value) => {
            const next = TABS.find((t) => t.id === value);
            if (next) setTab(next.id);
          }}
        >
          <TabsList className="h-auto w-full flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                // The upstream 60 % text is below AA contrast on the muted track in Paper.
                className="min-w-fit text-foreground/80"
              >
                <t.icon aria-hidden />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="notebook" className="pt-3">
            <NotebookTab {...props} />
          </TabsContent>
          <TabsContent value="canvas" className="pt-3">
            <CanvasTab {...props} />
          </TabsContent>
          {/* Kept mounted so files keep their place in the list while you look at other tabs. */}
          <TabsContent value="import" forceMount className="pt-3 data-[state=inactive]:hidden">
            <ImportTab {...props} initialEntries={initialEntries} />
          </TabsContent>
          <TabsContent value="templates" className="pt-3">
            <TemplatesTab {...props} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
