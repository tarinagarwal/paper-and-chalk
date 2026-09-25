import "server-only";

import type { LibraryScope, LibraryView as ViewState, SmartFolderView } from "@pc/schema";

import { firstPage, pageActor } from "@/lib/server/library";

import { LibraryView } from "./library-view";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Renders a library view on the server: the first page is loaded here (so the page arrives with
 * content), then the client view takes over for paging, sorting and actions.
 */
export async function LibraryScreen({
  scope,
  title,
  eyebrow,
  workspaceId,
  searchParams,
  savedView,
  smartFolder,
}: {
  scope: LibraryScope;
  title: string;
  eyebrow: string;
  workspaceId: string | null;
  searchParams: SearchParams;
  /** A smart folder opens with its saved sort and filters. */
  savedView?: ViewState;
  smartFolder?: SmartFolderView;
}) {
  const ctx = await pageActor();
  const { view, page } = await firstPage(ctx, scope, searchParams, savedView);
  const select = typeof searchParams.select === "string" ? searchParams.select : null;
  return (
    <LibraryView
      // A new scope (another folder, tag or search) starts fresh: selection, rename, dialogs.
      key={JSON.stringify(scope)}
      scope={scope}
      title={title}
      eyebrow={eyebrow}
      workspaceId={workspaceId}
      initialView={view}
      initialPage={page}
      initialSelectedId={page.items.some((i) => i.id === select) ? select : null}
      {...(smartFolder ? { smartFolder } : {})}
    />
  );
}
