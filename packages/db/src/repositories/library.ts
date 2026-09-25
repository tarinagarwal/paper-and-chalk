/**
 * The library query (SPEC.md section 5): one call answers every library view (home, folder, tag,
 * trash, recents, favourites, shared with me, search) with filters, any sort and paging.
 *
 * Big views (a workspace, a folder, a tag) page through MongoDB with keyset cursors on the sort
 * indexes from migration 0004, so the 200th page costs the same as the first. Small views (trash,
 * recents, favourites, shared, search results) have at most a few thousand candidates; those are
 * loaded, permission-checked, sorted and paged in memory.
 */
import {
  libraryQuerySchema,
  trigrams,
  trigramSimilarity,
  type DocumentAbilities,
  type DocumentAction,
  type DocumentRecord,
  type LibraryFilters,
  type LibraryQuery,
  type LibraryScope,
  type LibrarySort,
  type Role,
  type SortDir,
  type TagRecord,
} from "@pc/schema";
import { ObjectId, type Document } from "mongodb";

import { InvalidRequestError } from "../errors";
import type { AccessContext } from "../permissions/can";
import { decideDocument, type DocumentFacts } from "../permissions/decide";
import { authorize, requireUser, type RepoContext } from "./context";

export interface LibraryItem {
  document: DocumentRecord;
  role: Role;
  can: DocumentAbilities;
  owner: { id: string; name: string };
  tags: TagRecord[];
  favourite: boolean;
  lastOpenedAt: Date | null;
}

export interface LibraryResult {
  items: LibraryItem[];
  nextCursor: string | null;
  /** Documents in the whole view; only computed for the first page. */
  total: number | null;
}

/** Recents keeps the latest opens only; the other small views are capped for safety. */
const RECENTS_LIMIT = 100;
const SET_LIMIT = 1000;
const TRASH_LIMIT = 5000;
const SEARCH_CANDIDATES = 500;
const SEARCH_RESULTS = 100;
const SEARCH_MIN_SCORE = 0.15;

// ---------------------------------------------------------------------------------------------
// cursors

/** Where the previous page stopped: its last item's sort value and id (dates as epoch ms). */
interface Cursor {
  /** "last opened" pages go through opened documents first, then never-opened ones. */
  p?: "opened" | "rest";
  v: string | number;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof value === "object" &&
      value !== null &&
      "v" in value &&
      "id" in value &&
      typeof value.id === "string" &&
      (typeof value.v === "string" || typeof value.v === "number")
    ) {
      const p = "p" in value ? value.p : undefined;
      if (p === undefined) return { v: value.v, id: value.id };
      if (p === "opened" || p === "rest") return { p, v: value.v, id: value.id };
    }
  } catch {
    // Reported below.
  }
  throw new InvalidRequestError("bad_cursor", "This list changed. Reload it to continue.");
}

// ---------------------------------------------------------------------------------------------
// sorting

/** Document fields behind the indexed sorts. */
const FIELD = {
  modified: "updatedAt",
  created: "createdAt",
  name: "titleKey",
  size: "bytes",
} as const satisfies Partial<Record<LibrarySort, keyof DocumentRecord>>;
type FieldSort = keyof typeof FIELD;

const isFieldSort = (sort: LibrarySort): sort is FieldSort => sort in FIELD;

function fieldValue(doc: DocumentRecord, sort: FieldSort): string | number {
  switch (sort) {
    case "modified":
      return doc.updatedAt.getTime();
    case "created":
      return doc.createdAt.getTime();
    case "name":
      return doc.titleKey;
    case "size":
      return doc.bytes;
  }
}

/** A cursor value back in the field's stored type (dates travel as epoch ms). */
function storedValue(sort: FieldSort, value: string | number): string | number | Date {
  if (sort === "modified" || sort === "created") return new Date(Number(value));
  if (sort === "size") return Number(value);
  return String(value);
}

/** Documents after (field, _id) = (value, id) in the given direction. */
function keysetAfter(field: string, dir: 1 | -1, value: unknown, id: string): Document {
  const op = dir === 1 ? "$gt" : "$lt";
  return { $or: [{ [field]: { [op]: value } }, { [field]: value, _id: { [op]: id } }] };
}

function compareKeys(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// filters

/** The toolbar filters as a MongoDB condition. Owner means creator. */
export function filterClause(filters: LibraryFilters, userId: string): Document {
  const clause: Document = {};
  if (filters.types.length > 0) clause.type = { $in: filters.types };
  if (filters.owner === "me") clause.createdBy = userId;
  else if (filters.owner === "others") clause.createdBy = { $ne: userId };
  if (filters.tagIds.length > 0) clause.tagIds = { $all: filters.tagIds };
  if (filters.shared !== "any") clause.isShared = filters.shared === "shared";
  return clause;
}

// ---------------------------------------------------------------------------------------------

interface User {
  userId: string;
  email: string;
}

interface Access {
  role: Role;
  can: DocumentAbilities;
}

export function libraryRepository(r: RepoContext) {
  const { c } = r;

  /**
   * The user's role and abilities on each document, from the same rules as `can()` (decide.ts)
   * with the facts loaded in two queries for the whole page. Documents the user may not see are
   * left out of the map.
   */
  async function accessFor(
    ctx: AccessContext,
    user: User,
    docs: readonly DocumentRecord[],
  ): Promise<Map<string, Access>> {
    const result = new Map<string, Access>();
    if (docs.length === 0) return result;
    const now = ctx.now ?? r.now();
    const [memberships, grants] = await Promise.all([
      c.workspaceMembers
        .find(
          {
            userId: user.userId,
            workspaceId: { $in: [...new Set(docs.map((d) => d.workspaceId))] },
          },
          { projection: { workspaceId: 1, role: 1 } },
        )
        .toArray(),
      c.documentPermissions
        .find(
          {
            documentId: { $in: docs.map((d) => d._id) },
            $or: [
              { "principal.kind": "user", "principal.userId": user.userId },
              { "principal.kind": "email", "principal.email": user.email.toLowerCase() },
            ],
          },
          { projection: { documentId: 1, role: 1, expiresAt: 1 } },
        )
        .toArray(),
    ]);
    const workspaceRole = new Map(memberships.map((m) => [m.workspaceId, m.role]));
    const grantsOf = new Map<string, { role: Role; expiresAt: Date | null }[]>();
    for (const g of grants) {
      const list = grantsOf.get(g.documentId) ?? [];
      list.push({ role: g.role, expiresAt: g.expiresAt });
      grantsOf.set(g.documentId, list);
    }
    for (const doc of docs) {
      const facts: DocumentFacts = {
        now,
        isGuest: false,
        workspaceRole: workspaceRole.get(doc.workspaceId) ?? null,
        grants: grantsOf.get(doc._id) ?? [],
        link: null,
        deleted: doc.deletedAt !== null,
        editorsCanShare: doc.editorsCanShare,
      };
      const view = decideDocument(facts, "view");
      if (!view.allowed) continue;
      const allowed = (action: DocumentAction) => decideDocument(facts, action).allowed;
      result.set(doc._id, {
        role: view.role,
        can: {
          edit: allowed("edit"),
          delete: allowed("delete"),
          restore: allowed("restore"),
          purge: allowed("purge"),
          duplicate: allowed("download"),
        },
      });
    }
    return result;
  }

  /** Display names of document creators (Better Auth users). */
  async function ownerNames(userIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)].filter((id) => ObjectId.isValid(id) && id.length === 24);
    if (ids.length === 0) return new Map();
    const users = await c.users
      .find(
        { _id: { $in: ids.map((id) => ObjectId.createFromHexString(id)) } },
        { projection: { name: 1 } },
      )
      .toArray();
    return new Map(users.map((u) => [u._id.toHexString(), u.name]));
  }

  /** Owner names, tags and the user's favourite / last-opened state for a page of documents. */
  async function enrich(
    user: User,
    docs: readonly DocumentRecord[],
    access: Map<string, Access>,
  ): Promise<LibraryItem[]> {
    const visible = docs.filter((d) => access.has(d._id));
    if (visible.length === 0) return [];
    const [states, tags, names] = await Promise.all([
      c.documentUserStates
        .find({ userId: user.userId, documentId: { $in: visible.map((d) => d._id) } })
        .toArray(),
      c.tags.find({ _id: { $in: [...new Set(visible.flatMap((d) => d.tagIds))] } }).toArray(),
      ownerNames(visible.map((d) => d.createdBy)),
    ]);
    const stateOf = new Map(states.map((s) => [s.documentId, s]));
    const tagOf = new Map(tags.map((t) => [t._id, t]));
    return visible.flatMap((document) => {
      const granted = access.get(document._id);
      if (!granted) return [];
      const state = stateOf.get(document._id);
      return [
        {
          document,
          role: granted.role,
          can: granted.can,
          owner: { id: document.createdBy, name: names.get(document.createdBy) ?? "Unknown" },
          tags: document.tagIds.flatMap((id) => {
            const tag = tagOf.get(id);
            return tag ? [tag] : [];
          }),
          favourite: Boolean(state?.favoritedAt),
          lastOpenedAt: state?.lastOpenedAt ?? null,
        },
      ];
    });
  }

  // -------------------------------------------------------------------------------------------
  // indexed views: a workspace, a folder, a tag

  async function indexedScope(
    ctx: AccessContext,
    scope: Extract<LibraryScope, { kind: "home" | "folder" | "tag" }>,
  ): Promise<{ workspaceId: string; where: Document }> {
    switch (scope.kind) {
      case "home":
        await authorize(r, ctx, { type: "workspace", workspaceId: scope.workspaceId }, "view");
        return { workspaceId: scope.workspaceId, where: { workspaceId: scope.workspaceId } };
      case "folder": {
        await authorize(r, ctx, { type: "folder", folderId: scope.folderId }, "view");
        const folder = await c.folders.findOne({ _id: scope.folderId, deletedAt: null });
        if (!folder) throw new InvalidRequestError("not_found", "Folder not found");
        return {
          workspaceId: folder.workspaceId,
          where: { workspaceId: folder.workspaceId, folderId: folder._id },
        };
      }
      case "tag": {
        const tag = await c.tags.findOne({ _id: scope.tagId });
        if (!tag) throw new InvalidRequestError("not_found", "Tag not found");
        await authorize(r, ctx, { type: "workspace", workspaceId: tag.workspaceId }, "view");
        return {
          workspaceId: tag.workspaceId,
          where: { workspaceId: tag.workspaceId, tagIds: tag._id },
        };
      }
    }
  }

  async function fieldPage(
    where: Document,
    sort: FieldSort,
    dir: SortDir,
    cursor: Cursor | null,
    limit: number,
  ): Promise<{ docs: DocumentRecord[]; next: Cursor | null }> {
    const field = FIELD[sort];
    const d = dir === "asc" ? 1 : -1;
    const conditions = [where];
    if (cursor) conditions.push(keysetAfter(field, d, storedValue(sort, cursor.v), cursor.id));
    const found = await c.documents
      .find({ $and: conditions })
      .sort({ [field]: d, _id: d })
      .limit(limit + 1)
      .toArray();
    const docs = found.slice(0, limit);
    const last = docs.at(-1);
    return {
      docs,
      next: found.length > limit && last ? { v: fieldValue(last, sort), id: last._id } : null,
    };
  }

  /**
   * "Last opened" in a big view: documents the user opened (newest open first, from their
   * per-user state), then the ones they never opened (most recently modified first). Both parts
   * walk indexes in batches, so neither loads the whole view.
   */
  async function lastOpenedPage(
    user: User,
    workspaceId: string,
    where: Document,
    cursor: Cursor | null,
    limit: number,
  ): Promise<{ docs: DocumentRecord[]; next: Cursor | null }> {
    const want = limit + 1;
    const out: { doc: DocumentRecord; cursor: Cursor }[] = [];

    if (cursor?.p !== "rest") {
      let after = cursor?.p === "opened" ? { at: new Date(Number(cursor.v)), id: cursor.id } : null;
      const batchSize = 200;
      for (;;) {
        const stateFilter: Document = {
          userId: user.userId,
          workspaceId,
          lastOpenedAt: { $type: "date" },
        };
        if (after) {
          stateFilter.$or = [
            { lastOpenedAt: { $lt: after.at } },
            { lastOpenedAt: after.at, documentId: { $lt: after.id } },
          ];
        }
        const states = await c.documentUserStates
          .find(stateFilter)
          .sort({ lastOpenedAt: -1, documentId: -1 })
          .limit(batchSize)
          .toArray();
        const docs = await c.documents
          .find({ $and: [where, { _id: { $in: states.map((s) => s.documentId) } }] })
          .toArray();
        const byId = new Map(docs.map((d) => [d._id, d]));
        for (const state of states) {
          const doc = byId.get(state.documentId);
          if (doc && state.lastOpenedAt && out.length < want) {
            out.push({
              doc,
              cursor: { p: "opened", v: state.lastOpenedAt.getTime(), id: doc._id },
            });
          }
        }
        const last = states.at(-1);
        if (out.length >= want || states.length < batchSize || !last?.lastOpenedAt) break;
        after = { at: last.lastOpenedAt, id: last.documentId };
      }
    }

    if (out.length < want) {
      let after = cursor?.p === "rest" ? { v: new Date(Number(cursor.v)), id: cursor.id } : null;
      let batchSize = 100;
      for (;;) {
        const conditions = [where];
        if (after) conditions.push(keysetAfter("updatedAt", -1, after.v, after.id));
        const batch = await c.documents
          .find({ $and: conditions })
          .sort({ updatedAt: -1, _id: -1 })
          .limit(batchSize)
          .toArray();
        const opened = new Set(
          (
            await c.documentUserStates
              .find(
                {
                  userId: user.userId,
                  documentId: { $in: batch.map((d) => d._id) },
                  lastOpenedAt: { $type: "date" },
                },
                { projection: { documentId: 1 } },
              )
              .toArray()
          ).map((s) => s.documentId),
        );
        for (const doc of batch) {
          if (!opened.has(doc._id) && out.length < want) {
            out.push({ doc, cursor: { p: "rest", v: doc.updatedAt.getTime(), id: doc._id } });
          }
        }
        const last = batch.at(-1);
        if (out.length >= want || batch.length < batchSize || !last) break;
        after = { v: last.updatedAt, id: last._id };
        batchSize = Math.min(batchSize * 2, 1000);
      }
    }

    const page = out.slice(0, limit);
    const last = page.at(-1);
    return { docs: page.map((i) => i.doc), next: out.length > limit && last ? last.cursor : null };
  }

  // -------------------------------------------------------------------------------------------
  // small views: loaded whole, sorted and paged in memory

  interface Candidates {
    filter: Document;
    cap: number;
    /** Relevance per document (search only). */
    scores?: Map<string, number>;
  }

  async function candidateScope(
    ctx: AccessContext,
    user: User,
    scope: Exclude<LibraryScope, { kind: "home" | "folder" | "tag" }>,
  ): Promise<Candidates> {
    const now = ctx.now ?? r.now();
    switch (scope.kind) {
      case "trash":
        await authorize(r, ctx, { type: "workspace", workspaceId: scope.workspaceId }, "view");
        return {
          filter: { workspaceId: scope.workspaceId, deletedAt: { $ne: null } },
          cap: TRASH_LIMIT,
        };
      case "recents":
      case "favourites": {
        const field = scope.kind === "recents" ? "lastOpenedAt" : "favoritedAt";
        const states = await c.documentUserStates
          .find(
            { userId: user.userId, [field]: { $type: "date" } },
            { projection: { documentId: 1 } },
          )
          .sort({ [field]: -1 })
          .limit(scope.kind === "recents" ? RECENTS_LIMIT : SET_LIMIT)
          .toArray();
        return {
          filter: { _id: { $in: states.map((s) => s.documentId) }, deletedAt: null },
          cap: SET_LIMIT,
        };
      }
      case "shared": {
        // Direct grants (by user id or email) on other people's documents, outside the user's
        // workspaces: documents in their workspaces are already in their library.
        const grants = await c.documentPermissions
          .find(
            {
              $and: [
                {
                  $or: [
                    { "principal.kind": "user", "principal.userId": user.userId },
                    { "principal.kind": "email", "principal.email": user.email.toLowerCase() },
                  ],
                },
                { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
              ],
            },
            { projection: { documentId: 1 } },
          )
          .limit(SET_LIMIT)
          .toArray();
        const memberOf = (
          await c.workspaceMembers
            .find({ userId: user.userId }, { projection: { workspaceId: 1 } })
            .toArray()
        ).map((m) => m.workspaceId);
        return {
          filter: {
            _id: { $in: [...new Set(grants.map((g) => g.documentId))] },
            deletedAt: null,
            workspaceId: { $nin: memberOf },
            createdBy: { $ne: user.userId },
          },
          cap: SET_LIMIT,
        };
      }
      case "search": {
        await authorize(r, ctx, { type: "workspace", workspaceId: scope.workspaceId }, "view");
        const grams = trigrams(scope.q);
        if (grams.length === 0) return { filter: { _id: { $in: [] } }, cap: 0, scores: new Map() };
        const candidates = await c.documents
          .find(
            { workspaceId: scope.workspaceId, deletedAt: null, titleTrigrams: { $in: grams } },
            { projection: { _id: 1, titleTrigrams: 1 } },
          )
          .limit(SEARCH_CANDIDATES)
          .toArray();
        const scored = candidates
          .map((d) => ({ id: d._id, score: trigramSimilarity(grams, d.titleTrigrams) }))
          .filter((hit) => hit.score >= SEARCH_MIN_SCORE)
          .sort((a, b) => b.score - a.score)
          .slice(0, SEARCH_RESULTS);
        return {
          filter: { _id: { $in: scored.map((s) => s.id) } },
          cap: SEARCH_RESULTS,
          scores: new Map(scored.map((s) => [s.id, s.score])),
        };
      }
    }
  }

  function memorySortValue(
    doc: DocumentRecord,
    sort: LibrarySort,
    opened: Map<string, Date>,
    scores: Map<string, number> | undefined,
  ): string | number {
    if (isFieldSort(sort)) return fieldValue(doc, sort);
    if (sort === "lastOpened") return opened.get(doc._id)?.getTime() ?? -1;
    return scores?.get(doc._id) ?? 0;
  }

  // -------------------------------------------------------------------------------------------

  return {
    /** One page of a library view. The user needs to see the scope; each item is checked too. */
    async query(ctx: AccessContext, input: LibraryQuery): Promise<LibraryResult> {
      const user = requireUser(ctx);
      const q = libraryQuerySchema.parse(input);
      const cursor = q.cursor ? decodeCursor(q.cursor) : null;
      const clause = filterClause(q.filters, user.userId);
      const { scope } = q;

      if (scope.kind === "home" || scope.kind === "folder" || scope.kind === "tag") {
        const { workspaceId, where } = await indexedScope(ctx, scope);
        const live = { $and: [where, { deletedAt: null }, clause] };
        const page =
          q.sort === "lastOpened"
            ? await lastOpenedPage(user, workspaceId, live, cursor, q.limit)
            : await fieldPage(
                live,
                isFieldSort(q.sort) ? q.sort : "modified",
                q.dir,
                cursor,
                q.limit,
              );
        const access = await accessFor(ctx, user, page.docs);
        return {
          items: await enrich(user, page.docs, access),
          nextCursor: page.next ? encodeCursor(page.next) : null,
          total: cursor ? null : await c.documents.countDocuments(live),
        };
      }

      const candidates = await candidateScope(ctx, user, scope);
      const loaded =
        candidates.cap === 0
          ? []
          : await c.documents
              .find({ $and: [candidates.filter, clause] })
              .sort({ deletedAt: -1, updatedAt: -1 })
              .limit(candidates.cap)
              .toArray();
      const access = await accessFor(ctx, user, loaded);
      const visible = loaded.filter((d) => access.has(d._id));
      const opened = new Map<string, Date>();
      if (q.sort === "lastOpened" && visible.length > 0) {
        const states = await c.documentUserStates
          .find({
            userId: user.userId,
            documentId: { $in: visible.map((d) => d._id) },
            lastOpenedAt: { $type: "date" },
          })
          .toArray();
        for (const s of states) if (s.lastOpenedAt) opened.set(s.documentId, s.lastOpenedAt);
      }
      const sort: LibrarySort =
        q.sort === "relevance" && scope.kind !== "search" ? "modified" : q.sort;
      const sign = q.dir === "asc" ? 1 : -1;
      const keyed = visible.map((doc) => ({
        doc,
        v: memorySortValue(doc, sort, opened, candidates.scores),
      }));
      const compare = (
        a: { v: string | number; id: string },
        b: { v: string | number; id: string },
      ) => sign * (compareKeys(a.v, b.v) || compareKeys(a.id, b.id));
      keyed.sort((a, b) => compare({ v: a.v, id: a.doc._id }, { v: b.v, id: b.doc._id }));
      const start = cursor
        ? keyed.findIndex((k) => compare({ v: k.v, id: k.doc._id }, cursor) > 0)
        : 0;
      const pageKeys = start < 0 ? [] : keyed.slice(start, start + q.limit);
      const last = pageKeys.at(-1);
      const hasMore = start >= 0 && start + q.limit < keyed.length;
      return {
        items: await enrich(
          user,
          pageKeys.map((k) => k.doc),
          access,
        ),
        nextCursor: hasMore && last ? encodeCursor({ v: last.v, id: last.doc._id }) : null,
        total: cursor ? null : keyed.length,
      };
    },
  };
}
