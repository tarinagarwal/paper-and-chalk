import { expect, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

test.describe("choosing a display name", () => {
  test("new users must name themselves before using the app", async ({ page }) => {
    await signIn(page, uniqueEmail("name"));
    await expect(page).toHaveURL(/\/app$/);

    const dialog = page.getByTestId("name-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "What should we call you?" })).toBeVisible();
    // The library itself is not rendered behind the dialog.
    await expect(page.getByRole("heading", { name: "Home", level: 1 })).toHaveCount(0);

    // Escape and clicks outside do not dismiss it, and there is no close button.
    await page.keyboard.press("Escape");
    await page.mouse.click(10, 10);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /close/i })).toHaveCount(0);

    // Collaboration is locked too.
    const locked = await page.request.get("/api/sync-token");
    expect(locked.status()).toBe(403);
    expect(await locked.json()).toMatchObject({ error: "profile_incomplete" });

    // Invalid names are refused with a message.
    await dialog.getByLabel("Your name").fill("---");
    await dialog.getByTestId("name-submit").click();
    await expect(dialog.getByRole("alert")).toHaveText("Use at least one letter or number");
    await expect(dialog).toBeVisible();

    // The preview follows the input, then saving closes the dialog.
    await dialog.getByLabel("Your name").fill("  Maya   Rao ");
    await expect(page.getByTestId("name-preview")).toContainText("Maya Rao");
    await dialog.getByTestId("name-submit").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();

    // The name shows in the account menu and in the sync identity, and survives a reload.
    await page.reload();
    await expect(page.getByTestId("name-dialog")).toHaveCount(0);
    await page.getByTestId("user-menu").click();
    await expect(page.getByTestId("user-menu-name")).toHaveText("Maya Rao");
    await page.keyboard.press("Escape");

    const res = await page.request.get("/api/sync-token");
    expect(res.status()).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { name: string };
    expect(payload.name).toBe("Maya Rao");
  });

  test("the server rejects blank names sent straight to the API", async ({ page }) => {
    await signIn(page, uniqueEmail("api-name"));
    await expect(page.getByTestId("name-dialog")).toBeVisible();

    const res = await page.request.post("/api/auth/update-user", {
      data: { name: "    " },
      headers: { origin: "http://localhost:3100" },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_NAME" });

    await page.reload();
    await expect(page.getByTestId("name-dialog")).toBeVisible();
  });

  test("users can sign out from the dialog", async ({ page }) => {
    await signIn(page, uniqueEmail("leave"));
    await page
      .getByTestId("name-dialog")
      .getByRole("button", { name: "Not you? Sign out" })
      .click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
