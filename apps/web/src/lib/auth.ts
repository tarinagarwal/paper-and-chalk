import "server-only";

import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { headers } from "next/headers";
import { cache as perRequest } from "react";

import { env, googleSignInEnabled } from "@/env";
import { magicLinkEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";
import {
  clientIp,
  consume,
  MemoryStore,
  rateLimits,
  UpstashStore,
  type RateLimitRule,
  type RateLimitStore,
} from "@/lib/rate-limit";
import { getMongo, getUpstash } from "@/lib/server/clients";

const MAGIC_LINK_TTL_MINUTES = 15;

let limiterStore: RateLimitStore | undefined;
function limiter(): RateLimitStore {
  limiterStore ??=
    env.RATE_LIMIT_STORE === "memory" ? new MemoryStore() : new UpstashStore(getUpstash());
  return limiterStore;
}

async function enforce(rule: RateLimitRule, subject: string): Promise<void> {
  const result = await consume(limiter(), rule, subject);
  if (!result.allowed) {
    throw new APIError(
      "TOO_MANY_REQUESTS",
      {
        code: "RATE_LIMITED",
        message: `Too many attempts. Try again in ${String(Math.ceil(result.retryAfterSeconds / 60))} minutes.`,
        retryAfterSeconds: result.retryAfterSeconds,
      },
      { "Retry-After": String(result.retryAfterSeconds) },
    );
  }
}

/**
 * Better Auth (SPEC.md section 4). Google OAuth and email magic links, stored in MongoDB.
 * Sessions live in the `session` collection; a signed cookie caches them for five minutes so the
 * request proxy can check most requests without a database round trip.
 */
function createAuth() {
  return betterAuth({
    appName: "Paper & Chalk",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_SITE_URL],
    database: mongodbAdapter(getMongo().db),
    telemetry: { enabled: false },

    user: {
      // Extra columns from SPEC.md section 3, set by the server only.
      additionalFields: {
        plan: { type: "string", defaultValue: "free", input: false },
        storageUsedBytes: { type: "number", defaultValue: 0, input: false },
        settings: { type: "json", defaultValue: {}, input: false },
      },
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    account: {
      // Signing in with Google links to an existing magic-link account with the same (verified)
      // email instead of creating a second user.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },

    ...(googleSignInEnabled
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID ?? "",
              clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
              prompt: "select_account" as const,
            },
          },
        }
      : {}),

    // Our Redis-backed limiter below replaces Better Auth's per-instance memory limiter.
    rateLimit: { enabled: false },

    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const isMagicLink = ctx.path === "/sign-in/magic-link";
        const isSocial = ctx.path === "/sign-in/social";
        if (!isMagicLink && !isSocial) return;

        const ip = clientIp(ctx.headers ?? new Headers());
        await enforce(rateLimits.signInPerIp, ip);
        if (isMagicLink) {
          await enforce(rateLimits.magicLinkPerIp, ip);
          const body = ctx.body as { email?: unknown } | undefined;
          if (typeof body?.email === "string") {
            await enforce(rateLimits.magicLinkPerEmail, body.email);
          }
        }
      }),
    },

    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_TTL_MINUTES * 60,
        async sendMagicLink({ email, url }) {
          await sendEmail({
            to: email,
            link: url,
            ...magicLinkEmail({ url, expiresInMinutes: MAGIC_LINK_TTL_MINUTES }),
          });
        },
      }),
      // Must be last: lets server actions set auth cookies.
      nextCookies(),
    ],

    advanced: {
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
  });
}

const cache = globalThis as typeof globalThis & { __pcAuth?: ReturnType<typeof createAuth> };

/**
 * The Better Auth instance, created on first use so that building the app (which imports this
 * module) never needs runtime secrets or a database.
 */
export function getAuth(): ReturnType<typeof createAuth> {
  cache.__pcAuth ??= createAuth();
  return cache.__pcAuth;
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
export type SessionUser = Session["user"];

/** The current session in a server component or route handler, cached per request. */
export const getSession = perRequest(async (): Promise<Session | null> => {
  // Read the request first: it marks the route dynamic before anything touches the database.
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

export const magicLinkTtlMinutes = MAGIC_LINK_TTL_MINUTES;
