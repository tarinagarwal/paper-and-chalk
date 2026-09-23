"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const order = ["light", "dark", "system"] as const;
type ThemeChoice = (typeof order)[number];
const names: Record<ThemeChoice, string> = { light: "Paper", dark: "Chalk", system: "System" };

const isChoice = (v: string | undefined): v is ThemeChoice =>
  v !== undefined && (order as readonly string[]).includes(v);

// The stored theme is only known in the browser; render the neutral state on the server.
const subscribe = () => () => undefined;
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

/** Cycles Paper (light) → Chalk (dark) → System. Tiny on purpose: it ships on every page. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const current: ThemeChoice = hydrated && isChoice(theme) ? theme : "system";
  const next = order[(order.indexOf(current) + 1) % order.length] ?? "light";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className={cn("text-ink-2 hover:text-foreground", className)}
      aria-label={`Theme: ${names[current]}. Switch to ${names[next]}.`}
      title={`Theme: ${names[current]}`}
      data-testid="theme-toggle"
      data-theme-choice={current}
      onClick={() => {
        setTheme(next);
      }}
    >
      {current === "system" ? (
        <Laptop className="size-[18px]" aria-hidden />
      ) : current === "dark" ? (
        <Moon className="size-[18px]" aria-hidden />
      ) : (
        <Sun className="size-[18px]" aria-hidden />
      )}
    </Button>
  );
}
