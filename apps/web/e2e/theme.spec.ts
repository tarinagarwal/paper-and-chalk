import { expect, test } from "@playwright/test";

interface Recorded {
  __firstClass?: string;
}

test.describe("theme", () => {
  test("toggle switches to Chalk and persists across reloads without a flash", async ({ page }) => {
    // Record the html class at DOMContentLoaded, before React hydrates.
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as Recorded).__firstClass = document.documentElement.className;
      });
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

    // System → Paper → Chalk.
    const toggle = page.getByTestId("theme-toggle").first();
    await expect(toggle).toHaveAttribute("data-theme-choice", "system");
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-theme-choice", "light");
    await toggle.click();
    await expect(toggle).toHaveAttribute("data-theme-choice", "dark");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    await page.reload();
    const firstClass = await page.evaluate(() => (window as Recorded).__firstClass);
    expect(firstClass).toMatch(/\bdark\b/);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(20, 21, 23)");
  });

  test("system follows the OS setting", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });
});
