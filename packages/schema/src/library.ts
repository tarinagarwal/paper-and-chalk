/**
 * The library (SPEC.md section 5): which documents a view shows (scope), how they are filtered
 * and sorted, the cursor for paging, and the web API's request and response shapes. Shared by
 * the browser (URL state, optimistic updates) and the server (queries, validation).
 */
import { z } from "zod";

import { roleSchema } from "./access";
import {
  DOCUMENT_TYPES,
  documentTypeSchema,
  hexColorSchema,
  type DocumentType,
} from "./primitives";

/** Trashed documents and folders are deleted for good after this many days. */
export const TRASH_RETENTION_DAYS = 30;

/** Colours offered for folders and tags (they read on paper and on chalk). */
export const LIBRARY_COLORS = [
  "#c43e18",
  "#c98a1b",
  "#5b7a3a",
  "#2f7d74",
  "#2f5d8a",
  "#6b4fa0",
  "#a8466f",
  "#6f6a60",
] as const;

/** Icons offered for folders (lucide names; the web app maps them to components). */
export const FOLDER_ICONS = [
  "folder",
  "book",
  "graduation-cap",
  "flask",
  "briefcase",
  "palette",
  "music",
  "code",
  "heart",
  "star",
  "calendar",
  "lightbulb",
] as const;
export const folderIconSchema = z.enum(FOLDER_ICONS);
export type FolderIcon = z.infer<typeof folderIconSchema>;

// ---------------------------------------------------------------------------------------------
// sorting and filtering

export const LIBRARY_SORTS = [
  "modified",
  "created",
  "name",
  "size",
  "lastOpened",
  "relevance",
] as const;
export const librarySortSchema = z.enum(LIBRARY_SORTS);
export type LibrarySort = z.infer<typeof librarySortSchema>;

export const sortDirSchema = z.enum(["asc", "desc"]);
export type SortDir = z.infer<typeof sortDirSchema>;

/** The natural direction of each sort; "last opened" and "relevance" only go one way. */
export const DEFAULT_SORT_DIR: Record<LibrarySort, SortDir> = {
  modified: "desc",
  created: "desc",
  name: "asc",
  size: "desc",
  lastOpened: "desc",
  relevance: "desc",
};
export const FIXED_DIRECTION_SORTS: readonly LibrarySort[] = ["lastOpened", "relevance"];

export const OWNER_FILTERS = ["anyone", "me", "others"] as const;
export const SHARED_FILTERS = ["any", "shared", "private"] as const;

export const libraryFiltersSchema = z.strictObject({
  types: z.array(documentTypeSchema).max(DOCUMENT_TYPES.length).default([]),
  /** Owner = who created the document. */
  owner: z.enum(OWNER_FILTERS).default("anyone"),
  /** Documents carrying every one of these tags. */
  tagIds: z.array(z.uuid()).max(20).default([]),
  shared: z.enum(SHARED_FILTERS).default("any"),
});
export type LibraryFilters = z.output<typeof libraryFiltersSchema>;

/** What the toolbar controls: sort, direction and filters. */
export interface LibraryView {
  sort: LibrarySort;
  dir: SortDir;
  filters: LibraryFilters;
}

export const EMPTY_FILTERS: LibraryFilters = {
  types: [],
  owner: "anyone",
  tagIds: [],
  shared: "any",
};

export function activeFilterCount(filters: LibraryFilters): number {
  return (
    (filters.types.length > 0 ? 1 : 0) +
    (filters.owner !== "anyone" ? 1 : 0) +
    (filters.tagIds.length > 0 ? 1 : 0) +
    (filters.shared !== "any" ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------------------------
// scopes and queries

export const libraryScopeSchema = z.discriminatedUnion("kind", [
  /** Every live document in a workspace. */
  z.strictObject({ kind: z.literal("home"), workspaceId: z.uuid() }),
  /** Documents directly in a folder. */
  z.strictObject({ kind: z.literal("folder"), folderId: z.uuid() }),
  z.strictObject({ kind: z.literal("tag"), tagId: z.uuid() }),
  /** Trashed documents in a workspace that the user may restore. */
  z.strictObject({ kind: z.literal("trash"), workspaceId: z.uuid() }),
  /** The user's recently opened documents, across workspaces. */
  z.strictObject({ kind: z.literal("recents") }),
  z.strictObject({ kind: z.literal("favourites") }),
  /** Documents shared with the user outside their workspaces. */
  z.strictObject({ kind: z.literal("shared") }),
  /** Fuzzy title search in a workspace. */
  z.strictObject({
    kind: z.literal("search"),
    workspaceId: z.uuid(),
    q: z.string().trim().min(1).max(200),
  }),
]);
export type LibraryScope = z.infer<typeof libraryScopeSchema>;
export type LibraryScopeKind = LibraryScope["kind"];

export const LIBRARY_PAGE_SIZE = 60;

export const libraryQuerySchema = z.strictObject({
  scope: libraryScopeSchema,
  sort: librarySortSchema,
  dir: sortDirSchema,
  filters: libraryFiltersSchema,
  cursor: z.string().min(1).max(1000).nullable().default(null),
  limit: z.int().min(1).max(200).default(LIBRARY_PAGE_SIZE),
});
export type LibraryQuery = z.output<typeof libraryQuerySchema>;

/** The sort a scope opens with. */
export function defaultSort(kind: LibraryScopeKind): LibrarySort {
  if (kind === "recents") return "lastOpened";
  if (kind === "search") return "relevance";
  return "modified";
}

/** Sorts a scope offers: relevance only in search. */
export function sortsFor(kind: LibraryScopeKind): readonly LibrarySort[] {
  return LIBRARY_SORTS.filter((s) => s !== "relevance" || kind === "search");
}

// ---------------------------------------------------------------------------------------------
// URL encoding: the page URL and the list API use the same parameters

const LIST_SEPARATOR = ",";

/** Sort, direction and filters as URL parameters; defaults are left out to keep URLs short. */
export function viewToParams(view: LibraryView, kind: LibraryScopeKind): URLSearchParams {
  const params = new URLSearchParams();
  if (view.sort !== defaultSort(kind)) params.set("sort", view.sort);
  if (view.dir !== DEFAULT_SORT_DIR[view.sort]) params.set("dir", view.dir);
  const { filters } = view;
  if (filters.types.length > 0) params.set("types", filters.types.join(LIST_SEPARATOR));
  if (filters.owner !== "anyone") params.set("owner", filters.owner);
  if (filters.tagIds.length > 0) params.set("tags", filters.tagIds.join(LIST_SEPARATOR));
  if (filters.shared !== "any") params.set("shared", filters.shared);
  return params;
}

const list = (value: string | null) =>
  value ? value.split(LIST_SEPARATOR).filter((v) => v.length > 0) : [];

/**
 * Reads sort, direction and filters from URL parameters. Anything unknown or malformed falls back
 * to the default, so a hand-edited URL never breaks the page.
 */
export function viewFromParams(params: URLSearchParams, kind: LibraryScopeKind): LibraryView {
  const sortParsed = librarySortSchema.safeParse(params.get("sort"));
  const sort =
    sortParsed.success && sortsFor(kind).includes(sortParsed.data)
      ? sortParsed.data
      : defaultSort(kind);
  const dirParsed = sortDirSchema.safeParse(params.get("dir"));
  const dir =
    dirParsed.success && !FIXED_DIRECTION_SORTS.includes(sort)
      ? dirParsed.data
      : DEFAULT_SORT_DIR[sort];
  const types = [...new Set(list(params.get("types")))].filter((t): t is DocumentType =>
    (DOCUMENT_TYPES as readonly string[]).includes(t),
  );
  const owner = z
    .enum(OWNER_FILTERS)
    .catch("anyone")
    .parse(params.get("owner") ?? "anyone");
  const tagIds = [...new Set(list(params.get("tags")))]
    .filter((id) => z.uuid().safeParse(id).success)
    .slice(0, 20);
  const shared = z
    .enum(SHARED_FILTERS)
    .catch("any")
    .parse(params.get("shared") ?? "any");
  return { sort, dir, filters: { types, owner, tagIds, shared } };
}

/** The list API's query string: scope, view, cursor and limit. */
export function libraryQueryToParams(query: LibraryQuery): URLSearchParams {
  const params = viewToParams(query, query.scope.kind);
  const { scope } = query;
  params.set("scope", scope.kind);
  if ("workspaceId" in scope) params.set("workspaceId", scope.workspaceId);
  if (scope.kind === "folder") params.set("folderId", scope.folderId);
  if (scope.kind === "tag") params.set("tagId", scope.tagId);
  if (scope.kind === "search") params.set("q", scope.q);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit !== LIBRARY_PAGE_SIZE) params.set("limit", String(query.limit));
  return params;
}

/** Parses the list API's query string. Throws a ZodError on a bad scope. */
export function libraryQueryFromParams(params: URLSearchParams): LibraryQuery {
  const kind = params.get("scope");
  const scope = libraryScopeSchema.parse({
    kind,
    ...(params.has("workspaceId") ? { workspaceId: params.get("workspaceId") } : {}),
    ...(kind === "folder" ? { folderId: params.get("folderId") } : {}),
    ...(kind === "tag" ? { tagId: params.get("tagId") } : {}),
    ...(kind === "search" ? { q: params.get("q") } : {}),
  });
  const view = viewFromParams(params, scope.kind);
  const limit = params.get("limit");
  return libraryQuerySchema.parse({
    scope,
    ...view,
    cursor: params.get("cursor") ?? null,
    ...(limit ? { limit: Number(limit) } : {}),
  });
}

// ---------------------------------------------------------------------------------------------
// API views (what the browser receives)

const isoDate = z.iso.datetime();

export const tagViewSchema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  color: hexColorSchema,
});
export type TagView = z.infer<typeof tagViewSchema>;

export const folderViewSchema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  color: hexColorSchema.nullable(),
  icon: folderIconSchema.nullable(),
  orderKey: z.string(),
});
export type FolderView = z.infer<typeof folderViewSchema>;

export const smartFolderViewSchema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  filters: libraryFiltersSchema,
  sort: librarySortSchema,
  dir: sortDirSchema,
  orderKey: z.string(),
});
export type SmartFolderView = z.infer<typeof smartFolderViewSchema>;

export const workspaceViewSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  personal: z.boolean(),
  role: roleSchema,
});
export type WorkspaceView = z.infer<typeof workspaceViewSchema>;

export const storageViewSchema = z.strictObject({
  plan: z.string(),
  usedBytes: z.number().nonnegative(),
  limitBytes: z.number().positive(),
});
export type StorageView = z.infer<typeof storageViewSchema>;

/** What the user may do to a document, worked out by the server's permission rules. */
export const documentAbilitiesSchema = z.strictObject({
  edit: z.boolean(),
  delete: z.boolean(),
  restore: z.boolean(),
  purge: z.boolean(),
  duplicate: z.boolean(),
});
export type DocumentAbilities = z.infer<typeof documentAbilitiesSchema>;

export const libraryDocumentSchema = z.strictObject({
  id: z.uuid(),
  workspaceId: z.uuid(),
  folderId: z.uuid().nullable(),
  type: documentTypeSchema,
  title: z.string(),
  pageCount: z.int().nonnegative(),
  bytes: z.number().nonnegative(),
  isShared: z.boolean(),
  tags: z.array(tagViewSchema),
  owner: z.strictObject({ id: z.string(), name: z.string() }),
  createdAt: isoDate,
  updatedAt: isoDate,
  deletedAt: isoDate.nullable(),
  lastOpenedAt: isoDate.nullable(),
  favourite: z.boolean(),
  role: roleSchema,
  can: documentAbilitiesSchema,
});
export type LibraryDocument = z.infer<typeof libraryDocumentSchema>;

export const libraryPageSchema = z.strictObject({
  items: z.array(libraryDocumentSchema),
  nextCursor: z.string().nullable(),
  /** Matching documents in the whole view; only on the first page. */
  total: z.int().nonnegative().nullable(),
});
export type LibraryPage = z.infer<typeof libraryPageSchema>;

/** The sidebar's data for one workspace. */
export const workspaceSidebarSchema = z.strictObject({
  folders: z.array(folderViewSchema),
  tags: z.array(tagViewSchema),
  smartFolders: z.array(smartFolderViewSchema),
});
export type WorkspaceSidebar = z.infer<typeof workspaceSidebarSchema>;

// ---------------------------------------------------------------------------------------------
// API requests

export const MAX_BULK_IDS = 500;
const bulkIds = z.array(z.uuid()).min(1).max(MAX_BULK_IDS);

export const bulkActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("move"), ids: bulkIds, folderId: z.uuid().nullable() }),
  z.strictObject({ action: z.literal("addTag"), ids: bulkIds, tagId: z.uuid() }),
  z.strictObject({ action: z.literal("removeTag"), ids: bulkIds, tagId: z.uuid() }),
  z.strictObject({ action: z.literal("trash"), ids: bulkIds }),
  z.strictObject({ action: z.literal("restore"), ids: bulkIds }),
  z.strictObject({ action: z.literal("purge"), ids: bulkIds }),
  z.strictObject({ action: z.literal("favourite"), ids: bulkIds, on: z.boolean() }),
]);
export type BulkAction = z.infer<typeof bulkActionSchema>;

export const bulkResultSchema = z.strictObject({
  done: z.array(z.uuid()),
  failed: z.array(z.strictObject({ id: z.uuid(), error: z.string(), message: z.string() })),
});
export type BulkResult = z.infer<typeof bulkResultSchema>;

export const documentTitleSchema = z.string().trim().min(1).max(200);
export const renameDocumentSchema = z.strictObject({ title: documentTitleSchema });

export const folderNameSchema = z.string().trim().min(1).max(100);
export const createFolderSchema = z.strictObject({
  workspaceId: z.uuid(),
  parentId: z.uuid().nullable().default(null),
  name: folderNameSchema,
  color: hexColorSchema.nullable().default(null),
  icon: folderIconSchema.nullable().default(null),
});
export const updateFolderSchema = z
  .strictObject({
    name: folderNameSchema.optional(),
    color: hexColorSchema.nullable().optional(),
    icon: folderIconSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");
/** Moves a folder under `parentId`, just before the sibling `beforeId` (or last when null). */
export const moveFolderSchema = z.strictObject({
  parentId: z.uuid().nullable(),
  beforeId: z.uuid().nullable().default(null),
});

export const tagNameSchema = z.string().trim().min(1).max(40);
export const createTagSchema = z.strictObject({
  workspaceId: z.uuid(),
  name: tagNameSchema,
  color: hexColorSchema,
});
export const updateTagSchema = z
  .strictObject({ name: tagNameSchema.optional(), color: hexColorSchema.optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

export const smartFolderNameSchema = z.string().trim().min(1).max(60);
export const createSmartFolderSchema = z.strictObject({
  workspaceId: z.uuid(),
  name: smartFolderNameSchema,
  filters: libraryFiltersSchema,
  sort: librarySortSchema,
  dir: sortDirSchema,
});
export const updateSmartFolderSchema = z
  .strictObject({
    name: smartFolderNameSchema.optional(),
    filters: libraryFiltersSchema.optional(),
    sort: librarySortSchema.optional(),
    dir: sortDirSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to change");

export const activeWorkspaceSchema = z.strictObject({ workspaceId: z.uuid() });
