import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * The Paper & Chalk mark: a sheet of paper resting on a chalkboard, crossed by one handwritten
 * ampersand that is graphite on the paper and chalk on the board, ending at a red-pencil tip.
 */
const AMPERSAND =
  "M49 33 C 44 44, 33 52, 24 51 C 15 50, 15 39, 25 32 C 34 26, 36 17, 30 14 C 24 11, 19 17, 23 25 C 28 35, 39 45, 51 51";
const PAPER = "0,0 64,0 64,18 0,50";
const BOARD = "0,50 64,18 64,64 0,64";

export interface LogoMarkProps {
  className?: string;
  /** Thicker stroke that stays legible at 16–24 px. */
  compact?: boolean;
  title?: string;
}

export function LogoMark({ className, compact = false, title }: LogoMarkProps) {
  const id = useId().replace(/:/g, "");
  const clip = { square: `${id}-sq`, paper: `${id}-p`, board: `${id}-b` };

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <clipPath id={clip.square}>
          <rect width="64" height="64" rx="15" />
        </clipPath>
        <clipPath id={clip.paper}>
          <polygon points={PAPER} />
        </clipPath>
        <clipPath id={clip.board}>
          <polygon points={BOARD} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip.square})`}>
        <rect width="64" height="64" fill="#fffdf8" />
        <polygon points={BOARD} fill="#1c1b19" />
      </g>
      <rect
        x=".75"
        y=".75"
        width="62.5"
        height="62.5"
        rx="14.25"
        fill="none"
        className="stroke-logo-edge"
        strokeWidth="1.5"
      />
      <g fill="none" strokeWidth={compact ? 7 : 5.5} strokeLinecap="round" strokeLinejoin="round">
        <path clipPath={`url(#${clip.paper})`} stroke="#1c1b19" d={AMPERSAND} />
        <path clipPath={`url(#${clip.board})`} stroke="#ece7dc" d={AMPERSAND} />
      </g>
      <circle cx="51" cy="51" r="4.3" fill="#c43e18" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display tracking-[-0.01em] whitespace-nowrap", className)}>
      Paper <span className="text-primary italic">&amp;</span> Chalk
    </span>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-7", markClassName)} compact />
      <Wordmark className="text-[1.3125rem] leading-none" />
    </span>
  );
}
