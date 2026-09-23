"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CURRENCIES, DEFAULT_CURRENCY, formatPrice, plans, type Currency } from "@/content/pricing";
import { cn } from "@/lib/utils";

import { Tick } from "./section";

export function PricingPlans() {
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="eyebrow" id="currency-label">
          Currency
        </span>
        <div
          role="group"
          aria-labelledby="currency-label"
          className="flex rounded-lg border bg-card p-0.5"
        >
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={currency === c}
              onClick={() => {
                setCurrency(c);
              }}
              data-testid={`currency-${c.toLowerCase()}`}
              className="h-9 rounded-md px-3.5 font-mono text-xs text-ink-2 transition-colors hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {c === "INR" ? "₹ INR" : "$ USD"}
            </button>
          ))}
        </div>
      </div>

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <li
            key={plan.id}
            data-testid={`plan-${plan.id}`}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-card p-6",
              plan.featured && "border-[1.5px] border-foreground shadow-float",
            )}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-[1.75rem] leading-none">{plan.name}</h3>
              {plan.featured ? (
                <span className="rounded-full bg-foreground px-2.5 py-1 font-mono text-[10px] tracking-wide text-background uppercase">
                  For individuals
                </span>
              ) : null}
            </div>
            <p className="mt-3 min-h-10 text-sm leading-snug text-muted-foreground">
              {plan.audience}
            </p>

            <div className="mt-6 flex flex-col justify-end border-b pb-5">
              {plan.price ? (
                <p className="flex flex-col gap-1.5">
                  <span
                    className="font-display text-[2.75rem] leading-none tracking-[-0.02em]"
                    data-testid={`price-${plan.id}`}
                  >
                    {formatPrice(plan.price[currency], currency)}
                  </span>
                  <span className="text-sm text-muted-foreground">{plan.unit}</span>
                </p>
              ) : (
                <p className="flex flex-col gap-1.5">
                  <span className="flex h-[2.75rem] items-end font-display text-[1.75rem] leading-none">
                    {plan.priceLabel}
                  </span>
                  <span className="text-sm text-muted-foreground">{plan.unit}</span>
                </p>
              )}
            </div>

            <ul className="mt-5 flex flex-1 flex-col gap-3">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2.5 text-[0.9375rem] leading-snug">
                  <Tick className="mt-0.5 text-primary" />
                  {f}
                </li>
              ))}
            </ul>

            <Button
              asChild
              variant={plan.featured ? "default" : "outline"}
              className="mt-7 h-11 text-[0.9375rem]"
            >
              <Link href="/sign-in">{plan.cta}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
