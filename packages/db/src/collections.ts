import type {
  ActivityRecord,
  AssetRecord,
  AudioSessionRecord,
  CommentRecord,
  DocumentPermissionRecord,
  DocumentRecord,
  DocumentUserStateRecord,
  FolderRecord,
  JobRecord,
  PageRecord,
  ShareLinkRecord,
  SmartFolderRecord,
  TagRecord,
  UploadRecord,
  VersionRecord,
  WorkspaceMemberRecord,
  WorkspaceRecord,
  YjsUpdateRecord,
} from "@pc/schema";
import type { Collection, Db, ObjectId } from "mongodb";

/**
 * Collection names. The Better Auth MongoDB adapter owns the four auth collections and uses its
 * default (singular) model names; ours are plural and camelCase.
 */
export const collections = {
  user: "user",
  session: "session",
  account: "account",
  verification: "verification",
  migrations: "_migrations",
  seed: "_seed",
  workspaces: "workspaces",
  workspaceMembers: "workspaceMembers",
  folders: "folders",
  documents: "documents",
  pages: "pages",
  documentPermissions: "documentPermissions",
  shareLinks: "shareLinks",
  tags: "tags",
  comments: "comments",
  versions: "versions",
  assets: "assets",
  audioSessions: "audioSessions",
  jobs: "jobs",
  activity: "activity",
  yjsUpdates: "yjsUpdates",
  uploads: "uploads",
  documentUserStates: "documentUserStates",
  smartFolders: "smartFolders",
} as const;

export type CollectionName = (typeof collections)[keyof typeof collections];

/** The Better Auth user document, as far as our code reads it. */
export interface AuthUserDocument {
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  plan?: string;
  storageUsedBytes?: number;
  settings?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Typed handles to every collection we own. */
export function typedCollections(db: Db) {
  const c = <T extends object>(name: string): Collection<T> => db.collection<T>(name);
  return {
    /** Better Auth's users. Read-mostly: Better Auth writes them (the seed is the exception). */
    users: c<AuthUserDocument & { _id: ObjectId }>(collections.user),
    workspaces: c<WorkspaceRecord>(collections.workspaces),
    workspaceMembers: c<WorkspaceMemberRecord>(collections.workspaceMembers),
    folders: c<FolderRecord>(collections.folders),
    documents: c<DocumentRecord>(collections.documents),
    pages: c<PageRecord>(collections.pages),
    documentPermissions: c<DocumentPermissionRecord>(collections.documentPermissions),
    shareLinks: c<ShareLinkRecord>(collections.shareLinks),
    tags: c<TagRecord>(collections.tags),
    comments: c<CommentRecord>(collections.comments),
    versions: c<VersionRecord>(collections.versions),
    assets: c<AssetRecord>(collections.assets),
    audioSessions: c<AudioSessionRecord>(collections.audioSessions),
    jobs: c<JobRecord>(collections.jobs),
    activity: c<ActivityRecord>(collections.activity),
    yjsUpdates: c<YjsUpdateRecord>(collections.yjsUpdates),
    uploads: c<UploadRecord>(collections.uploads),
    documentUserStates: c<DocumentUserStateRecord>(collections.documentUserStates),
    smartFolders: c<SmartFolderRecord>(collections.smartFolders),
  };
}

export type TypedCollections = ReturnType<typeof typedCollections>;
