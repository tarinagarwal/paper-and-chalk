import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The verifyAsset test uses a throwaway MongoDB (started by the global setup) and the real dev
// buckets under `test/`.
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
