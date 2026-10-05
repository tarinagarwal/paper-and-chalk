"use client";

import { Check } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A labelled group of colour swatches plus a free colour picker (radio semantics). */
export function ColorChoice({
  label,
  name,
  value,
  options,
  onChange,
  allowCustom = true,
}: {
  label: string;
  name: string;
  value: string;
  options: readonly { color: string; label: string }[];
  onChange: (color: string) => void;
  allowCustom?: boolean;
}) {
  const known = options.some((o) => o.color.toLowerCase() === value.toLowerCase());
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {options.map((option) => {
          const checked = option.color.toLowerCase() === value.toLowerCase();
          return (
            <label
              key={option.color}
              title={option.label}
              className="relative flex size-7 cursor-pointer items-center justify-center rounded-full border shadow-sm has-checked:ring-2 has-checked:ring-ring has-checked:ring-offset-2 has-checked:ring-offset-background has-focus-visible:ring-2 has-focus-visible:ring-ring"
              style={{ background: option.color }}
            >
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={checked}
                onChange={() => {
                  onChange(option.color);
                }}
              />
              <span className="sr-only">{option.label}</span>
              {checked ? (
                <Check
                  aria-hidden
                  className="size-3.5 mix-blend-difference"
                  style={{ color: "#fff" }}
                />
              ) : null}
            </label>
          );
        })}
        {allowCustom ? (
          <label
            className={cn(
              "flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2 text-xs has-focus-visible:ring-2 has-focus-visible:ring-ring",
              !known && "ring-2 ring-ring ring-offset-2 ring-offset-background",
            )}
          >
            <input
              type="color"
              value={value}
              aria-label={`Custom ${label.toLowerCase()}`}
              onChange={(event) => {
                onChange(event.target.value);
              }}
              className="size-4 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            Custom
          </label>
        ) : null}
      </div>
    </fieldset>
  );
}

/** A number input with a label and a unit suffix. */
export function NumberField({
  id,
  label,
  value,
  unit,
  onChange,
  min,
  max,
  step = "any",
}: {
  id: string;
  label: string;
  value: string;
  unit?: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          className="h-9 w-full min-w-0 rounded-md border bg-background px-2.5 text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

export const selectClass =
  "h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
