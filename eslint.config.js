// Root-level files only (scripts, tool configs). Apps and packages have their own configs.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["apps/**", "packages/**", "**/node_modules/**", ".turbo/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: globals.node },
  },
];
