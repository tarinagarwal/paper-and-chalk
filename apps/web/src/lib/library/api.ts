import {
  bulkResultSchema,
  folderViewSchema,
  libraryPageSchema,
  libraryQueryToParams,
  smartFolderViewSchema,
  storageViewSchema,
  tagViewSchema,
  workspaceSidebarSchema,
  type BulkAction,
  type FolderIcon,
  type LibraryFilters,
  type LibraryQuery,
  type LibrarySort,
  type SortDir,
} from "@pc/schema";
import { z } from "zod";

/** A request the server refused, with its user-facing message. */
export class LibraryRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "LibraryRequestError";
  }
}

const errorBody = z.object({ error: z.string(), message: z.string() }).partial();

async function call<S extends z.ZodType>(
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; signal?: AbortSignal },
  schema: S | null,
): Promise<z.output<S> | null> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method,
      headers: init.body === undefined ? {} : { "Content-Type": "application/json" },
      body: init.body === undefined ? null : JSON.stringify(init.body),
      credentials: "same-origin",
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new LibraryRequestError(0, null, "You seem to be offline. Try again.");
  }
  if (!response.ok) {
    const body = errorBody.safeParse(await response.json().catch(() => ({})));
    throw new LibraryRequestError(
      response.status,
      body.data?.error ?? null,
      body.data?.message ?? "Something went wrong. Try again.",
    );
  }
  return schema ? schema.parse(await response.json()) : null;
}

async function required<S extends z.ZodType>(
  ...args: Parameters<typeof call<S>>
): Promise<z.output<S>> {
  const result = await call(...args);
  if (result === null) throw new LibraryRequestError(500, null, "Empty response");
  return result;
}

/** The library API (app/api/library, documents, folders, tags, smart-folders, storage). */
export const libraryApi = {
  page: (query: LibraryQuery, signal?: AbortSignal) =>
    required(
      `/api/library?${libraryQueryToParams(query).toString()}`,
      { method: "GET", ...(signal ? { signal } : {}) },
      libraryPageSchema,
    ),

  bulk: (action: BulkAction) =>
    required("/api/documents/bulk", { method: "POST", body: action }, bulkResultSchema),

  rename: (id: string, title: string) =>
    call(`/api/documents/${id}`, { method: "PATCH", body: { title } }, null),

  duplicate: (id: string) =>
    required(
      `/api/documents/${id}/duplicate`,
      { method: "POST" },
      z.object({ id: z.uuid(), workspaceId: z.uuid(), title: z.string() }),
    ),

  open: (id: string) => call(`/api/documents/${id}/open`, { method: "POST" }, null),

  sidebar: (workspaceId: string) =>
    required(`/api/workspaces/${workspaceId}/sidebar`, { method: "GET" }, workspaceSidebarSchema),

  setActiveWorkspace: (workspaceId: string) =>
    call("/api/workspaces/active", { method: "POST", body: { workspaceId } }, null),

  storage: () => required("/api/storage", { method: "GET" }, storageViewSchema),

  createFolder: (input: {
    workspaceId: string;
    parentId: string | null;
    name: string;
    color: string | null;
    icon: FolderIcon | null;
  }) =>
    required(
      "/api/folders",
      { method: "POST", body: input },
      z.object({ folder: folderViewSchema }),
    ),

  updateFolder: (
    id: string,
    input: { name?: string; color?: string | null; icon?: FolderIcon | null },
  ) =>
    required(
      `/api/folders/${id}`,
      { method: "PATCH", body: input },
      z.object({ folder: folderViewSchema }),
    ),

  moveFolder: (id: string, parentId: string | null, beforeId: string | null) =>
    required(
      `/api/folders/${id}/move`,
      { method: "POST", body: { parentId, beforeId } },
      z.object({ folder: folderViewSchema }),
    ),

  trashFolder: (id: string) =>
    required(
      `/api/folders/${id}`,
      { method: "DELETE" },
      z.object({ folders: z.number(), documents: z.number() }),
    ),

  createTag: (input: { workspaceId: string; name: string; color: string }) =>
    required("/api/tags", { method: "POST", body: input }, z.object({ tag: tagViewSchema })),

  updateTag: (id: string, input: { name?: string; color?: string }) =>
    required(`/api/tags/${id}`, { method: "PATCH", body: input }, z.object({ tag: tagViewSchema })),

  deleteTag: (id: string) => call(`/api/tags/${id}`, { method: "DELETE" }, null),

  createSmartFolder: (input: {
    workspaceId: string;
    name: string;
    filters: LibraryFilters;
    sort: LibrarySort;
    dir: SortDir;
  }) =>
    required(
      "/api/smart-folders",
      { method: "POST", body: input },
      z.object({ smartFolder: smartFolderViewSchema }),
    ),

  updateSmartFolder: (
    id: string,
    input: { name?: string; filters?: LibraryFilters; sort?: LibrarySort; dir?: SortDir },
  ) =>
    required(
      `/api/smart-folders/${id}`,
      { method: "PATCH", body: input },
      z.object({ smartFolder: smartFolderViewSchema }),
    ),

  deleteSmartFolder: (id: string) => call(`/api/smart-folders/${id}`, { method: "DELETE" }, null),
};
