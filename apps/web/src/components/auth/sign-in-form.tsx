"use client";

import { AlertCircle, Clock3, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuthErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

import { GoogleIcon } from "./google-icon";

type Pending = "google" | "email" | null;

export function SignInForm({
  callbackUrl,
  googleEnabled,
  initialError,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  initialError: AuthErrorMessage | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const errorCallbackURL = `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  const signInWithGoogle = async () => {
    setPending("google");
    setError(null);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackUrl,
      errorCallbackURL,
    });
    // On success the browser is already navigating to Google.
    if (result.error) {
      setPending(null);
      setError(result.error.message ?? "Google sign-in is unavailable right now.");
    }
  };

  const sendMagicLink = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending("email");
    setError(null);
    const address = email.trim();
    const result = await authClient.signIn.magicLink({
      email: address,
      callbackURL: callbackUrl,
      newUserCallbackURL: callbackUrl,
      errorCallbackURL,
    });
    if (result.error) {
      setPending(null);
      setError(
        result.error.status === 429
          ? (result.error.message ?? "Too many attempts. Try again later.")
          : "We couldn't send the link. Check the address and try again.",
      );
      return;
    }
    const next = new URLSearchParams({ email: address, callbackUrl });
    router.push(`/sign-in/verify?${next.toString()}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-[2rem] leading-tight tracking-[-0.015em]">Sign in</h1>
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
          New here? The same steps create your account.
        </p>
      </div>

      {initialError ? (
        <div
          role="alert"
          data-testid="sign-in-error"
          data-kind={initialError.kind}
          className={cn(
            "flex gap-3 rounded-xl border p-3.5 text-sm",
            initialError.kind === "expired"
              ? "border-pen-ochre/40 bg-pen-ochre/10"
              : "border-destructive/30 bg-destructive/5",
          )}
        >
          {initialError.kind === "expired" ? (
            <Clock3 className="mt-0.5 size-4 shrink-0 text-pen-ochre" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          )}
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">{initialError.title}</p>
            <p className="text-muted-foreground">{initialError.body}</p>
          </div>
        </div>
      ) : null}

      {googleEnabled ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2.5 bg-card text-[0.9375rem]"
            disabled={pending !== null}
            onClick={() => {
              void signInWithGoogle();
            }}
            data-testid="google-sign-in"
          >
            {pending === "google" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <GoogleIcon className="size-[18px]" />
            )}
            Continue with Google
          </Button>
          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-border" />
            <span className="eyebrow">or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form
        onSubmit={(e) => {
          void sendMagicLink(e);
        }}
        className="flex flex-col gap-3"
        noValidate={false}
      >
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          disabled={pending !== null}
          className="h-11 bg-background text-[0.9375rem]"
          aria-describedby={error ? "sign-in-form-error" : undefined}
        />
        <Button
          type="submit"
          className="h-11 text-[0.9375rem]"
          disabled={pending !== null || email.trim() === ""}
          data-testid="magic-link-submit"
        >
          {pending === "email" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Email me a sign-in link
        </Button>
        {error ? (
          <p
            id="sign-in-form-error"
            role="alert"
            className="text-sm text-destructive"
            data-testid="sign-in-form-error"
          >
            {error}
          </p>
        ) : null}
      </form>

      <p className="text-xs leading-relaxed text-muted-foreground">
        We&rsquo;ll email you a link that signs you in with one click. No password to remember.
      </p>
    </div>
  );
}
