import type { MongoConnection } from "../client";
import { typedCollections, type TypedCollections } from "../collections";
import { AccessDeniedError, assertAllowed } from "../errors";
import { can, type AccessContext, type ActionFor, type Resource } from "../permissions/can";
import { deny } from "../permissions/decide";

export interface RepoContext {
  conn: MongoConnection;
  c: TypedCollections;
  now: () => Date;
}

export function repoContext(
  conn: MongoConnection,
  now: () => Date = () => new Date(),
): RepoContext {
  return { conn, c: typedCollections(conn.db), now };
}

/** Checks a permission and throws AccessDeniedError on "no". Returns the effective role. */
export async function authorize<R extends Resource>(
  r: RepoContext,
  ctx: AccessContext,
  resource: R,
  action: ActionFor<R>,
) {
  const decision = await can(r.c, { ...ctx, now: ctx.now ?? r.now() }, resource, action);
  assertAllowed(decision);
  return decision.role;
}

/** Repositories that create things need a signed-in user, never a guest. */
export function requireUser(ctx: AccessContext): { userId: string; email: string } {
  if (ctx.actor.kind !== "user") {
    throw new AccessDeniedError(deny("guests_not_allowed"));
  }
  return ctx.actor;
}
