import { expect, test, type Page } from "@playwright/test";

const runningAnimations = (page: Page) =>
  page.getByTestId("hero-ink").evaluate((svg) =>
    Array.from(svg.querySelectorAll("*"))
      .map((el) => getComputedStyle(el).animationName)
      .filter((name) => name !== "none"),
  );

test("ink animation plays by default", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  expect((await runningAnimations(page)).length).toBeGreaterThan(5);
});

test("ink animation stops with reduced motion, leaving the finished drawing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  expect(await runningAnimations(page)).toEqual([]);
  // The red-pencil circle is fully drawn.
  const offset = await page
    .getByTestId("hero-ink")
    .locator("path[stroke='#c43e18']")
    .evaluate((el) => getComputedStyle(el).strokeDashoffset);
  expect(offset).toBe("0px");
});
