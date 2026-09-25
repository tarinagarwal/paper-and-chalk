"use client";

import { useDraggable } from "@dnd-kit/core";
import type { LibraryDocument, LibraryScope } from "@pc/schema";
import { MoreHorizontal, Star, Users } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  countLabel,
  formatBytes,
  formatLongDate,
  formatShortDate,
  pagesLabel,
  trashCountdown,
  TYPE_LABELS,
} from "@/lib/library/format";
import { cn } from "@/lib/utils";

import type { DragData } from "./library-dnd";
import { DocumentMenuItems, type MenuHandlers } from "./document-menu";
import { DocumentThumb, DocumentTypeIcon } from "./document-thumb";

export interface DocumentItemProps {
  item: LibraryDocument;
  scope: LibraryScope;
  selected: boolean;
  /** The one item in the view that Tab reaches (roving focus). */
  tabbable: boolean;
  renaming: boolean;
  /** The documents a drag of this item carries (the selection, when it is part of it). */
  dragIds: string[];
  /** The documents the menu acts on. */
  menuTargets: LibraryDocument[];
  handlers: MenuHandlers;
  onPointerSelect: (event: React.MouseEvent, item: LibraryDocument) => void;
  onContextSelect: (item: LibraryDocument) => void;
  onFocusItem: (item: LibraryDocument) => void;
  onRenameEnd: (item: LibraryDocument, title: string | null) => void;
  /** List rows: position in the whole list, for screen readers. */
  rowIndex?: number;
}

/** Title input shown in place while renaming. Enter or leaving saves, Escape cancels. */
function InlineRename({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (title: string | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const done = (title: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(title);
  };
  const stop = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };
  return (
    <input
      ref={ref}
      aria-label="Document name"
      data-testid="rename-input"
      defaultValue={initial}
      maxLength={200}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") done(event.currentTarget.value);
        if (event.key === "Escape") done(null);
      }}
      onBlur={(event) => {
        done(event.currentTarget.value);
      }}
      onClick={stop}
      onDoubleClick={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      className="w-full min-w-0 rounded-sm border border-ring bg-background px-1 py-0.5 text-sm outline-none"
    />
  );
}

function useItemDrag(props: DocumentItemProps) {
  const { item, dragIds, renaming } = props;
  const data: DragData = {
    type: "documents",
    ids: dragIds,
    label: dragIds.length > 1 ? countLabel(dragIds.length) : item.title,
    workspaceId: item.workspaceId,
  };
  return useDraggable({
    id: `document:${item.id}`,
    data,
    disabled: renaming || props.scope.kind === "trash" || !(item.can.edit || item.can.delete),
  });
}

function MoreButton(props: DocumentItemProps & { className?: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          tabIndex={props.tabbable ? 0 : -1}
          aria-label={`More actions for ${props.item.title}`}
          className={cn("shrink-0 text-muted-foreground", props.className)}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
          }}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DocumentMenuItems
          kind="dropdown"
          targets={props.menuTargets}
          scope={props.scope}
          handlers={props.handlers}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Dates depend on the viewer's time zone, so they appear once the page has hydrated. */
function detailLine(item: LibraryDocument, scope: LibraryScope, hydrated: boolean) {
  if (scope.kind === "trash" && item.deletedAt) {
    return hydrated ? trashCountdown(item.deletedAt) : "In the trash";
  }
  const type = TYPE_LABELS[item.type];
  return hydrated ? `${type} · ${formatShortDate(item.updatedAt)}` : type;
}

/** A card in the grid view. */
export function DocumentCard(props: DocumentItemProps) {
  const { item, selected, tabbable, renaming, scope } = props;
  const { setNodeRef, listeners, isDragging } = useItemDrag(props);
  const hydrated = useHydrated();
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          {...listeners}
          role="gridcell"
          aria-selected={selected}
          aria-label={item.title}
          tabIndex={tabbable ? 0 : -1}
          data-item-id={item.id}
          data-testid="library-item"
          onClick={(event) => {
            props.onPointerSelect(event, item);
          }}
          onDoubleClick={() => {
            if (scope.kind !== "trash") props.handlers.open(item);
          }}
          onContextMenu={() => {
            props.onContextSelect(item);
          }}
          onFocus={(event) => {
            if (event.target === event.currentTarget) props.onFocusItem(item);
          }}
          className={cn(
            "group relative flex h-full min-w-0 cursor-default flex-col rounded-xl p-1.5 outline-none select-none",
            "focus-visible:ring-2 focus-visible:ring-ring",
            selected ? "bg-selection/12 ring-2 ring-selection" : "hover:bg-muted/60",
            isDragging && "opacity-50",
          )}
        >
          <div className="relative">
            <DocumentThumb type={item.type} className="aspect-4/3 w-full" />
            <div className="absolute top-2 left-2 flex gap-1">
              {item.favourite ? (
                <span className="rounded-full bg-background/90 p-1 shadow-sm" title="Favourite">
                  <Star aria-label="Favourite" className="size-3 fill-pen-ochre text-pen-ochre" />
                </span>
              ) : null}
              {item.isShared ? (
                <span className="rounded-full bg-background/90 p-1 shadow-sm" title="Shared">
                  <Users aria-label="Shared" className="size-3 text-muted-foreground" />
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex min-w-0 items-start gap-1 px-0.5 pt-2">
            <div className="min-w-0 flex-1">
              {renaming ? (
                <InlineRename
                  initial={item.title}
                  onDone={(title) => {
                    props.onRenameEnd(item, title);
                  }}
                />
              ) : (
                <p className="truncate text-sm font-medium" title={item.title}>
                  {item.title}
                </p>
              )}
              <p
                className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground group-aria-selected:text-foreground/75"
                title={hydrated ? formatLongDate(item.updatedAt) : undefined}
              >
                {item.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag.id}
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: tag.color }}
                  />
                ))}
                <span className="truncate">{detailLine(item, scope, hydrated)}</span>
              </p>
            </div>
            <MoreButton
              {...props}
              className="-mr-1 opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 sm:opacity-0"
            />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <DocumentMenuItems
          kind="context"
          targets={props.menuTargets}
          scope={scope}
          handlers={props.handlers}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** A row in the list view. Columns hide on narrow screens (the header hides the same ones). */
export function DocumentRow(props: DocumentItemProps) {
  const { item, selected, tabbable, renaming, scope } = props;
  const { setNodeRef, listeners, isDragging } = useItemDrag(props);
  const hydrated = useHydrated();
  const when = scope.kind === "trash" && item.deletedAt ? item.deletedAt : item.updatedAt;
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          {...listeners}
          role="row"
          aria-rowindex={props.rowIndex}
          aria-selected={selected}
          tabIndex={tabbable ? 0 : -1}
          data-item-id={item.id}
          data-testid="library-item"
          onClick={(event) => {
            props.onPointerSelect(event, item);
          }}
          onDoubleClick={() => {
            if (scope.kind !== "trash") props.handlers.open(item);
          }}
          onContextMenu={() => {
            props.onContextSelect(item);
          }}
          onFocus={(event) => {
            if (event.target === event.currentTarget) props.onFocusItem(item);
          }}
          className={cn(
            "group flex h-full cursor-default items-center gap-3 rounded-lg px-3 text-sm outline-none select-none",
            "aria-selected:[&_.text-muted-foreground]:text-foreground/75",
            "focus-visible:ring-2 focus-visible:ring-ring",
            selected ? "bg-selection/12 ring-1 ring-selection" : "hover:bg-muted/60",
            isDragging && "opacity-50",
          )}
        >
          <div role="gridcell" className="flex min-w-0 flex-1 items-center gap-3">
            <DocumentTypeIcon type={item.type} className="text-muted-foreground" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {renaming ? (
                <InlineRename
                  initial={item.title}
                  onDone={(title) => {
                    props.onRenameEnd(item, title);
                  }}
                />
              ) : (
                <span className="truncate font-medium" title={item.title}>
                  {item.title}
                </span>
              )}
              {item.favourite ? (
                <Star
                  aria-label="Favourite"
                  className="size-3.5 shrink-0 fill-pen-ochre text-pen-ochre"
                />
              ) : null}
              {item.isShared ? (
                <Users aria-label="Shared" className="size-3.5 shrink-0 text-muted-foreground" />
              ) : null}
              {item.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag.id}
                  className="hidden shrink-0 items-center gap-1 rounded-full border px-1.5 text-[0.6875rem] text-muted-foreground xl:inline-flex"
                >
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full"
                    style={{ background: tag.color }}
                  />
                  {tag.name}
                </span>
              ))}
            </div>
          </div>
          <div role="gridcell" className="hidden w-20 text-muted-foreground md:block">
            {TYPE_LABELS[item.type]}
          </div>
          <div role="gridcell" className="hidden w-32 truncate text-muted-foreground lg:block">
            {item.owner.name}
          </div>
          <div
            role="gridcell"
            className="hidden w-28 text-right text-muted-foreground tabular-nums sm:block"
          >
            {pagesLabel(item.type, item.pageCount)}
          </div>
          <div
            role="gridcell"
            className="hidden w-20 text-right text-muted-foreground tabular-nums md:block"
          >
            {item.bytes > 0 ? formatBytes(item.bytes) : "—"}
          </div>
          <div
            role="gridcell"
            className="w-24 text-right text-muted-foreground tabular-nums"
            title={
              !hydrated
                ? undefined
                : scope.kind === "trash" && item.deletedAt
                  ? trashCountdown(item.deletedAt)
                  : formatLongDate(when)
            }
          >
            {hydrated ? formatShortDate(when) : null}
          </div>
          <div role="gridcell" className="flex w-8 justify-end">
            <MoreButton {...props} />
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <DocumentMenuItems
          kind="context"
          targets={props.menuTargets}
          scope={scope}
          handlers={props.handlers}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
