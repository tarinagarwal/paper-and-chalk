import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

describe("@pc/engine", () => {
  it("loads", async () => {
    await expect(import("./index")).resolves.toBeDefined();
  });

  it("does not depend on React or Next.js", () => {
    const deps = Object.keys({
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    });
    const framework = deps.filter((d) => /^(react|react-dom|next)$|^@radix-ui\//.test(d));
    expect(framework).toEqual([]);
  });
});
