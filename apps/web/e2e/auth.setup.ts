import { expect, test as setup } from "@playwright/test";

import { AUTH_STATE } from "../playwright.config";
import { signIn } from "./helpers";

/** Signs one user in and saves the session for tests that need a signed-in page. */
setup("sign in the shared test user", async ({ page }) => {
  await signIn(page, "e2e-user@paperchalk.test");
  await expect(page).toHaveURL(/\/app$/);
  await page.context().storageState({ path: AUTH_STATE });
});
