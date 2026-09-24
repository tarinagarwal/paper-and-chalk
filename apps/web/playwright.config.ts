import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${String(PORT)}`;

/** Throwaway database and outbox, never the development ones. */
export const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ?? "mongodb://localhost:27027/paper_chalk_e2e";
export const E2E_OUTBOX_DIR = fileURLToPath(new URL("./.data/e2e-outbox", import.meta.url));
export const AUTH_STATE = fileURLToPath(new URL("./e2e/.auth/user.json", import.meta.url));

/**
 * End-to-end tests run against a production build (`pnpm build` first). The server reads the
 * root .env for everything else; the values below win because dotenv never overrides.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `pnpm exec dotenv -e ../../.env -- next start --port ${String(PORT)}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_ENV: "ci",
      MONGODB_URI: E2E_MONGODB_URI,
      BETTER_AUTH_URL: baseURL,
      RATE_LIMIT_STORE: "memory",
      EMAIL_DELIVERY: "outbox",
      EMAIL_OUTBOX_DIR: E2E_OUTBOX_DIR,
    },
  },
});
