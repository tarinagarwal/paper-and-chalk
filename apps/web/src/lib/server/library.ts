import "server-only";

import { AccessDeniedError, InvalidRequestError, type AccessContext } from "@pc/db";
import {
  LIBRARY_PAGE_SIZE,
  viewFromParams,
  type LibraryPage,
  type LibraryScope,
  type LibraryView,
  type WorkspaceSidebar,
  type WorkspaceView,
} from "@pc/schema";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { ACTIVE_WORKSPACE_COOKIE, VIEW_MODE_COOKIE, type ViewMode } from "@/lib/library/constants";
import { getRepositories } from "@/lib/server/clients";
import {
  folderView,
  libraryPageView,
  smartFolderView,
  tagView,
  workspaceView,
} from "@/lib/server/views";

/** The signed-in user as a repository actor, for server components. */
export async function pageActor(): Promise<AccessContext & { userId: string }> {
  const session = await getSession();
  if (!session) redirect("/sign-in?callbackUrl=%2Fapp");
  return {
    actor: { kind: "user", userId: session.user.id, email: session.user.email },
    userId: session.user.id,
  };
}

/** Missing or not shared look the same (a 404), so ids cannot be probed. */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load;
  } catch (error) {
    if (
      (error instanceof AccessDeniedError &&
        (error.reason === "not_found" || error.reason === "no_access")) ||
      (error instanceof InvalidRequestError && error.code === "not_found")
    ) {
      notFound();
    }
    throw error;
  }
}

/** The user's workspaces and the one the library shows: the remembered one, else personal. */
export async function libraryWorkspaces(
  ctx: AccessContext & { userId: string },
): Promise<{ workspaces: WorkspaceView[]; active: WorkspaceView }> {
  const repos = getRepositories();
  let list = await repos.workspaces.listForActor(ctx);
  if (list.length === 0) {
    // Every sign-in creates the personal workspace; this covers a session from before that.
    await repos.ensurePersonalWorkspace(ctx.userId);
    list = await repos.workspaces.listForActor(ctx);
  }
  const workspaces = list.map(workspaceView);
  const remembered = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active =
    workspaces.find((w) => w.id === remembered) ??
    workspaces.find((w) => w.personal) ??
    workspaces[0];
  if (!active) throw new Error("the user has no workspace");
  return { workspaces, active };
}

export async function workspaceSidebar(
  ctx: AccessContext,
  workspaceId: string,
): Promise<WorkspaceSidebar> {
  const repos = getRepositories();
  const [folders, tags, smartFolders] = await Promise.all([
    repos.folders.listAll(ctx, workspaceId),
    repos.tags.list(ctx, workspaceId),
    repos.smartFolders.list(ctx, workspaceId),
  ]);
  return {
    folders: folders.map(folderView),
    tags: tags.map(tagView),
    smartFolders: smartFolders.map(smartFolderView),
  };
}

export async function viewMode(): Promise<ViewMode> {
  return (await cookies()).get(VIEW_MODE_COOKIE)?.value === "list" ? "list" : "grid";
}

type SearchParams = Record<string, string | string[] | undefined>;

export function toUrlParams(searchParams: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

/** The first page of a library view, rendered on the server from the page's URL. */
export async function firstPage(
  ctx: AccessContext,
  scope: LibraryScope,
  searchParams: SearchParams,
  fallback?: LibraryView,
): Promise<{ view: LibraryView; page: LibraryPage }> {
  const params = toUrlParams(searchParams);
  const fromUrl = viewFromParams(params, scope.kind);
  // A smart folder opens with its saved view unless the URL says otherwise.
  const hasViewParams = ["sort", "dir", "types", "owner", "tags", "shared"].some((k) =>
    params.has(k),
  );
  const view = fallback && !hasViewParams ? fallback : fromUrl;
  const result = await orNotFound(
    getRepositories().library.query(ctx, {
      scope,
      ...view,
      cursor: null,
      limit: LIBRARY_PAGE_SIZE,
    }),
  );
  return { view, page: libraryPageView(result) };
}
