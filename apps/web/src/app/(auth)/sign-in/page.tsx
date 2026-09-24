import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";
import { googleSignInEnabled } from "@/env";
import { getSession } from "@/lib/auth";
import { authErrorMessage } from "@/lib/auth-errors";
import { safeCallbackUrl } from "@/lib/callback-url";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);

  // Already signed in: go straight to where they were headed (unless showing an error).
  if (!params.error && (await getSession())) redirect(callbackUrl);

  return (
    <AuthShell>
      <SignInForm
        callbackUrl={callbackUrl}
        googleEnabled={googleSignInEnabled}
        initialError={authErrorMessage(params.error)}
      />
    </AuthShell>
  );
}
