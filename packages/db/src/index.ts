export { createMongo, pingDb, type ConnectOptions, type MongoConnection } from "./client";
export {
  collections,
  typedCollections,
  type CollectionName,
  type TypedCollections,
} from "./collections";
export { AccessDeniedError, InvalidRequestError } from "./errors";
export { newId, newToken } from "./ids";
export { withTransaction } from "./transaction";
export {
  actorId,
  can,
  effectiveRole,
  type AccessContext,
  type Actor,
  type Resource,
} from "./permissions/can";
export type { Decision, Denied, DenyReason } from "./permissions/decide";
export {
  createFileRepositories,
  createRepositories,
  DEFAULT_NOTEBOOK_PAGE,
  type DocumentWithRole,
  type ExpiredPurgeResult,
  type FileRepositories,
  type LibraryItem,
  type LibraryResult,
  type PurgeFailure,
  type Repositories,
  type ShareLinkView,
  type UploadInitResult,
  type VerificationResult,
  type WorkspaceWithRole,
} from "./repositories";
export { storageAccount, type StorageAccount } from "./repositories/quota";
// Migrations live at "@pc/db/migrations" so app bundles never pull them in.
