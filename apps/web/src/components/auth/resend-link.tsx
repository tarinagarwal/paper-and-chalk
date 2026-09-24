"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ResendLink({ email, callbackUrl }: { email: string; callbackUrl: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    setState("sending");
    setError(null);
    const result = await authClient.signIn.magicLink({
      email,
      callbackURL: callbackUrl,
      newUserCallbackURL: callbackUrl,
      errorCallbackURL: `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    });
    if (result.error) {
      setState("idle");
      setError(
        result.error.status === 429
          ? (result.error.message ?? "Too many attempts. Try again later.")
          : "We couldn't send another link. Try again in a moment.",
      );
      return;
    }
    setState("sent");
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 bg-card text-[0.9375rem]"
        disabled={state === "sending"}
        onClick={() => {
          void resend();
        }}
        data-testid="resend-link"
      >
        {state === "sending" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {state === "sent" ? "Sent. Check your inbox again" : "Send the link again"}
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </div>
  );
}
