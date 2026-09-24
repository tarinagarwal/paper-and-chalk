"use client";

import { DISPLAY_NAME_MAX_LENGTH, displayNameSchema, presenceColor } from "@pc/schema";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const preventDismiss = (event: Event) => {
  event.preventDefault();
};

/**
 * Shown to signed-in users without a display name. It cannot be closed: no close button, and
 * Escape and outside clicks are ignored. The only ways out are saving a name or signing out.
 */
export function NameDialog({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const color = presenceColor(userId);
  const preview = name.trim().replace(/\s+/g, " ");

  const save = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid name");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await authClient.updateUser({ name: parsed.data });
    if (result.error) {
      setSaving(false);
      setError(result.error.message ?? "We couldn't save your name. Try again.");
      return;
    }
    toast.success(`Welcome, ${parsed.data}`);
    // The layout re-renders with the new name and stops showing this dialog.
    router.refresh();
  };

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={preventDismiss}
        onPointerDownOutside={preventDismiss}
        onInteractOutside={preventDismiss}
        className="gap-6 sm:max-w-md"
        data-testid="name-dialog"
      >
        <DialogHeader className="gap-2">
          <DialogTitle className="font-display text-[1.75rem] leading-tight font-normal tracking-[-0.015em]">
            What should we call you?
          </DialogTitle>
          <DialogDescription className="text-[0.9375rem] leading-relaxed">
            This is the name people see on your cursor, your comments and anything you share.
          </DialogDescription>
        </DialogHeader>

        <div
          aria-hidden
          className="relative h-24 overflow-hidden rounded-xl border bg-canvas-dots"
          data-testid="name-preview"
        >
          <div className="absolute top-7 left-[38%] flex flex-col items-start">
            <svg viewBox="0 0 16 18" className="size-4">
              <path
                d="M1 1 L15 8.6 L8.6 10.2 L5.6 16.8 Z"
                fill={color}
                stroke="#fff"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="ml-3 max-w-56 truncate rounded-md px-2 py-0.5 text-xs font-medium text-white"
              style={{ background: color }}
            >
              {preview || "Your name"}
            </span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            void save(e);
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="display-name" className="text-sm font-medium">
            Your name
          </label>
          <Input
            id="display-name"
            name="name"
            autoComplete="name"
            autoFocus
            required
            maxLength={DISPLAY_NAME_MAX_LENGTH + 10}
            placeholder="e.g. Maya Rao"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            disabled={saving}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "display-name-error" : undefined}
            className="h-11 text-[0.9375rem]"
          />
          {error ? (
            <p id="display-name-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="mt-1 h-11 text-[0.9375rem]"
            disabled={saving || preview === ""}
            data-testid="name-submit"
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Continue
          </Button>
        </form>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground sm:justify-between">
          <span className="min-w-0 truncate">Signed in as {email}</span>
          <button
            type="button"
            onClick={() => {
              void signOut();
            }}
            disabled={signingOut}
            className="shrink-0 underline-offset-4 hover:text-foreground hover:underline"
          >
            Not you? Sign out
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
