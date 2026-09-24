/**
 * Demo data for local development and the Atlas dev database: two users, their personal
 * workspaces, a shared workspace, nested folders, 20 documents, tags, grants, comments and share
 * links in every state. Everything the seed creates is listed in a `_seed` manifest, and removal
 * deletes only what the manifest lists, never real users' data.
 */
import {
  commentRecordSchema,
  PAGE_SIZE_PRESETS,
  tagRecordSchema,
  type DocumentType,
  type PageSpec,
  type PaperTemplate,
  type WorkspaceRecord,
} from "@pc/schema";
import { ObjectId } from "mongodb";

import type { MongoConnection } from "../client";
import { collections, typedCollections, type TypedCollections } from "../collections";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { createRepositories } from "../repositories";
import { deleteDocumentsCascade } from "../repositories/cascade";
import { withTransaction } from "../transaction";

export const SEED_ID = "demo";

export const DEMO_USERS = {
  owner: { email: "tarinagarwal@gmail.com", name: "Tarin" },
  second: { email: "maya@paperchalk.dev", name: "Maya Rao" },
} as const;

/** The password on the seeded password-protected share link. */
export const DEMO_LINK_PASSWORD = "chalk-demo";

interface SeedManifest {
  _id: typeof SEED_ID;
  createdAt: Date;
  /** Better Auth user ids (ObjectId hex) the seed inserted. Existing users are never listed. */
  users: string[];
  workspaces: string[];
  folders: string[];
  documents: string[];
  tags: string[];
}

export interface SeedSummary {
  users: { email: string; id: string; created: boolean }[];
  workspaces: number;
  folders: number;
  documents: number;
  links: { label: string; token: string }[];
}

const DAY = 86_400_000;

interface User {
  id: string;
  email: string;
}

function paper(
  template: PaperTemplate,
  size: "a4" | "letter" | "a5" = "a4",
  spacingPt = 20,
): PageSpec {
  const { widthPt, heightPt } = PAGE_SIZE_PRESETS[size];
  return {
    sizePreset: size,
    widthPt,
    heightPt,
    rotation: 0,
    background: {
      kind: "paper",
      template,
      paperColor: template === "blank" ? "#fbf8f1" : "#ffffff",
      lineColor: "#cadcf1",
      spacingPt,
      marginPt: template.startsWith("ruled") || template === "cornell" ? 36 : 0,
    },
  };
}

async function ensureUser(
  c: TypedCollections,
  user: { email: string; name: string },
  now: Date,
): Promise<{ id: string; created: boolean }> {
  const existing = await c.users.findOne({ email: user.email });
  if (existing) return { id: existing._id.toHexString(), created: false };
  // Better Auth's MongoDB format: ObjectId _id, `settings` JSON as a string.
  const _id = new ObjectId();
  await c.users.insertOne({
    _id,
    name: user.name,
    email: user.email,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
    plan: "free",
    storageUsedBytes: 0,
    settings: "{}",
  });
  return { id: _id.toHexString(), created: true };
}

/** Seeds the demo data. Returns null when it is already there (remove it first to reseed). */
export async function seedDemo(
  conn: MongoConnection,
  options: { now?: Date } = {},
): Promise<SeedSummary | null> {
  const c = typedCollections(conn.db);
  const manifests = conn.db.collection<SeedManifest>(collections.seed);
  if (await manifests.findOne({ _id: SEED_ID })) return null;

  const today = options.now ?? new Date();
  let clock = today;
  /** Backdates everything created next, so lists have a realistic spread of dates. */
  const at = (daysAgo: number, hour = 10) => {
    clock = new Date(today.getTime() - daysAgo * DAY + (hour - 10) * 3_600_000);
  };
  const repos = createRepositories(conn, () => clock);
  const manifest: SeedManifest = {
    _id: SEED_ID,
    createdAt: today,
    users: [],
    workspaces: [],
    folders: [],
    documents: [],
    tags: [],
  };
  const ctx = (user: User): AccessContext => ({
    actor: { kind: "user", userId: user.id, email: user.email },
  });

  try {
    // Users and their personal workspaces. Only workspaces of users the seed created are listed:
    // an existing user's personal workspace may hold real work.
    at(30);
    const ownerUser = await ensureUser(c, DEMO_USERS.owner, clock);
    if (ownerUser.created) manifest.users.push(ownerUser.id);
    const secondUser = await ensureUser(c, DEMO_USERS.second, clock);
    if (secondUser.created) manifest.users.push(secondUser.id);
    const tarin: User = { id: ownerUser.id, email: DEMO_USERS.owner.email };
    const maya: User = { id: secondUser.id, email: DEMO_USERS.second.email };
    const personal = async (user: User, created: boolean) => {
      const workspace = await repos.ensurePersonalWorkspace(user.id);
      if (created) manifest.workspaces.push(workspace._id);
      return workspace;
    };
    const tarinHome = await personal(tarin, ownerUser.created);
    const mayaHome = await personal(maya, secondUser.created);

    // Shared workspace: Tarin owns it, Maya edits.
    at(28);
    const studio = await repos.workspaces.create(ctx(tarin), { name: "Studio Notes" });
    manifest.workspaces.push(studio._id);
    await repos.workspaces.addMember(ctx(tarin), studio._id, { userId: maya.id, role: "editor" });

    const folder = async (
      as: User,
      workspace: WorkspaceRecord,
      name: string,
      parentId: string | null = null,
    ) => {
      const created = await repos.folders.create(ctx(as), {
        workspaceId: workspace._id,
        parentId,
        name,
      });
      manifest.folders.push(created._id);
      return created._id;
    };
    at(27);
    const lectures = await folder(tarin, tarinHome, "Lectures");
    const week3 = await folder(tarin, tarinHome, "Week 3", lectures);
    const week4 = await folder(tarin, tarinHome, "Week 4", lectures);
    const home = await folder(tarin, tarinHome, "Home projects");
    const research = await folder(tarin, studio, "Research");
    const interviews = await folder(maya, studio, "Interviews", research);
    const planning = await folder(tarin, studio, "Planning");
    const drafts = await folder(maya, mayaHome, "Drafts");

    const tag = (name: string, color: string) => {
      const record = tagRecordSchema.parse({
        _id: newId(),
        workspaceId: studio._id,
        name,
        nameKey: name.toLowerCase(),
        color,
        createdAt: clock,
        updatedAt: clock,
      });
      manifest.tags.push(record._id);
      return record;
    };
    const urgent = tag("Urgent", "#b4412f");
    const review = tag("Review", "#2f5d8a");
    const ideas = tag("Ideas", "#5b7a3a");
    await c.tags.insertMany([urgent, review, ideas]);

    /** Creates documents by `who` in one place; each is backdated by `daysAgo`. */
    const place = (who: User, workspace: WorkspaceRecord, folderId: string | null) => {
      const create = async (
        type: DocumentType,
        title: string,
        daysAgo: number,
        pages: { pageCount: number; pageSpec: PageSpec } | null,
        tagIds: string[],
      ) => {
        at(daysAgo, 9 + (title.length % 8));
        const doc = await repos.documents.create(ctx(who), {
          workspaceId: workspace._id,
          folderId,
          type,
          title,
          ...pages,
        });
        manifest.documents.push(doc._id);
        if (tagIds.length > 0) await repos.documents.setTags(ctx(who), doc._id, tagIds);
        return doc._id;
      };
      return {
        notebook: (
          title: string,
          daysAgo: number,
          pageCount: number,
          pageSpec: PageSpec,
          tagIds: string[] = [],
        ) => create("notebook", title, daysAgo, { pageCount, pageSpec }, tagIds),
        canvas: (title: string, daysAgo: number, tagIds: string[] = []) =>
          create("canvas", title, daysAgo, null, tagIds),
      };
    };

    // 20 documents.
    const inWeek3 = place(tarin, tarinHome, week3);
    await inWeek3.notebook("Linear algebra, lecture 7", 21, 4, paper("ruledCollege"));
    await inWeek3.notebook("Problem set 3", 19, 2, paper("grid", "a4", 14.17));
    const inWeek4 = place(tarin, tarinHome, week4);
    const lecture8 = await inWeek4.notebook("Linear algebra, lecture 8", 12, 3, paper("cornell"));
    await inWeek4.canvas("Eigenvectors, visually", 11);
    await place(tarin, tarinHome, home).notebook(
      "Bookshelf measurements",
      6,
      1,
      paper("engineering", "letter", 18),
    );
    const scratch = await place(tarin, tarinHome, null).notebook(
      "Scratch",
      3,
      1,
      paper("dotGrid", "a5", 14.17),
    );

    const inPlanning = place(tarin, studio, planning);
    const roadmap = await inPlanning.canvas("Q4 roadmap", 26, [urgent._id]);
    await inPlanning.notebook("Launch checklist", 9, 2, paper("ruledNarrow"), [urgent._id]);
    await inPlanning.notebook("Weekly sync", 1, 5, paper("ruledCollege"));
    await place(maya, studio, research).notebook("Research plan", 24, 2, paper("ruledWide"), [
      review._id,
    ]);
    const inInterviews = place(maya, studio, interviews);
    const interview = await inInterviews.notebook(
      "Interview: Priya, teacher",
      17,
      3,
      paper("cornell"),
      [review._id],
    );
    await inInterviews.notebook("Interview: Arjun, student", 15, 2, paper("cornell"));
    const studioTop = { tarin: place(tarin, studio, null), maya: place(maya, studio, null) };
    await studioTop.maya.canvas("Onboarding flow sketches", 8, [ideas._id]);
    await studioTop.tarin.canvas("Pricing page wireframe", 5);
    await studioTop.maya.notebook("Design critique notes", 4, 1, paper("blank", "letter"), [
      ideas._id,
    ]);
    await studioTop.tarin.canvas("Retro board", 2);

    const inDrafts = place(maya, mayaHome, drafts);
    await inDrafts.notebook("Thesis outline", 20, 3, paper("ruledCollege"));
    const readingList = await inDrafts.notebook("Reading list", 14, 1, paper("ruledWide", "a5"));
    const mayaTop = place(maya, mayaHome, null);
    await mayaTop.canvas("Mood board", 7);
    await mayaTop.notebook("Grocery run", 0, 1, paper("ruledNarrow", "a5"));

    // Direct grants: Maya shares her reading list with Tarin; Tarin invites someone by email and
    // lends Maya a notebook for a month.
    at(13);
    await repos.documents.grant(ctx(maya), readingList, {
      principal: { kind: "user", userId: tarin.id },
      role: "commenter",
    });
    await repos.documents.grant(ctx(tarin), roadmap, {
      principal: { kind: "email", email: "guest.reader@paperchalk.dev" },
      role: "viewer",
    });
    await repos.documents.grant(ctx(tarin), lecture8, {
      principal: { kind: "user", userId: maya.id },
      role: "editor",
      expiresAt: new Date(today.getTime() + 30 * DAY),
    });

    // Share links in every state, all on the roadmap.
    at(20);
    const expired = await repos.documents.createShareLink(ctx(tarin), roadmap, {
      role: "viewer",
      expiresAt: new Date(today.getTime() - 13 * DAY),
    });
    at(10);
    const open = await repos.documents.createShareLink(ctx(tarin), roadmap, {
      role: "viewer",
      allowDownload: false,
    });
    const signedIn = await repos.documents.createShareLink(ctx(tarin), roadmap, {
      role: "commenter",
      requireSignIn: true,
    });
    const protectedLink = await repos.documents.createShareLink(ctx(tarin), roadmap, {
      role: "editor",
      password: DEMO_LINK_PASSWORD,
    });
    const revoked = await repos.documents.createShareLink(ctx(tarin), roadmap, { role: "viewer" });
    await repos.documents.revokeShareLink(ctx(tarin), roadmap, revoked._id);

    // A comment thread on the first interview page, with a resolved reply.
    const [firstPage, secondPage] = await repos.pages.list(ctx(maya), interview);
    if (firstPage) {
      at(16);
      const threadId = newId();
      await c.comments.insertMany([
        commentRecordSchema.parse({
          _id: threadId,
          documentId: interview,
          pageId: firstPage._id,
          anchor: { kind: "area", x: 72, y: 180, width: 300, height: 90 },
          threadId,
          authorId: tarin.id,
          body: "Can we get a quote from her on grading with a stylus?",
          resolvedAt: null,
          resolvedBy: null,
          createdAt: clock,
          updatedAt: clock,
          deletedAt: null,
        }),
        commentRecordSchema.parse({
          _id: newId(),
          documentId: interview,
          pageId: firstPage._id,
          anchor: { kind: "point", x: 380, y: 210 },
          threadId,
          authorId: maya.id,
          body: "Added it on page 2, second paragraph.",
          resolvedAt: new Date(clock.getTime() + 2 * 3_600_000),
          resolvedBy: tarin.id,
          createdAt: new Date(clock.getTime() + 3_600_000),
          updatedAt: new Date(clock.getTime() + 2 * 3_600_000),
          deletedAt: null,
        }),
      ]);
    }
    // Tarin (workspace owner) locks the page Maya's transcript is on.
    if (secondPage) await repos.pages.setLocked(ctx(tarin), interview, secondPage._id, true);

    // Something in the trash.
    at(2);
    await repos.documents.trash(ctx(tarin), scratch);

    return {
      users: [
        { email: tarin.email, id: tarin.id, created: ownerUser.created },
        { email: maya.email, id: maya.id, created: secondUser.created },
      ],
      workspaces: 3,
      folders: manifest.folders.length,
      documents: manifest.documents.length,
      links: [
        { label: "viewer, downloads off", token: open.token },
        { label: "commenter, sign-in required", token: signedIn.token },
        { label: `editor, password "${DEMO_LINK_PASSWORD}"`, token: protectedLink.token },
        { label: "viewer, expired", token: expired.token },
        { label: "viewer, revoked", token: revoked.token },
      ],
    };
  } finally {
    // Written even if seeding fails halfway, so `--reset` can clean up a partial seed.
    await manifests.insertOne(manifest);
  }
}

/**
 * Removes everything the seed created, in one transaction: its documents (and anything added to
 * its workspaces since), folders, tags, workspaces, and the users it inserted with their sessions,
 * accounts, memberships and grants. Returns false when there is no seed to remove.
 */
export async function removeSeed(conn: MongoConnection): Promise<boolean> {
  const c = typedCollections(conn.db);
  const manifests = conn.db.collection<SeedManifest>(collections.seed);
  const manifest = await manifests.findOne({ _id: SEED_ID });
  if (!manifest) return false;

  const inSeededWorkspaces = await c.documents
    .find({ workspaceId: { $in: manifest.workspaces } }, { projection: { _id: 1 } })
    .toArray();
  const documentIds = [
    ...new Set([...manifest.documents, ...inSeededWorkspaces.map((d) => d._id)]),
  ];
  const userObjectIds = manifest.users.map((u) => ObjectId.createFromHexString(u));
  // Better Auth stores session/account userId as an ObjectId; match the string form too.
  const authUserRefs = { userId: { $in: [...userObjectIds, ...manifest.users] } };

  await withTransaction(conn.client, async (session) => {
    await deleteDocumentsCascade(c, documentIds, session);
    const inWorkspaces = { workspaceId: { $in: manifest.workspaces } };
    await c.folders.deleteMany(
      { $or: [{ _id: { $in: manifest.folders } }, inWorkspaces] },
      { session },
    );
    await c.tags.deleteMany({ $or: [{ _id: { $in: manifest.tags } }, inWorkspaces] }, { session });
    await c.workspaceMembers.deleteMany(
      { $or: [inWorkspaces, { userId: { $in: manifest.users } }] },
      { session },
    );
    await c.workspaces.deleteMany({ _id: { $in: manifest.workspaces } }, { session });
    await c.documentPermissions.deleteMany(
      { "principal.kind": "user", "principal.userId": { $in: manifest.users } },
      { session },
    );
    await conn.db.collection(collections.session).deleteMany(authUserRefs, { session });
    await conn.db.collection(collections.account).deleteMany(authUserRefs, { session });
    await c.users.deleteMany({ _id: { $in: userObjectIds } }, { session });
    await manifests.deleteOne({ _id: SEED_ID }, { session });
  });
  return true;
}
