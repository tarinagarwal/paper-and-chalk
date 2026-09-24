import type { MongoConnection } from "../client";
import { repoContext } from "./context";
import { documentsRepository } from "./documents";
import { foldersRepository } from "./folders";
import { pagesRepository } from "./pages";
import { ensurePersonalWorkspace, workspacesRepository } from "./workspaces";

/**
 * The only way app code touches workspaces, folders, documents and pages. Every call takes the
 * acting user's AccessContext and checks `can()` before reading or writing.
 */
export function createRepositories(conn: MongoConnection, now?: () => Date) {
  const r = repoContext(conn, now);
  return {
    workspaces: workspacesRepository(r),
    folders: foldersRepository(r),
    documents: documentsRepository(r),
    pages: pagesRepository(r),
    /** Idempotent: personal workspace + owner membership for a user (first sign-in). */
    ensurePersonalWorkspace: (userId: string) => ensurePersonalWorkspace(r, userId),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
export { DEFAULT_NOTEBOOK_PAGE, type DocumentWithRole, type ShareLinkView } from "./documents";
export type { WorkspaceWithRole } from "./workspaces";
