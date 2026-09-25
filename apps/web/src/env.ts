import { storageEnv } from "@pc/storage";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const secret = z.string().min(32, "must be at least 32 characters");

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /**
     * Where this build runs. Staging and production enforce real email, Upstash rate limiting
     * and Google sign-in; local and ci allow the console/outbox/memory stand-ins.
     */
    APP_ENV: z.enum(["local", "ci", "staging", "production"]).default("local"),

    MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, "must be a mongodb:// URI"),

    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    RATE_LIMIT_STORE: z.enum(["upstash", "memory"]).default("upstash"),

    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    EMAIL_DELIVERY: z.enum(["console", "outbox", "smtp"]).default("console"),
    EMAIL_OUTBOX_DIR: z.string().default(".data/outbox"),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).default("Paper & Chalk <no-reply@localhost>"),

    SYNC_JWT_SECRET: secret,
    /** Shared with the custom-domain edge proxy, which uses it to vouch for the client IP. */
    EDGE_PROXY_SECRET: secret.optional(),

    ...storageEnv,

    /** Local dev: background jobs go to the workers over HTTP. */
    WORKERS_URL: z.url().default("http://localhost:8081"),
    /** Deployed: background jobs go to this SQS queue (the workers run on AWS Lambda). */
    JOBS_QUEUE_URL: z.url().optional(),

    /** The git SHA this build came from (baked into the image); shown by /api/health. */
    RELEASE: z.string().min(1).default("dev"),
  },
  client: {
    /** Public origin of the site, used for canonical URLs, sitemap and Open Graph. */
    NEXT_PUBLIC_SITE_URL: z.url(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((env, ctx) => {
      if (!isServer) return;
      const issue = (path: string, message: string) => {
        ctx.addIssue({ code: "custom", path: [path], message });
      };
      const deployed = env.APP_ENV === "staging" || env.APP_ENV === "production";

      if (env.EMAIL_DELIVERY === "smtp") {
        for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const) {
          if (!env[key]) issue(key, "required when EMAIL_DELIVERY=smtp");
        }
      }
      if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
        issue(
          "GOOGLE_CLIENT_SECRET",
          "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
        );
      }
      if (deployed) {
        if (env.EMAIL_DELIVERY !== "smtp")
          issue("EMAIL_DELIVERY", `must be smtp in ${env.APP_ENV}`);
        if (env.RATE_LIMIT_STORE !== "upstash") {
          issue("RATE_LIMIT_STORE", `must be upstash in ${env.APP_ENV}`);
        }
        if (!env.JOBS_QUEUE_URL) issue("JOBS_QUEUE_URL", `required in ${env.APP_ENV}`);
      }
      // Staging may run before its Google OAuth client exists; production may not.
      if (env.APP_ENV === "production") {
        if (!env.GOOGLE_CLIENT_ID) issue("GOOGLE_CLIENT_ID", "required in production");
      }
    }),
  emptyStringAsUndefined: true,
  // Docker image builds have no runtime secrets; the container validates at startup instead.
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
});

export const googleSignInEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
