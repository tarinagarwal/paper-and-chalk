import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Upload tests talk to the real dev buckets under a throwaway `test/` prefix. Locally the app's
// keys come from the root .env; CI provides bucket names and a short-lived role instead.
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Tests share one throwaway database server.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
