import { expect, test, type Page } from "@playwright/test";

const sidebar = (page: Page) => page.locator('[data-slot="sidebar"][data-state]');

test.describe("app shell", () => {
  test("desktop shows the full sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
    await expect(sidebar(page)).toHaveAttribute("data-state", "expanded");
  });

  test("tablet collapses the sidebar to icons", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/app");
    await expect(sidebar(page)).toHaveAttribute("data-state", "collapsed");
    await page.getByTestId("sidebar-trigger").click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "expanded");
  });

  test("phone hides the sidebar behind a sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByTestId("sidebar-trigger").click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Home" })).toBeVisible();
  });
});
