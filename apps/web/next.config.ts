import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

// Validate env when the dev server or a build starts, so a missing variable fails immediately.
import "./src/env";

const nextConfig: NextConfig = {
  output: "standalone",
  // Trace files from the monorepo root so the standalone bundle includes workspace packages.
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@pc/schema", "@pc/db"],
  typedRoutes: true,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
