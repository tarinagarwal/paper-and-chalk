import { cn } from "@/lib/utils";

export function SectionIntro({
  eyebrow,
  title,
  body,
  id,
  className,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  id?: string;
  className?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-4",
        align === "center" && "mx-auto items-center text-center",
        className,
      )}
    >
      <p className="eyebrow">{eyebrow}</p>
      <h2
        id={id}
        className="font-display text-[2.125rem] leading-[1.08] tracking-[-0.018em] text-balance sm:text-h2"
      >
        {title}
      </h2>
      {body ? (
        <p className="text-[1.0625rem] leading-relaxed text-pretty text-ink-2 sm:text-lead">
          {body}
        </p>
      ) : null}
    </div>
  );
}

/** A hand-drawn tick, used for feature and plan lists. */
export function Tick({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4 shrink-0", className)}>
      <path
        d="M2.5 8.6 C 4 9.6, 5.2 11, 6.2 12.6 C 8.2 8.4, 10.6 5.4, 13.8 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
