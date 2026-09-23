import { expect, test } from "@playwright/test";

test.describe("home page", () => {
  test("renders every section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Paper for notes");
    for (const id of [
      "doc-types-title",
      "feature-pdf-title",
      "feature-notebooks-title",
      "feature-ink-title",
      "feature-canvas-title",
      "feature-collaboration-title",
      "feature-audio-title",
      "feature-ai-title",
      "feature-study-title",
      "feature-present-title",
      "principles-title",
      "audiences-title",
      "pricing-title",
      "faq-title",
      "cta-title",
    ]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("hero-ink")).toBeVisible();
  });

  test("nav links jump to their sections", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Pricing" })
      .click();
    await expect(page).toHaveURL(/#pricing$/);
    await expect(page.locator("#pricing-title")).toBeInViewport();
  });

  test("Get started and Sign in go to /sign-in", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const header = page.getByRole("banner");
    await header.getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto("/");
    await header.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("pricing matches section 28 and switches currency", async ({ page }) => {
    await page.goto("/#pricing");
    await expect(page.getByTestId("price-free")).toHaveText("₹0");
    await expect(page.getByTestId("price-pro")).toHaveText("₹299");
    await expect(page.getByTestId("price-team")).toHaveText("₹499");
    await expect(page.getByTestId("plan-team")).toContainText("per seat");
    await expect(page.getByTestId("plan-education")).toContainText("Discounted Team");

    await page.getByTestId("currency-usd").click();
    await expect(page.getByTestId("price-free")).toHaveText("$0");
    await expect(page.getByTestId("price-pro")).toHaveText("$6");
    await expect(page.getByTestId("price-team")).toHaveText("$10");
  });

  test("FAQ answers open", async ({ page }) => {
    await page.goto("/#faq");
    const item = page.locator("details", { hasText: "Do you change my original PDF?" });
    const answer = item.getByText("The file you import is stored exactly as uploaded.");
    await expect(answer).toBeHidden();
    await item.locator("summary").click();
    await expect(item).toHaveAttribute("open", "");
    await expect(answer).toBeVisible();
  });

  test("mobile nav collapses into a menu", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.getByTestId("mobile-menu").click();
    const menu = page.getByRole("dialog");
    await expect(menu.getByRole("link", { name: "Features" })).toBeVisible();
    await menu.getByRole("link", { name: "Pricing" }).click();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/#pricing$/);
  });

  for (const width of [360, 768, 1280, 1920]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ["/", "/app", "/sign-in", "/missing-page"]) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});
