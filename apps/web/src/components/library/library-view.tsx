"use client";

import {
  activeFilterCount,
  EMPTY_FILTERS,
  LIBRARY_PAGE_SIZE,
  viewToParams,
  type LibraryDocument,
  type LibraryPage,
  type LibraryScope,
  type LibraryView as ViewState,
  type SmartFolderView,
} from "@pc/schema";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, FolderInput, MoreHorizontal, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useLibraryActions } from "@/hooks/use-library-actions";
import { useSidebarData } from "@/hooks/use-library-data";
import { childrenOf, useSidebarActions } from "@/hooks/use-sidebar-actions";
import { libraryApi } from "@/lib/library/api";
import { itemsOf, libraryKeys } from "@/lib/library/cache";
import { countLabel } from "@/lib/library/format";
import {
  columnsOf,
  gridLayout,
  itemsInRect,
  listLayout,
  navigate,
  NAV_KEYS,
  normaliseRect,
  rowCount,
  type NavKey,
  type Rect,
} from "@/lib/library/layout";
import {
  boxSelect,
  clickItem,
  EMPTY_SELECTION,
  moveFocus,
  pruneSelection,
  selectAll,
  targetsFor,
  toggleFocused,
  type Selection,
} from "@/lib/library/selection";
import { cn } from "@/lib/utils";

import { DocumentCard, DocumentRow, type DocumentItemProps } from "./document-item";
import { DocumentMenuItems, type MenuHandlers } from "./document-menu";
import { useDropTarget } from "./folder-drop";
import { FolderGlyph } from "./folder-icon";
import { useLibrary } from "./library-context";
import {
  MoveDialog,
  NewDocumentDialog,
  PurgeDialog,
  SmartFolderDialog,
  TagDialog,
  type TagDraft,
} from "./library-dialogs";
import { LibraryEmpty } from "./library-empty";
import { LibraryToolbar } from "./library-toolbar";

/** The sticky app header plus the sticky toolbar: rows scrolled to by keyboard stay below them. */
const STICKY_TOP = 56 + 56;

const VIEW_PARAMS = ["sort", "dir", "types", "owner", "tags", "shared", "select"];

const sameView = (a: ViewState, b: ViewState) =>
  viewToParams(a, "home").toString() === viewToParams(b, "home").toString();

export interface LibraryViewProps {
  scope: LibraryScope;
  title: string;
  eyebrow: string;
  /** The workspace this view belongs to; null for views across workspaces. */
  workspaceId: string | null;
  initialView: ViewState;
  initialPage: LibraryPage;
  /** Selected when the page opens (search results link here). */
  initialSelectedId?: string | null;
  smartFolder?: SmartFolderView;
}

function FolderChip({
  folder,
  workspaceId,
}: {
  folder: {
    id: string;
    name: string;
    color: string | null;
    icon: Parameters<typeof FolderGlyph>[0]["icon"];
  };
  workspaceId: string;
}) {
  const [dropRef, isOver] = useDropTarget(`chip:${folder.id}`, {
    type: "folder",
    folderId: folder.id,
    workspaceId,
    label: folder.name,
  });
  return (
    <li ref={dropRef}>
      <Link
        href={`/app/folders/${folder.id}`}
        className={cn(
          "flex h-9 max-w-56 items-center gap-2 rounded-lg border bg-card px-3 text-sm hover:bg-muted",
          isOver && "ring-2 ring-selection",
        )}
      >
        <FolderGlyph icon={folder.icon} color={folder.color} />
        <span className="truncate">{folder.name}</span>
      </Link>
    </li>
  );
}

function LoadingGrid() {
  return (
    <div aria-busy="true" className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-5">
      <span className="sr-only">Loading documents</span>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3 p-1.5">
          <Skeleton className="aspect-4/3 w-full rounded-md" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * A library view (SPEC.md section 5): header, toolbar, and a virtualized grid or list that stays
 * fast at 10,000 documents. Selection works like a desktop file manager (click, shift/cmd-click,
 * box select, arrows), actions update at once and roll back on failure.
 */
export function LibraryView(props: LibraryViewProps) {
  const { scope, initialPage, initialView, workspaceId, smartFolder } = props;
  const library = useLibrary();
  const router = useRouter();
  const qc = useQueryClient();
  const actions = useLibraryActions();
  const sidebarWorkspace = workspaceId ?? library.activeWorkspaceId;
  const { sidebar } = useSidebarData(sidebarWorkspace);
  const sidebarActions = useSidebarActions(sidebarWorkspace);

  // The sidebar follows the workspace of the page being looked at.
  const { showWorkspace } = library;
  useEffect(() => {
    if (workspaceId) showWorkspace(workspaceId);
  }, [workspaceId, showWorkspace]);

  // ---------------------------------------------------------------------------------------------
  // view state (sort, direction, filters) mirrored in the URL

  const [view, setView] = useState(initialView);
  const [lastInitial, setLastInitial] = useState(initialView);
  if (!sameView(lastInitial, initialView)) {
    setLastInitial(initialView);
    setView(initialView);
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of VIEW_PARAMS) params.delete(key);
    for (const [key, value] of viewToParams(view, scope.kind)) params.set(key, value);
    const query = params.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (url !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, "", url);
    }
  }, [view, scope.kind]);

  // ---------------------------------------------------------------------------------------------
  // data

  const key = libraryKeys.view(scope, view);
  const isInitialView = sameView(view, initialView);
  const seeded = useMemo(
    () => ({ pages: [initialPage], pageParams: [null as string | null] }),
    [initialPage],
  );
  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam, signal }) =>
      libraryApi.page({ scope, ...view, cursor: pageParam, limit: LIBRARY_PAGE_SIZE }, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    initialData: () => (isInitialView ? seeded : undefined),
    placeholderData: keepPreviousData,
  });
  // A fresh server render (navigation, refresh) replaces whatever the cache held for this view.
  const initialKey = useMemo(() => libraryKeys.view(scope, initialView), [scope, initialView]);
  useEffect(() => {
    qc.setQueryData(initialKey, seeded);
  }, [qc, initialKey, seeded]);

  const items = useMemo(() => itemsOf(query.data), [query.data]);
  const order = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const total = query.data?.pages[0]?.total ?? items.length;
  const filtered = activeFilterCount(view.filters) > 0;

  // ---------------------------------------------------------------------------------------------
  // selection and dialogs

  const [rawSelection, setSelection] = useState<Selection>(() =>
    props.initialSelectedId
      ? {
          ids: new Set([props.initialSelectedId]),
          anchor: props.initialSelectedId,
          focus: props.initialSelectedId,
        }
      : EMPTY_SELECTION,
  );
  const selection = useMemo(() => pruneSelection(rawSelection, order), [rawSelection, order]);
  const selected = useMemo(
    () => [...selection.ids].flatMap((id) => byId.get(id) ?? []),
    [selection.ids, byId],
  );
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [moveTargets, setMoveTargets] = useState<LibraryDocument[] | null>(null);
  const [purgeTargets, setPurgeTargets] = useState<LibraryDocument[] | null>(null);
  const [tagTargets, setTagTargets] = useState<LibraryDocument[] | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const newTagDraft = useMemo<TagDraft>(() => ({ name: "", color: "#2f5d8a" }), []);

  const canCreate = scope.kind !== "trash" && scope.kind !== "shared";
  const onNew = canCreate
    ? () => {
        setNewOpen(true);
      }
    : null;

  // ---------------------------------------------------------------------------------------------
  // layout and virtualization

  const listRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const mode = library.viewMode;
  const layout = mode === "grid" ? gridLayout(width) : listLayout;
  const columns = columnsOf(layout);
  const rows = rowCount(layout, items.length);
  const hasItems = items.length > 0;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mode, hasItems]);

  const virtualizer = useWindowVirtualizer({
    count: rows,
    estimateSize: () => layout.rowHeight,
    overscan: 4,
    scrollMargin,
    scrollPaddingStart: STICKY_TOP,
  });
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, layout.rowHeight, columns]);

  const virtualRows = virtualizer.getVirtualItems();
  const lastVisibleRow = virtualRows.at(-1)?.index ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastVisibleRow >= rows - 4) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, lastVisibleRow, rows]);

  /** Scrolls an item into view (rendering it if virtualized away) and focuses it. */
  function focusItem(id: string) {
    const index = order.indexOf(id);
    if (index < 0) return;
    virtualizer.scrollToIndex(Math.floor(index / columns), { align: "auto" });
    const focus = () =>
      listRef.current
        ?.querySelector<HTMLElement>(`[data-item-id="${id}"]`)
        ?.focus({ preventScroll: true });
    requestAnimationFrame(() => requestAnimationFrame(focus));
  }

  // Search results link here with ?select=: bring that document into view once, after layout.
  const initialSelected = props.initialSelectedId;
  const revealed = useRef(false);
  const measured = width > 0;
  useEffect(() => {
    if (revealed.current || !initialSelected || !measured) return;
    revealed.current = true;
    focusItem(initialSelected);
  });

  // ---------------------------------------------------------------------------------------------
  // actions

  const handlers: MenuHandlers = {
    open: (item) => void actions.open(item),
    rename: (item) => {
      setRenamingId(item.id);
    },
    move: (targets) => {
      setMoveTargets(targets);
    },
    purge: (targets) => {
      setPurgeTargets(targets);
    },
    newTag: (targets) => {
      setTagTargets(targets);
    },
  };

  /** Tags belong to a workspace: the one of the documents being tagged. */
  async function createTagIn(tagWorkspace: string, draft: TagDraft) {
    if (tagWorkspace === sidebarWorkspace) return sidebarActions.createTag(draft);
    try {
      const { tag } = await libraryApi.createTag({ workspaceId: tagWorkspace, ...draft });
      void qc.invalidateQueries({ queryKey: libraryKeys.sidebar(tagWorkspace) });
      return tag;
    } catch (error) {
      toast.error(`Couldn't create the tag. ${error instanceof Error ? error.message : ""}`.trim());
      return null;
    }
  }

  function trashOrPurge(targets: LibraryDocument[]) {
    if (scope.kind === "trash") {
      const purgeable = targets.filter((t) => t.can.purge);
      if (purgeable.length > 0) setPurgeTargets(purgeable);
      return;
    }
    const deletable = targets.filter((t) => t.can.delete);
    if (deletable.length > 0) void actions.trash(deletable.map((t) => t.id));
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (renamingId || target.closest("input, textarea, button, [role=menu]")) return;
    const toggle = event.metaKey || event.ctrlKey;
    const focusIndex = selection.focus ? order.indexOf(selection.focus) : -1;
    if (NAV_KEYS.includes(event.key)) {
      event.preventDefault();
      const perPage = Math.max(
        1,
        Math.floor((window.innerHeight - STICKY_TOP) / layout.rowHeight) - 1,
      );
      const next = navigate(event.key as NavKey, focusIndex, order.length, columns, perPage);
      const id = order[next];
      if (id) {
        setSelection((s) =>
          moveFocus(pruneSelection(s, order), id, { shift: event.shiftKey, toggle }, order),
        );
        focusItem(id);
      }
      return;
    }
    const focused = selection.focus ? byId.get(selection.focus) : undefined;
    switch (event.key) {
      case "Enter":
        if (focused && scope.kind !== "trash") {
          event.preventDefault();
          handlers.open(focused);
        }
        return;
      case "F2":
        if (focused?.can.edit && scope.kind !== "trash") {
          event.preventDefault();
          setRenamingId(focused.id);
        }
        return;
      case "Delete":
      case "Backspace":
        if (selected.length > 0) {
          event.preventDefault();
          trashOrPurge(selected);
        }
        return;
      case " ":
        if (focused) {
          event.preventDefault();
          setSelection((s) => toggleFocused(pruneSelection(s, order)));
        }
        return;
      case "Escape":
        setSelection(EMPTY_SELECTION);
        return;
      case "a":
      case "A":
        if (toggle) {
          event.preventDefault();
          setSelection(selectAll(order, selection.focus));
        }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // box selection (mouse only: touch and pen scroll)

  const box = useRef<{
    start: { x: number; y: number };
    base: Selection;
    additive: boolean;
    clientX: number;
    clientY: number;
    moved: boolean;
    frame: number;
  } | null>(null);
  const [boxRect, setBoxRect] = useState<Rect | null>(null);

  const contentPoint = (clientX: number, clientY: number) => {
    const rect = listRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const updateBox = () => {
    const b = box.current;
    if (!b) return;
    const p = contentPoint(b.clientX, b.clientY);
    if (!b.moved && Math.hypot(p.x - b.start.x, p.y - b.start.y) < 5) return;
    b.moved = true;
    const rect = normaliseRect(b.start.x, b.start.y, p.x, p.y);
    setBoxRect(rect);
    const hits = itemsInRect(rect, layout, width, order.length).flatMap((i) => order[i] ?? []);
    setSelection(boxSelect(b.base, hits, b.additive));
  };

  const autoScroll = () => {
    const b = box.current;
    if (!b) return;
    const edge = 48;
    const speed =
      b.clientY < STICKY_TOP + edge ? -14 : b.clientY > window.innerHeight - edge ? 14 : 0;
    if (speed !== 0) {
      window.scrollBy(0, speed);
      updateBox();
    }
    b.frame = requestAnimationFrame(autoScroll);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType !== "mouse") return;
    if ((event.target as HTMLElement).closest("[data-item-id], button, a, input, [role=menu]")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    box.current = {
      start: contentPoint(event.clientX, event.clientY),
      base: selection,
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
      clientX: event.clientX,
      clientY: event.clientY,
      moved: false,
      frame: requestAnimationFrame(autoScroll),
    };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!box.current) return;
    box.current.clientX = event.clientX;
    box.current.clientY = event.clientY;
    updateBox();
  };
  const onPointerUp = () => {
    const b = box.current;
    box.current = null;
    setBoxRect(null);
    if (!b) return;
    cancelAnimationFrame(b.frame);
    // A plain click on the background clears the selection.
    if (!b.moved && !b.additive) setSelection(EMPTY_SELECTION);
  };

  // ---------------------------------------------------------------------------------------------
  // rendering

  const tabbableId = selection.focus ?? order[0] ?? null;
  const itemProps = (item: LibraryDocument): DocumentItemProps => ({
    item,
    scope,
    selected: selection.ids.has(item.id),
    tabbable: item.id === tabbableId,
    renaming: renamingId === item.id,
    dragIds: targetsFor(selection, item.id),
    menuTargets: selection.ids.has(item.id) ? selected : [item],
    handlers,
    onPointerSelect: (event, it) => {
      setSelection((s) =>
        clickItem(
          pruneSelection(s, order),
          it.id,
          { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey },
          order,
        ),
      );
    },
    onContextSelect: (it) => {
      if (!selection.ids.has(it.id)) setSelection(clickItem(EMPTY_SELECTION, it.id, {}, order));
    },
    onFocusItem: (it) => {
      setSelection((s) =>
        s.focus === it.id ? s : { ...s, focus: it.id, anchor: s.anchor ?? it.id },
      );
    },
    onRenameEnd: (it, title) => {
      setRenamingId(null);
      if (title !== null) void actions.rename(it, title);
      focusItem(it.id);
    },
  });

  const folders = sidebar.folders;
  const currentFolder =
    scope.kind === "folder" ? folders.find((f) => f.id === scope.folderId) : undefined;
  const breadcrumbs = useMemo(() => {
    if (!currentFolder) return [];
    const trail = [];
    const byId = new Map(folders.map((f) => [f.id, f]));
    for (let f = byId.get(currentFolder.parentId ?? ""); f; f = byId.get(f.parentId ?? "")) {
      trail.unshift(f);
    }
    return trail;
  }, [currentFolder, folders]);
  const subfolders =
    scope.kind === "folder"
      ? childrenOf(folders, scope.folderId)
      : scope.kind === "home"
        ? childrenOf(folders, null)
        : [];
  const title =
    currentFolder?.name ??
    (scope.kind === "tag" ? sidebar.tags.find((t) => t.id === scope.tagId)?.name : undefined) ??
    (smartFolder ? sidebar.smartFolders.find((s) => s.id === smartFolder.id)?.name : undefined) ??
    props.title;
  const savedSmart = smartFolder
    ? (sidebar.smartFolders.find((s) => s.id === smartFolder.id) ?? smartFolder)
    : null;
  const smartDirty = savedSmart !== null && !sameView(view, savedSmart);

  const oneWorkspace =
    selected.length > 0 && selected.every((t) => t.workspaceId === selected[0]?.workspaceId);
  const showEmpty = !query.isPending && items.length === 0;

  return (
    <div className="flex flex-1 flex-col px-4 pb-10 sm:px-8">
      <header className="flex flex-col gap-2 pt-6 pb-4 sm:pt-8">
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1 text-muted-foreground"
        >
          <span className="eyebrow">{props.eyebrow}</span>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight aria-hidden className="size-3.5" />
              <Link
                href={`/app/folders/${crumb.id}`}
                className="truncate text-xs hover:text-foreground"
              >
                {crumb.name}
              </Link>
            </span>
          ))}
        </nav>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-[2.25rem] leading-tight tracking-[-0.015em]">{title}</h1>
          <p
            className="text-sm text-muted-foreground tabular-nums"
            aria-live="polite"
            data-testid="library-count"
          >
            {query.isPending ? "Loading" : countLabel(total)}
          </p>
          {savedSmart ? (
            <div className="ml-auto flex gap-2">
              {smartDirty ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setView({
                        sort: savedSmart.sort,
                        dir: savedSmart.dir,
                        filters: savedSmart.filters,
                      });
                    }}
                  >
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="smart-folder-save"
                    onClick={() => void sidebarActions.updateSmartFolder(savedSmart.id, view)}
                  >
                    Save changes
                  </Button>
                </>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void sidebarActions.deleteSmartFolder(savedSmart.id).then((ok) => {
                    if (ok) router.push("/app");
                  });
                }}
              >
                Delete smart folder
              </Button>
            </div>
          ) : null}
        </div>
        {subfolders.length > 0 && workspaceId ? (
          <ul aria-label="Subfolders" className="mt-2 flex flex-wrap gap-2">
            {subfolders.map((folder) => (
              <FolderChip key={folder.id} folder={folder} workspaceId={workspaceId} />
            ))}
          </ul>
        ) : null}
      </header>

      <div className="sticky top-14 z-10 -mx-4 mb-4 flex min-h-14 items-center border-b bg-background/95 px-4 backdrop-blur-sm sm:-mx-8 sm:px-8">
        {selected.length > 0 ? (
          <div
            className="flex w-full flex-wrap items-center gap-2"
            role="toolbar"
            aria-label="Selection"
            data-testid="selection-bar"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear selection"
              onClick={() => {
                setSelection(EMPTY_SELECTION);
              }}
            >
              <X aria-hidden />
            </Button>
            <span className="text-sm font-medium tabular-nums">
              {selected.length.toLocaleString("en-GB")} selected
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {scope.kind === "trash" ? (
                <>
                  {selected.every((t) => t.can.restore) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void actions.restore(selected.map((t) => t.id))}
                    >
                      <RotateCcw aria-hidden />
                      Restore
                    </Button>
                  ) : null}
                  {selected.every((t) => t.can.purge) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        setPurgeTargets(selected);
                      }}
                    >
                      <Trash2 aria-hidden />
                      Delete forever
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  {oneWorkspace && selected.every((t) => t.can.edit) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="selection-move"
                      onClick={() => {
                        setMoveTargets(selected);
                      }}
                    >
                      <FolderInput aria-hidden />
                      Move
                    </Button>
                  ) : null}
                  {selected.every((t) => t.can.delete) ? (
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="selection-trash"
                      onClick={() => void actions.trash(selected.map((t) => t.id))}
                    >
                      <Trash2 aria-hidden />
                      Trash
                    </Button>
                  ) : null}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label="More actions for the selection"
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-52">
                      <DocumentMenuItems
                        kind="dropdown"
                        targets={selected}
                        scope={scope}
                        handlers={handlers}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full">
            <LibraryToolbar
              kind={scope.kind}
              view={view}
              onViewChange={setView}
              tags={workspaceId ? sidebar.tags : []}
              viewMode={mode}
              onViewModeChange={library.setViewMode}
              onNew={onNew}
              onSaveSmartFolder={
                workspaceId && scope.kind === "home" && !smartFolder
                  ? () => {
                      setSmartOpen(true);
                    }
                  : null
              }
            />
          </div>
        )}
      </div>

      {showEmpty ? (
        <LibraryEmpty
          scope={scope}
          filtered={filtered}
          onClearFilters={() => {
            setView({ ...view, filters: EMPTY_FILTERS });
          }}
          onNew={onNew}
        />
      ) : query.isPending ? (
        <LoadingGrid />
      ) : (
        <div
          className="relative flex-1 pb-4"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {mode === "list" ? (
            <div
              role="presentation"
              className="sticky top-[7rem] z-[5] flex h-10 items-center gap-3 border-b bg-background px-3 text-xs font-medium text-muted-foreground"
            >
              <span className="flex-1">Name</span>
              <span className="hidden w-20 md:block">Type</span>
              <span className="hidden w-32 lg:block">Owner</span>
              <span className="hidden w-28 text-right sm:block">Pages</span>
              <span className="hidden w-20 text-right md:block">Size</span>
              <span className="w-24 text-right">
                {scope.kind === "trash" ? "Deleted" : "Modified"}
              </span>
              <span className="w-8" />
            </div>
          ) : null}
          <div
            ref={listRef}
            role="grid"
            aria-label={`${title}: ${countLabel(total)}`}
            aria-multiselectable
            aria-rowcount={mode === "list" ? total : Math.ceil(total / columns)}
            aria-busy={query.isFetching}
            data-testid="library-grid"
            data-view={mode}
            onKeyDown={onKeyDown}
            className="relative w-full select-none"
            style={measured ? { height: virtualizer.getTotalSize() } : undefined}
          >
            {measured ? (
              virtualRows.map((row) => {
                const rowItems = items.slice(row.index * columns, row.index * columns + columns);
                return (
                  <div
                    key={row.key}
                    role={mode === "grid" ? "row" : "presentation"}
                    aria-rowindex={mode === "grid" ? row.index + 1 : undefined}
                    className={cn("absolute top-0 left-0 w-full", mode === "grid" && "grid")}
                    style={{
                      transform: `translateY(${String(row.start - virtualizer.options.scrollMargin)}px)`,
                      height:
                        mode === "grid"
                          ? layout.kind === "grid"
                            ? layout.cardHeight
                            : layout.rowHeight
                          : layout.rowHeight,
                      ...(mode === "grid"
                        ? {
                            gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
                            columnGap: 20,
                          }
                        : {}),
                    }}
                  >
                    {mode === "grid"
                      ? rowItems.map((item) => <DocumentCard key={item.id} {...itemProps(item)} />)
                      : rowItems.map((item) => (
                          <DocumentRow
                            key={item.id}
                            {...itemProps(item)}
                            rowIndex={row.index + 1}
                          />
                        ))}
                  </div>
                );
              })
            ) : mode === "grid" ? (
              // First paint (server render): the first page in a plain CSS grid of the same shape.
              <div
                role="row"
                className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-5 sm:grid-cols-[repeat(auto-fill,minmax(184px,1fr))]"
              >
                {items.map((item) => (
                  <DocumentCard key={item.id} {...itemProps(item)} />
                ))}
              </div>
            ) : (
              items.map((item, index) => (
                <div key={item.id} role="presentation" className="h-12">
                  <DocumentRow {...itemProps(item)} rowIndex={index + 1} />
                </div>
              ))
            )}
            {boxRect ? (
              <div
                aria-hidden
                className="pointer-events-none absolute z-10 rounded-sm border border-selection bg-selection/10"
                style={{
                  left: boxRect.left,
                  top: boxRect.top,
                  width: boxRect.right - boxRect.left,
                  height: boxRect.bottom - boxRect.top,
                }}
              />
            ) : null}
          </div>
          {isFetchingNextPage ? (
            <p className="py-4 text-center text-sm text-muted-foreground" aria-live="polite">
              Loading more
            </p>
          ) : null}
        </div>
      )}

      <MoveDialog
        targets={moveTargets}
        onClose={() => {
          setMoveTargets(null);
        }}
        onMove={(folderId, label) => {
          const ids = moveTargets?.map((t) => t.id) ?? [];
          setMoveTargets(null);
          void actions.move(ids, folderId, label);
        }}
      />
      <PurgeDialog
        targets={purgeTargets}
        onClose={() => {
          setPurgeTargets(null);
        }}
        onConfirm={() => {
          const ids = purgeTargets?.map((t) => t.id) ?? [];
          setPurgeTargets(null);
          void actions.purge(ids);
        }}
      />
      <TagDialog
        open={tagTargets !== null}
        title="New tag"
        submitLabel="Create and add"
        initial={newTagDraft}
        onClose={() => {
          setTagTargets(null);
        }}
        onSubmit={async (draft) => {
          const targets = tagTargets ?? [];
          const tag = await createTagIn(targets[0]?.workspaceId ?? sidebarWorkspace, draft);
          if (tag) {
            setTagTargets(null);
            await actions.addTag(
              targets.map((t) => t.id),
              tag,
            );
          }
        }}
      />
      <NewDocumentDialog
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
        }}
      />
      <SmartFolderDialog
        open={smartOpen}
        onClose={() => {
          setSmartOpen(false);
        }}
        onSubmit={async (name) => {
          const smart = await sidebarActions.createSmartFolder(name, view);
          if (smart) {
            setSmartOpen(false);
            router.push(`/app/smart/${smart.id}`);
          }
        }}
      />
    </div>
  );
}
