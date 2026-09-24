import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${String(PORT)}`;
/** Not the dev stack's 8081, so e2e can run while `pnpm dev` is up. */
const WORKERS_PORT = 8182;
const WORKERS_BASE = `http://localhost:${String(WORKERS_PORT)}`;
const E2E_KEY_PREFIX = "test/e2e/";

/** Throwaway database and outbox, never the development ones. */
const E2E_MONGODB_PORT = 27027;
export const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ??
  `mongodb://127.0.0.1:${String(E2E_MONGODB_PORT)}/paper_chalk_e2e?directConnection=true`;
export const E2E_OUTBOX_DIR = fileURLToPath(new URL("./.data/e2e-outbox", import.meta.url));
export const AUTH_STATE = fileURLToPath(new URL("./e2e/.auth/user.json", import.meta.url));

/**
 * End-to-end tests run against a production build (`pnpm build` first). The server reads the
 * root .env for everything else; the values below win because dotenv never overrides.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // One production server behind every test: more workers than this starve it on a laptop and
  // make clicks land before hydration. CI's default is two as well.
  workers: 2,
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
  webServer: [
    {
      // A throwaway MongoDB (no Docker), started first so the app and workers can reach it.
      command: "node --import tsx e2e/test-mongo.ts",
      port: E2E_MONGODB_PORT,
      wait: { stdout: /test MongoDB ready/ },
      reuseExistingServer: !process.env.CI,
      // The first run downloads the MongoDB binary.
      timeout: 300_000,
      env: { E2E_MONGODB_PORT: String(E2E_MONGODB_PORT) },
    },
    {
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
        // Real dev buckets, but only under test/, which expires after a day.
        S3_KEY_PREFIX: E2E_KEY_PREFIX,
        WORKERS_URL: WORKERS_BASE,
      },
    },
    {
      // The workers verify uploads, so an upload can reach "ready" end to end.
      command: "node --env-file-if-exists=../../.env --import tsx src/index.ts",
      cwd: fileURLToPath(new URL("../workers", import.meta.url)),
      url: `${WORKERS_BASE}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        MONGODB_URI: E2E_MONGODB_URI,
        WORKERS_PORT: String(WORKERS_PORT),
      },
    },
  ],
});
