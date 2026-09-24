import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { AUTH_STATE } from "../playwright.config";

const publicPages = [
  "/",
  "/sign-in",
  "/sign-in?error=INVALID_TOKEN",
  "/sign-in/verify?email=maya%40example.com",
  "/missing-page",
];

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
}

for (const scheme of ["light", "dark"] as const) {
  for (const path of publicPages) {
    test(`${path} has no serious accessibility issues (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test.describe(`signed in (${scheme})`, () => {
    test.use({ storageState: AUTH_STATE });

    test(`/app and the user menu have no serious accessibility issues`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto("/app");
      expect(await seriousViolations(page)).toEqual([]);
      await page.getByTestId("user-menu").click();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
