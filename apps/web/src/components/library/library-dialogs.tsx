"use client";

import {
  FOLDER_ICONS,
  LIBRARY_COLORS,
  folderNameSchema,
  smartFolderNameSchema,
  tagNameSchema,
  type FolderIcon,
  type FolderView,
  type LibraryDocument,
} from "@pc/schema";
import { Check, FileText, Folder, Loader2, NotebookPen, Shapes } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { childrenOf } from "@/hooks/use-sidebar-actions";
import { useSidebarData } from "@/hooks/use-library-data";
import { countLabel } from "@/lib/library/format";
import { cn } from "@/lib/utils";

import {
  COLOR_NAMES,
  FOLDER_ICON_COMPONENTS,
  FOLDER_ICON_LABELS,
  FolderGlyph,
} from "./folder-icon";

const titleClass = "font-display text-[1.5rem] leading-tight font-normal tracking-[-0.01em]";

/** Folders in tree order with their depth, for pickers. */
export function flattenTree(
  folders: readonly FolderView[],
): { folder: FolderView; depth: number }[] {
  const out: { folder: FolderView; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childrenOf(folders, parentId)) {
      out.push({ folder, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// ---------------------------------------------------------------------------------------------

/** Pick a folder (or the top level) to move documents into. */
export function MoveDialog({
  targets,
  onClose,
  onMove,
}: {
  targets: LibraryDocument[] | null;
  onClose: () => void;
  onMove: (folderId: string | null, label: string) => void;
}) {
  const workspaceId = targets?.[0]?.workspaceId ?? null;
  const { sidebar, isPending } = useSidebarData(workspaceId);
  const current = new Set(targets?.map((t) => t.folderId));
  const [choice, setChoice] = useState<string>("");
  const tree = flattenTree(sidebar.folders);
  const label = (id: string) =>
    id === "top"
      ? "the top level"
      : (sidebar.folders.find((f) => f.id === id)?.name ?? "the folder");

  return (
    <Dialog
      open={targets !== null}
      onOpenChange={(open) => {
        if (!open) {
          setChoice("");
          onClose();
        }
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md" data-testid="move-dialog">
        <DialogHeader>
          <DialogTitle className={titleClass}>
            Move{" "}
            {targets && targets.length > 1
              ? countLabel(targets.length)
              : `“${targets?.[0]?.title ?? ""}”`}
          </DialogTitle>
          <DialogDescription>Choose where it should live in this workspace.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!choice) return;
            onMove(choice === "top" ? null : choice, label(choice));
            setChoice("");
          }}
          className="flex flex-col gap-5"
        >
          <fieldset className="max-h-72 overflow-y-auto rounded-lg border p-1">
            <legend className="sr-only">Destination</legend>
            {[
              { id: "top", name: "Top level", depth: 0, folder: null as FolderView | null },
              ...tree.map((t) => ({
                id: t.folder.id,
                name: t.folder.name,
                depth: t.depth + 1,
                folder: t.folder,
              })),
            ].map((option) => {
              const isCurrent =
                current.size === 1 && current.has(option.id === "top" ? null : option.id);
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-sm hover:bg-muted has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  )}
                  style={{ paddingLeft: `${String(0.5 + option.depth * 1)}rem` }}
                >
                  <input
                    type="radio"
                    name="destination"
                    value={option.id}
                    checked={choice === option.id}
                    onChange={() => {
                      setChoice(option.id);
                    }}
                    className="sr-only"
                  />
                  {option.folder ? (
                    <FolderGlyph icon={option.folder.icon} color={option.folder.color} />
                  ) : (
                    <Folder aria-hidden className="size-4 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{option.name}</span>
                  {isCurrent ? (
                    <span className="text-xs text-muted-foreground">Current</span>
                  ) : null}
                  {choice === option.id ? <Check aria-hidden className="size-4" /> : null}
                </label>
              );
            })}
            {isPending ? (
              <p className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="size-4 animate-spin" /> Loading folders
              </p>
            ) : null}
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!choice} data-testid="move-submit">
              Move here
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------

export function PurgeDialog({
  targets,
  onClose,
  onConfirm,
}: {
  targets: LibraryDocument[] | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const what =
    targets && targets.length > 1 ? countLabel(targets.length) : `“${targets?.[0]?.title ?? ""}”`;
  return (
    <AlertDialog
      open={targets !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent data-testid="purge-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle className={titleClass}>Delete {what} forever?</AlertDialogTitle>
          <AlertDialogDescription>
            Pages, comments, versions and files go with it. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm} data-testid="purge-confirm">
            Delete forever
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------------------------

const NEW_KINDS = [
  { icon: NotebookPen, title: "Notebook", body: "Pages of paper: ruled, grid, dotted or blank." },
  { icon: Shapes, title: "Board", body: "An infinite canvas for diagrams and brainstorms." },
  { icon: FileText, title: "Import a PDF", body: "Annotate slides, papers and textbooks." },
];

/** The New button's dialog. Creating documents is the next part of the build. */
export function NewDocumentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="gap-5 sm:max-w-lg" data-testid="new-document-dialog">
        <DialogHeader>
          <DialogTitle className={titleClass}>New document</DialogTitle>
          <DialogDescription>Creating documents is coming soon.</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {NEW_KINDS.map((kind) => (
            <li
              key={kind.title}
              aria-disabled
              className="flex items-start gap-3 rounded-lg border p-3 text-sm opacity-70"
            >
              <kind.icon aria-hidden className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{kind.title}</p>
                <p className="text-muted-foreground">{kind.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------

function ColorField({
  value,
  onChange,
  allowNone,
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  allowNone: boolean;
}) {
  const options: (string | null)[] = [...(allowNone ? [null] : []), ...LIBRARY_COLORS];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Colour</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((color) => (
          <label
            key={color ?? "none"}
            title={color ? COLOR_NAMES[color] : "No colour"}
            className="relative flex size-7 cursor-pointer items-center justify-center rounded-full border has-checked:ring-2 has-checked:ring-ring has-checked:ring-offset-2 has-checked:ring-offset-background has-focus-visible:ring-2 has-focus-visible:ring-ring"
            style={color ? { background: color } : undefined}
          >
            <input
              type="radio"
              name="colour"
              className="sr-only"
              checked={value === color}
              onChange={() => {
                onChange(color);
              }}
            />
            <span className="sr-only">{color ? COLOR_NAMES[color] : "No colour"}</span>
            {color === null ? (
              <span aria-hidden className="h-px w-4 rotate-45 bg-muted-foreground" />
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function IconField({
  value,
  onChange,
  color,
}: {
  value: FolderIcon | null;
  onChange: (icon: FolderIcon) => void;
  color: string | null;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Icon</legend>
      <div className="grid grid-cols-6 gap-1.5">
        {FOLDER_ICONS.map((icon) => {
          const Icon = FOLDER_ICON_COMPONENTS[icon];
          return (
            <label
              key={icon}
              title={FOLDER_ICON_LABELS[icon]}
              className="flex h-9 cursor-pointer items-center justify-center rounded-md border hover:bg-muted has-checked:border-ring has-checked:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring"
            >
              <input
                type="radio"
                name="icon"
                className="sr-only"
                checked={(value ?? "folder") === icon}
                onChange={() => {
                  onChange(icon);
                }}
              />
              <span className="sr-only">{FOLDER_ICON_LABELS[icon]}</span>
              <Icon aria-hidden className="size-4" style={color ? { color } : undefined} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface FolderDraft {
  name: string;
  color: string | null;
  icon: FolderIcon | null;
}

/** Create a folder, or change one's name, colour and icon. */
export function FolderDialog({
  open,
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  initial: FolderDraft;
  onClose: () => void;
  onSubmit: (draft: FolderDraft) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastInitial, setLastInitial] = useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setDraft(initial);
    setError(null);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md" data-testid="folder-dialog">
        <DialogHeader>
          <DialogTitle className={titleClass}>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Name, colour and icon of the folder.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const name = folderNameSchema.safeParse(draft.name);
            if (!name.success) {
              setError("Give the folder a name of up to 100 characters.");
              return;
            }
            setSaving(true);
            void onSubmit({ ...draft, name: name.data }).finally(() => {
              setSaving(false);
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="folder-name">Name</Label>
            <Input
              id="folder-name"
              autoFocus
              value={draft.name}
              maxLength={100}
              aria-invalid={error !== null}
              aria-describedby={error ? "folder-name-error" : undefined}
              onChange={(event) => {
                setDraft({ ...draft, name: event.target.value });
                setError(null);
              }}
            />
            {error ? (
              <p id="folder-name-error" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <ColorField
            value={draft.color}
            allowNone
            onChange={(color) => {
              setDraft({ ...draft, color });
            }}
          />
          <IconField
            value={draft.icon}
            color={draft.color}
            onChange={(icon) => {
              setDraft({ ...draft, icon });
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} data-testid="folder-submit">
              {saving ? <Loader2 aria-hidden className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface TagDraft {
  name: string;
  color: string;
}

/** Create a tag, or rename and recolour one. */
export function TagDialog({
  open,
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  submitLabel: string;
  initial: TagDraft;
  onClose: () => void;
  onSubmit: (draft: TagDraft) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastInitial, setLastInitial] = useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setDraft(initial);
    setError(null);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md" data-testid="tag-dialog">
        <DialogHeader>
          <DialogTitle className={titleClass}>{title}</DialogTitle>
          <DialogDescription className="sr-only">Name and colour of the tag.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const name = tagNameSchema.safeParse(draft.name);
            if (!name.success) {
              setError("Give the tag a name of up to 40 characters.");
              return;
            }
            setSaving(true);
            void onSubmit({ ...draft, name: name.data }).finally(() => {
              setSaving(false);
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              autoFocus
              value={draft.name}
              maxLength={40}
              aria-invalid={error !== null}
              aria-describedby={error ? "tag-name-error" : undefined}
              onChange={(event) => {
                setDraft({ ...draft, name: event.target.value });
                setError(null);
              }}
            />
            {error ? (
              <p id="tag-name-error" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <ColorField
            value={draft.color}
            allowNone={false}
            onChange={(color) => {
              if (color) setDraft({ ...draft, color });
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} data-testid="tag-submit">
              {saving ? <Loader2 aria-hidden className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Name the current filter set to keep it as a smart folder. */
export function SmartFolderDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md" data-testid="smart-folder-dialog">
        <DialogHeader>
          <DialogTitle className={titleClass}>Save as smart folder</DialogTitle>
          <DialogDescription>
            A smart folder keeps these filters and this sort. It shows up in your sidebar; only you
            see it.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = smartFolderNameSchema.safeParse(name);
            if (!parsed.success) {
              setError("Give it a name of up to 60 characters.");
              return;
            }
            setSaving(true);
            void onSubmit(parsed.data).finally(() => {
              setSaving(false);
              setName("");
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="smart-folder-name">Name</Label>
            <Input
              id="smart-folder-name"
              autoFocus
              value={name}
              maxLength={60}
              placeholder="e.g. PDFs to review"
              aria-invalid={error !== null}
              aria-describedby={error ? "smart-folder-name-error" : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
            {error ? (
              <p id="smart-folder-name-error" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} data-testid="smart-folder-submit">
              {saving ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Rename something that only has a name (smart folders). */
export function RenameDialog({
  open,
  title,
  initial,
  maxLength,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: string;
  maxLength: number;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  if (lastInitial !== initial) {
    setLastInitial(initial);
    setName(initial);
  }
  const trimmed = name.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="gap-5 sm:max-w-md" data-testid="rename-dialog">
        <DialogHeader>
          <DialogTitle className={titleClass}>{title}</DialogTitle>
          <DialogDescription className="sr-only">Choose a new name.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) void onSubmit(trimmed);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename-name">Name</Label>
            <Input
              id="rename-name"
              autoFocus
              value={name}
              maxLength={maxLength}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
