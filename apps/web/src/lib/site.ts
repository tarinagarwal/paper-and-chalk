import { env } from "@/env";

// NEXT_PUBLIC_* values are inlined at build time, so this must be set even when a build skips
// validation of server-only variables.
const url = env.NEXT_PUBLIC_SITE_URL as string | undefined;
if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is not set. Add it to .env (see .env.example).");

export const site = {
  name: "Paper & Chalk",
  tagline: "Paper for notes, chalk for ideas.",
  description:
    "Mark up PDFs, fill notebooks and sketch on an infinite board, in one document, with ink that feels like a real pen and everyone on the page at once.",
  url,
} as const;
