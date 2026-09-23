import base from "@pc/config/prettier";

/** @type {import("prettier").Config} */
export default {
  ...base,
  plugins: ["prettier-plugin-tailwindcss"],
  tailwindStylesheet: "./apps/web/src/app/globals.css",
  tailwindFunctions: ["cn", "cva"],
};
