"use client";

import type { LibraryDocument, LibraryScope } from "@pc/schema";
import {
  ArrowUpRight,
  Copy,
  FolderInput,
  PencilLine,
  Plus,
  RotateCcw,
  Star,
  StarOff,
  Tag,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import {
  ContextMenuCheckboxItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { useLibraryActions } from "@/hooks/use-library-actions";
import { useSidebarData } from "@/hooks/use-library-data";
import { countLabel } from "@/lib/library/format";

/** Actions that need a dialog or a change of mode; the library view provides them. */
export interface MenuHandlers {
  open: (item: LibraryDocument) => void;
  rename: (item: LibraryDocument) => void;
  move: (targets: LibraryDocument[]) => void;
  purge: (targets: LibraryDocument[]) => void;
  newTag: (targets: LibraryDocument[]) => void;
}

type Kind = "context" | "dropdown";

interface Entry {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  shortcut?: string;
  destructive?: boolean;
}

function Item({ kind, entry }: { kind: Kind; entry: Entry }) {
  const content = (
    <>
      <entry.icon aria-hidden />
      {entry.label}
    </>
  );
  const variant = entry.destructive ? "destructive" : "default";
  if (kind === "context") {
    return (
      <ContextMenuItem variant={variant} onSelect={entry.onSelect}>
        {content}
        {entry.shortcut ? <ContextMenuShortcut>{entry.shortcut}</ContextMenuShortcut> : null}
      </ContextMenuItem>
    );
  }
  return (
    <DropdownMenuItem variant={variant} onSelect={entry.onSelect}>
      {content}
      {entry.shortcut ? <DropdownMenuShortcut>{entry.shortcut}</DropdownMenuShortcut> : null}
    </DropdownMenuItem>
  );
}

function Separator({ kind }: { kind: Kind }) {
  return kind === "context" ? <ContextMenuSeparator /> : <DropdownMenuSeparator />;
}

/** Tick the workspace's tags on or off for the targets (all, some or none have each tag). */
function TagsSubmenu({
  kind,
  targets,
  workspaceId,
  onNewTag,
}: {
  kind: Kind;
  targets: LibraryDocument[];
  workspaceId: string;
  onNewTag: () => void;
}) {
  const { sidebar, isPending } = useSidebarData(workspaceId);
  const actions = useLibraryActions();
  const ids = targets.map((t) => t.id);
  const Sub = kind === "context" ? ContextMenuSub : DropdownMenuSub;
  const Trigger = kind === "context" ? ContextMenuSubTrigger : DropdownMenuSubTrigger;
  const Content = kind === "context" ? ContextMenuSubContent : DropdownMenuSubContent;
  const Check = kind === "context" ? ContextMenuCheckboxItem : DropdownMenuCheckboxItem;

  return (
    <Sub>
      <Trigger>
        <Tag aria-hidden />
        Tags
      </Trigger>
      <Content className="max-h-80 min-w-44 overflow-y-auto">
        {sidebar.tags.map((tag) => {
          const having = targets.filter((t) => t.tags.some((x) => x.id === tag.id)).length;
          const checked = having === targets.length ? true : having > 0 ? "indeterminate" : false;
          return (
            <Check
              key={tag.id}
              checked={checked}
              onSelect={(event) => {
                event.preventDefault();
              }}
              onCheckedChange={() => {
                void (checked === true ? actions.removeTag(ids, tag) : actions.addTag(ids, tag));
              }}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ background: tag.color }} />
              {tag.name}
            </Check>
          );
        })}
        {!isPending && sidebar.tags.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No tags in this workspace yet</p>
        ) : null}
        <Separator kind={kind} />
        <Item kind={kind} entry={{ label: "New tag…", icon: Plus, onSelect: onNewTag }} />
      </Content>
    </Sub>
  );
}

/**
 * The document actions (SPEC.md section 5) for one document or a selection, as a right-click
 * menu or a "more" dropdown. Only actions every target allows are offered.
 */
export function DocumentMenuItems({
  kind,
  targets,
  scope,
  handlers,
}: {
  kind: Kind;
  targets: LibraryDocument[];
  scope: LibraryScope;
  handlers: MenuHandlers;
}) {
  const actions = useLibraryActions();
  const [first] = targets;
  if (!first) return null;
  const single = targets.length === 1 ? first : null;
  const ids = targets.map((t) => t.id);
  const all = (can: keyof LibraryDocument["can"]) => targets.every((t) => t.can[can]);
  const oneWorkspace = targets.every((t) => t.workspaceId === first.workspaceId);
  const plural = targets.length > 1 ? ` ${countLabel(targets.length)}` : "";

  if (scope.kind === "trash") {
    return (
      <>
        {all("restore") ? (
          <Item
            kind={kind}
            entry={{
              label: `Restore${plural}`,
              icon: RotateCcw,
              onSelect: () => void actions.restore(ids),
            }}
          />
        ) : null}
        {all("purge") ? (
          <Item
            kind={kind}
            entry={{
              label: `Delete forever${plural}`,
              icon: Trash2,
              destructive: true,
              onSelect: () => {
                handlers.purge(targets);
              },
            }}
          />
        ) : null}
      </>
    );
  }

  const allFavourite = targets.every((t) => t.favourite);
  return (
    <>
      {single ? (
        <Item
          kind={kind}
          entry={{
            label: "Open",
            icon: ArrowUpRight,
            shortcut: "↵",
            onSelect: () => {
              handlers.open(single);
            },
          }}
        />
      ) : null}
      {single?.can.edit ? (
        <Item
          kind={kind}
          entry={{
            label: "Rename",
            icon: PencilLine,
            shortcut: "F2",
            onSelect: () => {
              handlers.rename(single);
            },
          }}
        />
      ) : null}
      {single?.can.duplicate ? (
        <Item
          kind={kind}
          entry={{ label: "Duplicate", icon: Copy, onSelect: () => void actions.duplicate(single) }}
        />
      ) : null}
      {all("edit") && oneWorkspace ? (
        <>
          <Item
            kind={kind}
            entry={{
              label: `Move to…`,
              icon: FolderInput,
              onSelect: () => {
                handlers.move(targets);
              },
            }}
          />
          <TagsSubmenu
            kind={kind}
            targets={targets}
            workspaceId={first.workspaceId}
            onNewTag={() => {
              handlers.newTag(targets);
            }}
          />
        </>
      ) : null}
      <Item
        kind={kind}
        entry={{
          label: allFavourite ? "Remove from favourites" : "Add to favourites",
          icon: allFavourite ? StarOff : Star,
          onSelect: () => void actions.favourite(ids, !allFavourite),
        }}
      />
      {all("delete") ? (
        <>
          <Separator kind={kind} />
          <Item
            kind={kind}
            entry={{
              label: `Move to trash${plural}`,
              icon: Trash2,
              shortcut: "Del",
              destructive: true,
              onSelect: () => void actions.trash(ids),
            }}
          />
        </>
      ) : null}
    </>
  );
}
