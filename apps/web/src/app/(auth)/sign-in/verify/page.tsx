import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResendLink } from "@/components/auth/resend-link";
import { env } from "@/env";
import { magicLinkTtlMinutes } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/callback-url";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false, follow: false },
};

const devHints = {
  console: "Development: the link is printed in the terminal running pnpm dev.",
  outbox: "Development: the link is saved to the email outbox folder.",
  smtp: null,
} as const;

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const email = params.email?.trim();
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  if (!email) redirect(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`);

  const hint = devHints[env.EMAIL_DELIVERY];

  return (
    <AuthShell>
      <div className="flex flex-col gap-6">
        <Envelope />
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-[2rem] leading-tight tracking-[-0.015em]">
            Check your inbox
          </h1>
          <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
            We sent a sign-in link to{" "}
            <span className="font-medium text-foreground" data-testid="verify-email">
              {email}
            </span>
            . It works once and expires in {magicLinkTtlMinutes} minutes.
          </p>
        </div>
        {hint ? (
          <p className="rounded-lg border border-dashed bg-surface-2 px-3 py-2 font-mono text-xs text-ink-2">
            {hint}
          </p>
        ) : null}
        <ResendLink email={email} callbackUrl={callbackUrl} />
        <Link
          href={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="text-sm text-ink-2 underline-offset-4 hover:text-foreground hover:underline"
        >
          Use a different email
        </Link>
      </div>
    </AuthShell>
  );
}

function Envelope() {
  return (
    <svg viewBox="0 0 96 64" className="h-14 w-auto" aria-hidden>
      <rect
        x="4"
        y="8"
        width="80"
        height="52"
        rx="4"
        className="fill-paper-sheet stroke-line-strong"
      />
      <path
        d="M6 12 L44 40 L82 12"
        fill="none"
        className="stroke-line-strong"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="80" cy="12" r="9" className="fill-primary" />
      <path
        d="M76 12.5 L79 15.5 L84.5 9.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
