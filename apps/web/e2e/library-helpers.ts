import { createMongo, createRepositories, typedCollections, type MongoConnection } from "@pc/db";
import { seedBulkWorkspace } from "@pc/db/seed";
import type { DocumentType } from "@pc/schema";
import { expect, type Page } from "@playwright/test";

import { E2E_MONGODB_URI } from "../playwright.config";

/** The user auth.setup.ts signs in; its session is AUTH_STATE. */
export const E2E_EMAIL = "e2e-user@paperchalk.test";

const DAY = 86_400_000;

async function withDb<T>(run: (conn: MongoConnection) => Promise<T>): Promise<T> {
  const conn = createMongo(E2E_MONGODB_URI, { appName: "paper-chalk-e2e", maxPoolSize: 2 });
  try {
    return await run(conn);
  } finally {
    await conn.close();
  }
}

async function e2eUser(conn: MongoConnection) {
  const user = await typedCollections(conn.db).users.findOne({ email: E2E_EMAIL });
  if (!user) throw new Error("the e2e user has not signed in yet");
  return { userId: user._id.toHexString(), email: E2E_EMAIL };
}

export interface SeedSpec {
  folders?: { name: string; parent?: string }[];
  tags?: string[];
  docs: {
    title: string;
    type?: DocumentType;
    folder?: string;
    tags?: string[];
    daysAgo?: number;
  }[];
}

export interface Seeded {
  workspaceId: string;
  folders: Record<string, string>;
  tags: Record<string, string>;
  docs: Record<string, string>;
}

/**
 * A fresh team workspace owned by the shared e2e user, so tests running in parallel never see each
 * other's documents. Documents are backdated by `daysAgo` (default: in list order, newest last).
 */
export async function seedWorkspace(name: string, spec: SeedSpec): Promise<Seeded> {
  return withDb(async (conn) => {
    const user = await e2eUser(conn);
    const ctx = { actor: { kind: "user" as const, ...user } };
    let clock = new Date(Date.now() - 60 * DAY);
    const repos = createRepositories(conn, () => clock);
    const workspace = await repos.workspaces.create(ctx, { name });
    const seeded: Seeded = { workspaceId: workspace._id, folders: {}, tags: {}, docs: {} };
    for (const folder of spec.folders ?? []) {
      const created = await repos.folders.create(ctx, {
        workspaceId: workspace._id,
        name: folder.name,
        parentId: folder.parent ? (seeded.folders[folder.parent] ?? null) : null,
      });
      seeded.folders[folder.name] = created._id;
    }
    for (const [i, tag] of (spec.tags ?? []).entries()) {
      const created = await repos.tags.create(ctx, {
        workspaceId: workspace._id,
        name: tag,
        color: ["#c43e18", "#2f5d8a", "#5b7a3a", "#6b4fa0"][i % 4] ?? "#c43e18",
      });
      seeded.tags[tag] = created._id;
    }
    for (const [i, doc] of spec.docs.entries()) {
      clock = new Date(Date.now() - (doc.daysAgo ?? spec.docs.length - i) * DAY);
      const created = await repos.documents.create(ctx, {
        workspaceId: workspace._id,
        folderId: doc.folder ? (seeded.folders[doc.folder] ?? null) : null,
        type: doc.type ?? "notebook",
        title: doc.title,
      });
      seeded.docs[doc.title] = created._id;
      const tagIds = (doc.tags ?? []).flatMap((t) => seeded.tags[t] ?? []);
      if (tagIds.length > 0) await repos.documents.changeTags(ctx, created._id, { add: tagIds });
    }
    return seeded;
  });
}

/** A workspace with thousands of documents (the performance check). */
export async function seedBigWorkspace(count: number): Promise<string> {
  return withDb(async (conn) => {
    const user = await e2eUser(conn);
    const result = await seedBulkWorkspace(conn, {
      ownerId: user.userId,
      ownerEmail: user.email,
      count,
      name: `Bulk ${String(Date.now())}`,
    });
    return result.workspaceId;
  });
}

/** Opens the library on a workspace (the cookie the workspace switcher sets). */
export async function openWorkspace(page: Page, workspaceId: string, path = "/app") {
  await page
    .context()
    .addCookies([{ name: "pc_workspace", value: workspaceId, domain: "localhost", path: "/" }]);
  await page.goto(path);
  await expect(
    page.getByTestId("library-grid").or(page.getByTestId("library-empty")),
  ).toBeVisible();
}

export const card = (page: Page, title: string) =>
  page.getByTestId("library-grid").getByRole("gridcell", { name: title, exact: true });

export const titles = (page: Page) =>
  page
    .getByTestId("library-grid")
    .getByTestId("library-item")
    .evaluateAll((items) =>
      items.map(
        (item) =>
          item.getAttribute("aria-label") ??
          item.querySelector("[title]")?.getAttribute("title") ??
          "",
      ),
    );

/** A real mouse drag (dnd-kit starts after the pointer moves a few pixels). */
export async function drag(
  page: Page,
  from: ReturnType<Page["locator"]>,
  to: ReturnType<Page["locator"]>,
) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error("drag source or target is not visible");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height / 2 + 1, { steps: 2 });
  await page.mouse.up();
}

/** The shared e2e user's personal workspace. */
export async function personalWorkspaceId(): Promise<string> {
  return withDb(async (conn) => {
    const user = await e2eUser(conn);
    const workspace = await typedCollections(conn.db).workspaces.findOne({
      ownerId: user.userId,
      personal: true,
    });
    if (!workspace) throw new Error("the e2e user has no personal workspace");
    return workspace._id;
  });
}
