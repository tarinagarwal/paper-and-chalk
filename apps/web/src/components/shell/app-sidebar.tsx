"use client";

import { useDndContext, useDraggable } from "@dnd-kit/core";
import type { FolderView, SmartFolderView, TagView } from "@pc/schema";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  FolderPlus,
  Home,
  MoreHorizontal,
  PencilLine,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";

import { LogoMark, Wordmark } from "@/components/brand/logo";
import { useDropTarget } from "@/components/library/folder-drop";
import { FolderGlyph } from "@/components/library/folder-icon";
import { useActiveWorkspace, useLibrary } from "@/components/library/library-context";
import {
  FolderDialog,
  RenameDialog,
  TagDialog,
  type FolderDraft,
  type TagDraft,
} from "@/components/library/library-dialogs";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useSidebarData, useStorageData } from "@/hooks/use-library-data";
import { childrenOf, useSidebarActions, type SidebarActions } from "@/hooks/use-sidebar-actions";
import { libraryApi } from "@/lib/library/api";
import { formatBytes } from "@/lib/library/format";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------------------------
// workspace switcher

function WorkspaceSwitcher() {
  const { workspaces, showWorkspace } = useLibrary();
  const active = useActiveWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip={active.name}
          data-testid="workspace-switcher"
          className="data-[state=open]:bg-sidebar-accent"
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary font-display text-base text-sidebar-primary-foreground"
          >
            {active.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
            <span className="truncate text-sm font-medium">{active.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {active.personal ? "Personal" : `Team · ${active.role}`}
            </span>
          </span>
          <ChevronsUpDown aria-hidden className="ml-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onSelect={() => {
              if (workspace.id === active.id) return;
              showWorkspace(workspace.id);
              void libraryApi.setActiveWorkspace(workspace.id).finally(() => {
                if (pathname === "/app") router.refresh();
                else router.push("/app");
              });
            }}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{workspace.name}</span>
              <span className="text-xs text-muted-foreground">
                {workspace.personal ? "Personal" : `Team · ${workspace.role}`}
              </span>
            </span>
            {workspace.id === active.id ? <Check aria-hidden className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------------------------
// primary navigation (Home and Trash accept dropped documents)

function DroppableNavItem({
  href,
  label,
  icon: Icon,
  drop,
  testId,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  drop: Parameters<typeof useDropTarget>[1] | null;
  testId?: string;
}) {
  const pathname = usePathname();
  const [dropRef, isOver] = useDropTarget(`nav:${href}`, drop ?? { type: "trash" }, drop === null);
  return (
    <SidebarMenuItem ref={dropRef}>
      <SidebarMenuButton
        asChild
        isActive={pathname === href}
        tooltip={label}
        className={cn(isOver && "ring-2 ring-selection")}
      >
        <Link href={href} data-testid={testId}>
          <Icon aria-hidden />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ---------------------------------------------------------------------------------------------
// folder tree

const openKey = (workspaceId: string) => `pc:folders-open:${workspaceId}`;
const OPEN_EVENT = "pc:folders-open";
/** Used when localStorage is unavailable (private mode, blocked storage). */
const memoryOpen = new Map<string, string>();

function readOpen(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? memoryOpen.get(key) ?? "[]";
  } catch {
    return memoryOpen.get(key) ?? "[]";
  }
}

function writeOpen(key: string, value: string) {
  memoryOpen.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Kept in memory for this visit.
  }
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function subscribeOpen(onChange: () => void) {
  window.addEventListener(OPEN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(OPEN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Which folders are expanded, remembered per workspace in this browser. */
function useOpenFolders(workspaceId: string, folders: FolderView[], currentId: string | null) {
  const key = openKey(workspaceId);
  // The server snapshot is "all closed", so hydration matches; the saved state follows at once.
  const raw = useSyncExternalStore(
    subscribeOpen,
    () => readOpen(key),
    () => "[]",
  );
  const open = useMemo(() => {
    try {
      const saved: unknown = JSON.parse(raw);
      return new Set(
        Array.isArray(saved) ? saved.filter((v): v is string => typeof v === "string") : [],
      );
    } catch {
      return new Set<string>();
    }
  }, [raw]);
  // The folder being looked at is always visible: open its ancestors.
  const parents = useMemo(() => new Map(folders.map((f) => [f.id, f.parentId])), [folders]);
  const expanded = useMemo(() => {
    const all = new Set(open);
    for (let p = currentId ? parents.get(currentId) : null; p; p = parents.get(p)) all.add(p);
    return all;
  }, [open, parents, currentId]);
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    writeOpen(key, JSON.stringify([...next]));
  };
  return { expanded, toggle };
}

/** A thin zone above a folder (or at the end of a level) that a dragged folder drops into. */
function Gap({
  workspaceId,
  parentId,
  beforeId,
  depth,
}: {
  workspaceId: string;
  parentId: string | null;
  beforeId: string | null;
  depth: number;
}) {
  const [dropRef, isOver] = useDropTarget(`gap:${parentId ?? "top"}:${beforeId ?? "end"}`, {
    type: "gap",
    workspaceId,
    parentId,
    beforeId,
  });
  return (
    <li ref={dropRef} aria-hidden className="relative -my-1 h-2">
      {isOver ? (
        <span
          className="absolute top-1/2 right-2 h-0.5 -translate-y-1/2 rounded-full bg-selection"
          style={{ left: `${String(0.5 + depth * 0.875)}rem` }}
        />
      ) : null}
    </li>
  );
}

interface TreeProps {
  workspaceId: string;
  folders: FolderView[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  onNewSubfolder: (parent: FolderView) => void;
  onEdit: (folder: FolderView) => void;
  onDelete: (folder: FolderView) => void;
  canEdit: boolean;
  draggingFolder: boolean;
}

function FolderNode({ folder, depth, ...tree }: TreeProps & { folder: FolderView; depth: number }) {
  const pathname = usePathname();
  const href = `/app/folders/${folder.id}`;
  const children = childrenOf(tree.folders, folder.id);
  const isOpen = tree.expanded.has(folder.id);
  const {
    setNodeRef: dragRef,
    listeners,
    isDragging,
  } = useDraggable({
    id: `folder:${folder.id}`,
    data: {
      type: "folder",
      folderId: folder.id,
      label: folder.name,
      workspaceId: tree.workspaceId,
    },
    disabled: !tree.canEdit,
  });
  const [intoRef, isOver] = useDropTarget(`into:${folder.id}`, {
    type: "folder",
    folderId: folder.id,
    workspaceId: tree.workspaceId,
    label: folder.name,
  });
  return (
    <>
      {tree.draggingFolder ? (
        <Gap
          workspaceId={tree.workspaceId}
          parentId={folder.parentId}
          beforeId={folder.id}
          depth={depth}
        />
      ) : null}
      <SidebarMenuItem ref={intoRef} data-testid="folder-node">
        <div
          className={cn(
            "flex items-center rounded-md",
            isOver && "ring-2 ring-selection",
            isDragging && "opacity-50",
          )}
          style={{ paddingLeft: `${String(depth * 0.875)}rem` }}
        >
          {children.length > 0 ? (
            <button
              type="button"
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${folder.name}`}
              aria-expanded={isOpen}
              onClick={() => {
                tree.toggle(folder.id);
              }}
              className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            >
              {isOpen ? (
                <ChevronDown aria-hidden className="size-3.5" />
              ) : (
                <ChevronRight aria-hidden className="size-3.5" />
              )}
            </button>
          ) : (
            <span aria-hidden className="size-6 shrink-0" />
          )}
          <SidebarMenuButton asChild isActive={pathname === href} className="min-w-0 flex-1 pr-8">
            <Link ref={dragRef} href={href} {...listeners}>
              <FolderGlyph icon={folder.icon} color={folder.color} />
              <span className="truncate">{folder.name}</span>
            </Link>
          </SidebarMenuButton>
        </div>
        {tree.canEdit ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuAction showOnHover aria-label={`Actions for ${folder.name}`}>
                <MoreHorizontal aria-hidden />
              </SidebarMenuAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="min-w-44">
              <DropdownMenuItem
                onSelect={() => {
                  tree.onNewSubfolder(folder);
                }}
              >
                <FolderPlus aria-hidden />
                New folder inside
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  tree.onEdit(folder);
                }}
              >
                <PencilLine aria-hidden />
                Rename, colour and icon
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  tree.onDelete(folder);
                }}
              >
                <Trash2 aria-hidden />
                Move to trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </SidebarMenuItem>
      {isOpen && children.length > 0 ? (
        <li className="list-none">
          <ul aria-label={`Folders in ${folder.name}`} className="flex flex-col gap-0.5">
            {children.map((child) => (
              <FolderNode key={child.id} folder={child} depth={depth + 1} {...tree} />
            ))}
            {tree.draggingFolder ? (
              <Gap
                workspaceId={tree.workspaceId}
                parentId={folder.id}
                beforeId={null}
                depth={depth + 1}
              />
            ) : null}
          </ul>
        </li>
      ) : null}
    </>
  );
}

function FoldersGroup({ actions, canEdit }: { actions: SidebarActions; canEdit: boolean }) {
  const workspace = useActiveWorkspace();
  const { sidebar } = useSidebarData(workspace.id);
  const pathname = usePathname();
  const currentId = pathname.startsWith("/app/folders/") ? (pathname.split("/")[3] ?? null) : null;
  const { expanded, toggle } = useOpenFolders(workspace.id, sidebar.folders, currentId);
  const { active } = useDndContext();
  const draggingFolder = (active?.data.current as { type?: string } | undefined)?.type === "folder";
  const router = useRouter();

  const [dialog, setDialog] = useState<
    { kind: "create"; parent: FolderView | null } | { kind: "edit"; folder: FolderView } | null
  >(null);
  const [deleting, setDeleting] = useState<FolderView | null>(null);
  const initial = useMemo<FolderDraft>(
    () =>
      dialog?.kind === "edit"
        ? { name: dialog.folder.name, color: dialog.folder.color, icon: dialog.folder.icon }
        : { name: "", color: null, icon: null },
    [dialog],
  );
  const top = childrenOf(sidebar.folders, null);

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="eyebrow">Folders</SidebarGroupLabel>
      {canEdit ? (
        <SidebarGroupAction
          title="New folder"
          aria-label="New folder"
          data-testid="new-folder"
          onClick={() => {
            setDialog({ kind: "create", parent: null });
          }}
        >
          <Plus aria-hidden />
        </SidebarGroupAction>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu aria-label="Folders" data-testid="folder-tree">
          {top.map((folder) => (
            <FolderNode
              key={folder.id}
              folder={folder}
              depth={0}
              workspaceId={workspace.id}
              folders={sidebar.folders}
              expanded={expanded}
              toggle={toggle}
              canEdit={canEdit}
              draggingFolder={draggingFolder}
              onNewSubfolder={(parent) => {
                setDialog({ kind: "create", parent });
              }}
              onEdit={(folder) => {
                setDialog({ kind: "edit", folder });
              }}
              onDelete={setDeleting}
            />
          ))}
          {draggingFolder ? (
            <Gap workspaceId={workspace.id} parentId={null} beforeId={null} depth={0} />
          ) : null}
          {top.length === 0 ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">No folders yet</li>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>

      <FolderDialog
        open={dialog !== null}
        title={
          dialog?.kind === "edit"
            ? "Edit folder"
            : dialog?.parent
              ? `New folder in ${dialog.parent.name}`
              : "New folder"
        }
        submitLabel={dialog?.kind === "edit" ? "Save" : "Create"}
        initial={initial}
        onClose={() => {
          setDialog(null);
        }}
        onSubmit={async (draft) => {
          if (dialog?.kind === "edit") {
            if (await actions.updateFolder(dialog.folder.id, draft)) setDialog(null);
            return;
          }
          const parent = dialog?.parent ?? null;
          const folder = await actions.createFolder({ parentId: parent?.id ?? null, ...draft });
          if (folder) {
            setDialog(null);
            if (parent && !expanded.has(parent.id)) toggle(parent.id);
          }
        }}
      />
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move “{deleting?.name}” to the trash?</AlertDialogTitle>
            <AlertDialogDescription>
              Its folders and documents go to the trash with it. You can restore documents from the
              trash for 30 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const folder = deleting;
                setDeleting(null);
                if (!folder) return;
                void actions.trashFolder(folder).then((ok) => {
                  if (ok && pathname.startsWith(`/app/folders/${folder.id}`)) router.push("/app");
                });
              }}
            >
              Move to trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarGroup>
  );
}

// ---------------------------------------------------------------------------------------------
// smart folders and tags

function SmartFoldersGroup({
  smartFolders,
  actions,
}: {
  smartFolders: SmartFolderView[];
  actions: SidebarActions;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [renaming, setRenaming] = useState<SmartFolderView | null>(null);
  if (smartFolders.length === 0) return null;
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="eyebrow">Smart folders</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Smart folders">
          {smartFolders.map((smart) => {
            const href = `/app/smart/${smart.id}`;
            return (
              <SidebarMenuItem key={smart.id}>
                <SidebarMenuButton asChild isActive={pathname === href}>
                  <Link href={href}>
                    <Sparkles aria-hidden />
                    <span className="truncate">{smart.name}</span>
                  </Link>
                </SidebarMenuButton>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover aria-label={`Actions for ${smart.name}`}>
                      <MoreHorizontal aria-hidden />
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuItem
                      onSelect={() => {
                        setRenaming(smart);
                      }}
                    >
                      <PencilLine aria-hidden />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        void actions.deleteSmartFolder(smart.id).then((ok) => {
                          if (ok && pathname === href) router.push("/app");
                        });
                      }}
                    >
                      <Trash2 aria-hidden />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
      <RenameDialog
        open={renaming !== null}
        title="Rename smart folder"
        initial={renaming?.name ?? ""}
        maxLength={60}
        onClose={() => {
          setRenaming(null);
        }}
        onSubmit={async (name) => {
          if (renaming && (await actions.updateSmartFolder(renaming.id, { name })))
            setRenaming(null);
        }}
      />
    </SidebarGroup>
  );
}

function TagsGroup({
  tags,
  actions,
  canEdit,
}: {
  tags: TagView[];
  actions: SidebarActions;
  canEdit: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ tag: TagView | null } | null>(null);
  const [deleting, setDeleting] = useState<TagView | null>(null);
  const initial = useMemo<TagDraft>(
    () =>
      dialog?.tag
        ? { name: dialog.tag.name, color: dialog.tag.color }
        : { name: "", color: "#2f5d8a" },
    [dialog],
  );
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="eyebrow">Tags</SidebarGroupLabel>
      {canEdit ? (
        <SidebarGroupAction
          title="New tag"
          aria-label="New tag"
          onClick={() => {
            setDialog({ tag: null });
          }}
        >
          <Plus aria-hidden />
        </SidebarGroupAction>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu aria-label="Tags">
          {tags.map((tag) => {
            const href = `/app/tags/${tag.id}`;
            return (
              <SidebarMenuItem key={tag.id}>
                <SidebarMenuButton asChild isActive={pathname === href}>
                  <Link href={href}>
                    <span
                      aria-hidden
                      className="ml-1 size-2.5 shrink-0 rounded-full"
                      style={{ background: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </Link>
                </SidebarMenuButton>
                {canEdit ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover aria-label={`Actions for the tag ${tag.name}`}>
                        <MoreHorizontal aria-hidden />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                      <DropdownMenuItem
                        onSelect={() => {
                          setDialog({ tag });
                        }}
                      >
                        <PencilLine aria-hidden />
                        Rename and colour
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => {
                          setDeleting(tag);
                        }}
                      >
                        <Trash2 aria-hidden />
                        Delete tag
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </SidebarMenuItem>
            );
          })}
          {tags.length === 0 ? (
            <li className="px-2 py-1 text-xs text-muted-foreground">No tags yet</li>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
      <TagDialog
        open={dialog !== null}
        title={dialog?.tag ? "Edit tag" : "New tag"}
        submitLabel={dialog?.tag ? "Save" : "Create"}
        initial={initial}
        onClose={() => {
          setDialog(null);
        }}
        onSubmit={async (draft) => {
          const ok = dialog?.tag
            ? await actions.updateTag(dialog.tag, draft)
            : (await actions.createTag(draft)) !== null;
          if (ok) setDialog(null);
        }}
      />
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the tag “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It comes off every document that has it. The documents stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const tag = deleting;
                setDeleting(null);
                if (!tag) return;
                void actions.deleteTag(tag).then((ok) => {
                  if (ok && pathname === `/app/tags/${tag.id}`) router.push("/app");
                });
              }}
            >
              Delete tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarGroup>
  );
}

// ---------------------------------------------------------------------------------------------
// storage

function StorageMeter() {
  const { data } = useStorageData();
  if (!data) return null;
  const percent = Math.min(100, Math.round((data.usedBytes / data.limitBytes) * 100));
  return (
    <div
      className="flex flex-col gap-1.5 px-2 py-1 group-data-[collapsible=icon]:hidden"
      data-testid="storage-meter"
    >
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">Storage</span>
        <span className="text-muted-foreground tabular-nums">
          {formatBytes(data.usedBytes)} of {formatBytes(data.limitBytes)}
        </span>
      </div>
      <Progress
        value={percent}
        aria-label={`Storage used: ${String(percent)}%`}
        className="h-1.5"
      />
      <Link
        href="/app?sort=size"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        See the largest documents
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

/** The library sidebar (SPEC.md section 5). */
export function AppSidebar() {
  const workspace = useActiveWorkspace();
  const { sidebar } = useSidebarData(workspace.id);
  const actions = useSidebarActions(workspace.id);
  const canEdit = workspace.role === "owner" || workspace.role === "editor";

  return (
    <Sidebar collapsible="icon" aria-label="Library">
      <SidebarHeader className="gap-2 border-b">
        <Link
          href="/app"
          className="flex h-10 items-center gap-2.5 rounded-md px-1.5"
          aria-label="Paper & Chalk library"
        >
          <LogoMark className="size-6" compact />
          <Wordmark className="text-[1.1875rem] leading-none group-data-[collapsible=icon]:hidden" />
        </Link>
        <SidebarMenu>
          <SidebarMenuItem>
            <WorkspaceSwitcher />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <DroppableNavItem
                href="/app"
                label="Home"
                icon={Home}
                drop={{ type: "root", workspaceId: workspace.id }}
              />
              <DroppableNavItem href="/app/recents" label="Recents" icon={Clock3} drop={null} />
              <DroppableNavItem
                href="/app/shared"
                label="Shared with me"
                icon={Users}
                drop={null}
              />
              <DroppableNavItem href="/app/favourites" label="Favourites" icon={Star} drop={null} />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <FoldersGroup actions={actions} canEdit={canEdit} />
        <SmartFoldersGroup smartFolders={sidebar.smartFolders} actions={actions} />
        <TagsGroup tags={sidebar.tags} actions={actions} canEdit={canEdit} />
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <DroppableNavItem
            href="/app/trash"
            label="Trash"
            icon={Trash2}
            drop={{ type: "trash" }}
            testId="nav-trash"
          />
        </SidebarMenu>
        <StorageMeter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
