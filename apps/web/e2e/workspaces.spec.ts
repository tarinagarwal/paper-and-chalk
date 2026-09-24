import { createMongo, typedCollections } from "@pc/db";
import { expect, test } from "@playwright/test";

import { E2E_MONGODB_URI } from "../playwright.config";
import { chooseName, signIn, uniqueEmail } from "./helpers";

test("the first sign-in creates one personal workspace, and later ones reuse it", async ({
  browser,
}) => {
  const email = uniqueEmail("workspace");
  for (const firstTime of [true, false]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, email);
    if (firstTime) await chooseName(page, "Wren");
    else await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
    await context.close();
  }

  const conn = createMongo(E2E_MONGODB_URI, { appName: "paper-chalk-e2e", maxPoolSize: 1 });
  try {
    const c = typedCollections(conn.db);
    const user = await c.users.findOne({ email });
    expect(user).not.toBeNull();
    const userId = user?._id.toHexString() ?? "";
    const workspaces = await c.workspaces.find({ ownerId: userId }).toArray();
    expect(workspaces.map((w) => [w.name, w.personal])).toEqual([["Personal", true]]);
    const members = await c.workspaceMembers.find({ userId }).toArray();
    expect(members.map((m) => [m.workspaceId, m.role])).toEqual([[workspaces[0]?._id, "owner"]]);
  } finally {
    await conn.close();
  }
});
