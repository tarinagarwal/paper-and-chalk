import { TRASH_RETENTION_DAYS, type LibraryScope } from "@pc/schema";

import { Button } from "@/components/ui/button";

const COPY: Record<LibraryScope["kind"], { title: string; body: string }> = {
  home: {
    title: "Nothing here yet",
    body: "Your notebooks, PDFs and boards will live here, along with anything people share with you.",
  },
  folder: {
    title: "This folder is empty",
    body: "Drag documents onto the folder in the sidebar, or use Move to… from a document's menu.",
  },
  tag: {
    title: "No documents with this tag",
    body: "Tag documents from their menu, or select several and tag them together.",
  },
  trash: {
    title: "The trash is empty",
    body: `Deleted documents stay here for ${String(TRASH_RETENTION_DAYS)} days, then they're gone for good.`,
  },
  recents: {
    title: "Nothing opened yet",
    body: "Documents you open show up here, newest first.",
  },
  favourites: {
    title: "No favourites yet",
    body: "Add a document to your favourites from its menu to keep it here.",
  },
  shared: {
    title: "Nothing shared with you yet",
    body: "When someone shares a document with you, it appears here.",
  },
  search: {
    title: "No titles match",
    body: "Check the spelling, or try fewer or different words.",
  },
};

/** What an empty library view says, with the paper-sheets illustration. */
export function LibraryEmpty({
  scope,
  filtered,
  onClearFilters,
  onNew,
}: {
  scope: LibraryScope;
  filtered: boolean;
  onClearFilters: () => void;
  onNew: (() => void) | null;
}) {
  const copy = filtered
    ? {
        title: "No documents match these filters",
        body: "Change or clear the filters to see more.",
      }
    : COPY[scope.kind];
  return (
    <section
      aria-label="No documents"
      data-testid="library-empty"
      className="flex min-h-[22rem] flex-1 flex-col items-center justify-center gap-5 rounded-2xl border border-dashed bg-canvas-dots p-8 text-center"
    >
      <div aria-hidden className="relative h-24 w-32">
        <div className="absolute top-2 left-3 h-20 w-16 -rotate-6 rounded-[2px] bg-paper-sheet shadow-paper" />
        <div className="absolute top-0 left-12 flex h-20 w-16 rotate-3 flex-col gap-1.5 rounded-[2px] bg-paper-sheet p-2.5 shadow-paper">
          <span className="h-1 w-8 rounded-full bg-paper-head" />
          <span className="h-0.5 w-full rounded-full bg-paper-line" />
          <span className="h-0.5 w-full rounded-full bg-paper-line" />
          <span className="h-0.5 w-3/4 rounded-full bg-paper-line" />
        </div>
      </div>
      <div className="flex max-w-sm flex-col gap-2">
        <h2 className="font-display text-[1.5rem] leading-tight">{copy.title}</h2>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{copy.body}</p>
      </div>
      {filtered ? (
        <Button variant="outline" onClick={onClearFilters}>
          Clear filters
        </Button>
      ) : scope.kind === "home" && onNew ? (
        <Button onClick={onNew}>New document</Button>
      ) : null}
    </section>
  );
}
