import type { Storage } from "@pc/storage";

import type { MongoConnection } from "../client";
import { assetsRepository } from "./assets";
import { repoContext } from "./context";
import { documentsRepository } from "./documents";
import { foldersRepository } from "./folders";
import { jobsRepository } from "./jobs";
import { pagesRepository } from "./pages";
import { uploadsRepository } from "./uploads";
import { verificationRepository } from "./verification";
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
    /** System: background job records. */
    jobs: jobsRepository(r),
    /** Idempotent: personal workspace + owner membership for a user (first sign-in). */
    ensurePersonalWorkspace: (userId: string) => ensurePersonalWorkspace(r, userId),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

/** Uploads, asset reads and verification: the repositories that also talk to S3. */
export function createFileRepositories(conn: MongoConnection, storage: Storage, now?: () => Date) {
  const r = repoContext(conn, now);
  return {
    uploads: uploadsRepository(r, storage),
    assets: assetsRepository(r, storage),
    /** System: run by the verifyAsset job. */
    verification: verificationRepository(r, storage),
  };
}

export type FileRepositories = ReturnType<typeof createFileRepositories>;
export type { UploadInitResult } from "./uploads";
export type { VerificationResult } from "./verification";
export { DEFAULT_NOTEBOOK_PAGE, type DocumentWithRole, type ShareLinkView } from "./documents";
export type { WorkspaceWithRole } from "./workspaces";
