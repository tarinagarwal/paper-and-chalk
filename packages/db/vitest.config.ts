import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Tests share one throwaway database.
    fileParallelism: false,
  },
});
