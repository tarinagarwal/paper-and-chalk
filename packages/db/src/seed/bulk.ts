/**
 * A big workspace for performance work: thousands of documents with realistic titles, types,
 * sizes, dates, folders and tags, written in bulk (the repositories would take minutes). Used by
 * `pnpm db:seed --bulk <count>` and the library's end-to-end tests.
 */
import {
  documentPermissionRecordSchema,
  documentRecordSchema,
  tagRecordSchema,
  titleSortKey,
  trigrams,
  type DocumentRecord,
  type DocumentType,
} from "@pc/schema";

import type { MongoConnection } from "../client";
import { typedCollections } from "../collections";
import { newId } from "../ids";
import type { AccessContext } from "../permissions/can";
import { createRepositories } from "../repositories";

const DAY = 86_400_000;
const MB = 1024 * 1024;

const SUBJECTS = [
  "Linear algebra",
  "Organic chemistry",
  "Microeconomics",
  "World history",
  "Cell biology",
  "Thermodynamics",
  "Statistics",
  "Contract law",
  "Machine learning",
  "Poetry",
  "Anatomy",
  "Marketing",
];
const KINDS: Record<DocumentType, string[]> = {
  notebook: ["lecture", "notes", "problem set", "revision", "lab notebook"],
  canvas: ["mind map", "board", "sketches", "diagram"],
  pdf: ["slides", "reading", "past paper", "handout", "textbook chapter"],
};
const FOLDERS = ["Semester 1", "Semester 2", "Research", "Reading", "Admin", "Archive"];
const TAG_NAMES = ["Exam", "Review", "Important", "Group work", "Draft", "Done"];
const TAG_COLORS = ["#c43e18", "#2f5d8a", "#5b7a3a", "#6b4fa0", "#c98a1b", "#2f7d74"];
const TYPES: DocumentType[] = ["notebook", "notebook", "notebook", "pdf", "pdf", "canvas"];

/** Deterministic pseudo-random numbers, so every bulk seed looks the same. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

export interface BulkSeedResult {
  workspaceId: string;
  folders: number;
  documents: number;
}

export async function seedBulkWorkspace(
  conn: MongoConnection,
  input: { ownerId: string; ownerEmail: string; count: number; name?: string; now?: Date },
): Promise<BulkSeedResult> {
  const c = typedCollections(conn.db);
  const repos = createRepositories(conn);
  const ctx: AccessContext = {
    actor: { kind: "user", userId: input.ownerId, email: input.ownerEmail },
  };
  const now = input.now ?? new Date();
  const rand = random(input.count);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;

  const workspace = await repos.workspaces.create(ctx, {
    name: input.name ?? `Bulk library (${input.count.toLocaleString("en-GB")})`,
  });
  const folderIds: string[] = [];
  for (const name of FOLDERS) {
    const top = await repos.folders.create(ctx, { workspaceId: workspace._id, name });
    folderIds.push(top._id);
    for (const subject of SUBJECTS.slice(0, 2)) {
      const child = await repos.folders.create(ctx, {
        workspaceId: workspace._id,
        parentId: top._id,
        name: subject,
      });
      folderIds.push(child._id);
    }
  }
  const tags = TAG_NAMES.map((name, i) =>
    tagRecordSchema.parse({
      _id: newId(),
      workspaceId: workspace._id,
      name,
      nameKey: name.toLowerCase(),
      color: TAG_COLORS[i],
      createdAt: now,
      updatedAt: now,
    }),
  );
  await c.tags.insertMany(tags);

  const BATCH = 1000;
  for (let start = 0; start < input.count; start += BATCH) {
    const documents: DocumentRecord[] = [];
    for (let i = start; i < Math.min(start + BATCH, input.count); i++) {
      const type = pick(TYPES);
      const title = `${pick(SUBJECTS)}, ${pick(KINDS[type])} ${String(1 + Math.floor(rand() * 40))}`;
      const createdAt = new Date(now.getTime() - Math.floor(rand() * 365 * DAY));
      const updatedAt = new Date(
        Math.min(now.getTime(), createdAt.getTime() + Math.floor(rand() * 60 * DAY)),
      );
      const tagCount = rand() < 0.2 ? 1 + Math.floor(rand() * 2) : 0;
      documents.push(
        documentRecordSchema.parse({
          _id: newId(),
          workspaceId: workspace._id,
          folderId: rand() < 0.7 ? pick(folderIds) : null,
          type,
          title,
          titleTrigrams: trigrams(title),
          titleKey: titleSortKey(title),
          cover: null,
          defaultPageSpec: null,
          sourcePdfPath: null,
          pageCount: type === "canvas" ? 0 : 1 + Math.floor(rand() * 40),
          bytes: type === "pdf" ? Math.floor((0.2 + rand() * 30) * MB) : Math.floor(rand() * MB),
          thumbnailPath: null,
          tagIds: [...new Set(Array.from({ length: tagCount }, () => pick(tags)._id))],
          isShared: false,
          editorsCanShare: false,
          createdBy: input.ownerId,
          deletedBy: null,
          createdAt,
          updatedAt,
          deletedAt: null,
        }),
      );
    }
    await c.documents.insertMany(documents, { ordered: false });
    await c.documentPermissions.insertMany(
      documents.map((d) =>
        documentPermissionRecordSchema.parse({
          _id: newId(),
          documentId: d._id,
          principal: { kind: "user", userId: input.ownerId },
          role: "owner",
          expiresAt: null,
          grantedBy: input.ownerId,
          createdAt: d.createdAt,
          updatedAt: d.createdAt,
        }),
      ),
      { ordered: false },
    );
  }
  return { workspaceId: workspace._id, folders: folderIds.length, documents: input.count };
}
