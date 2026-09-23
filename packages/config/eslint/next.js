// Next.js app config: base rules plus Next and React hooks rules.
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

import { base } from "./base.js";

/** @param {{ tsconfigRootDir: string }} options */
export function next({ tsconfigRootDir }) {
  return tseslint.config(...base({ tsconfigRootDir }), {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
    },
  });
}
