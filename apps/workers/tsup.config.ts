import { defineConfig } from "tsup";

export default defineConfig({
  // index: the HTTP server (local dev). lambda: the SQS handler (deployed).
  entry: ["src/index.ts", "src/lambda.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Workspace packages ship TypeScript source, so bundle them in.
  noExternal: [/^@pc\//],
});
