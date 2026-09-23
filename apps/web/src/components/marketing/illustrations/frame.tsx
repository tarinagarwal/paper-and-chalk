import { cn } from "@/lib/utils";

/** The dotted desk every illustration sits on. */
export function IllustrationFrame({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <figure
      aria-label={label}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-canvas-dots p-5 sm:p-8",
        className,
      )}
    >
      {children}
    </figure>
  );
}
