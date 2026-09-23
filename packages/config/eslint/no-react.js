// Blocks React (and anything that pulls it in) from framework-free packages like the engine.
const blocked = ["react", "react-dom", "next", "react/*", "react-dom/*", "next/*", "@radix-ui/*"];

/** @type {import("eslint").Linter.Config} */
export const noReact = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: blocked,
            message: "This package must stay framework-free: no React, React DOM or Next.js.",
          },
        ],
      },
    ],
  },
};
