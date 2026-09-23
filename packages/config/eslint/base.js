// Shared flat config: type-aware TypeScript rules for every package.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/** @param {{ tsconfigRootDir: string }} options */
export function base({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: ["**/dist/**", "**/.next/**", "**/coverage/**", "**/drizzle/**", "**/next-env.d.ts"],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
        "no-console": ["error", { allow: ["warn", "error", "info"] }],
      },
    },
    {
      files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  );
}
