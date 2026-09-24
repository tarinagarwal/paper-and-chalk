import { expect, test } from "@playwright/test";

import { AUTH_STATE } from "../playwright.config";
import { requestMagicLink, signIn, uniqueEmail } from "./helpers";

test.describe("signed out", () => {
  test("/app redirects to sign-in and keeps the requested URL", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Fapp$/);

    await page.goto("/app/doc/42?page=3");
    const url = new URL(page.url());
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("callbackUrl")).toBe("/app/doc/42?page=3");
  });

  test("protected API routes answer 401 JSON; health and auth stay open", async ({ request }) => {
    for (const path of ["/api/sync-token", "/api/not-a-route"]) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized", message: "Sign in to continue." });
    }
    expect((await request.get("/api/health")).status()).not.toBe(401);
    expect((await request.get("/api/auth/get-session")).status()).toBe(200);
  });
});

test.describe("magic link", () => {
  test("signs in, returns to the requested page, issues a sync token, signs out", async ({
    page,
  }) => {
    const email = uniqueEmail("flow");
    await page.goto("/app?from=e2e");
    await expect(page).toHaveURL(/callbackUrl=/);
    await signIn(page, email, page.url().replace(/^https?:\/\/[^/]+/, ""));
    await expect(page).toHaveURL(/\/app\?from=e2e$/);

    await page.getByTestId("user-menu").click();
    await expect(page.getByTestId("user-menu-email")).toHaveText(email);
    await page.keyboard.press("Escape");

    const res = await page.request.get("/api/sync-token");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { token: string; expiresAt: string };
    expect(body.token.split(".")).toHaveLength(3);
    const ttl = new Date(body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000);

    await page.getByTestId("user-menu").click();
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("a used link shows the expired state", async ({ page, browser }) => {
    const link = await requestMagicLink(page, uniqueEmail("reuse"));
    await page.goto(link);
    await expect(page).toHaveURL(/\/app$/);

    const other = await browser.newPage();
    await other.goto(link);
    await expect(other).toHaveURL(/\/sign-in\?.*error=INVALID_TOKEN/);
    await expect(other.getByTestId("sign-in-error")).toHaveAttribute("data-kind", "expired");
    await expect(other.getByText("That link has expired")).toBeVisible();
    await other.close();
  });

  test("the sixth link for one email in 15 minutes is refused", async ({ page }) => {
    const email = uniqueEmail("limit");
    for (let i = 0; i < 5; i++) await requestMagicLink(page, email);

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByTestId("magic-link-submit").click();
    await expect(page.getByTestId("sign-in-form-error")).toContainText("Too many attempts");
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe("signed in", () => {
  test.use({ storageState: AUTH_STATE });

  test("visiting /sign-in goes straight to the app", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("the user menu shows the account and switches theme", async ({ page }) => {
    await page.goto("/app");
    await page.getByTestId("user-menu").click();
    await expect(page.getByTestId("user-menu-email")).toHaveText("e2e-user@paperchalk.test");
    await page.getByRole("menuitemradio", { name: "Chalk" }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  });
});
